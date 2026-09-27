//! # GapGuard
//!
//! Weekend gap-risk model for tokenized stocks, written for Arbitrum Stylus.
//!
//! Afterglow's `PhaselockOracle` knows *when* the equity market is closed. GapGuard knows
//! *how far* a stock tends to jump between Friday's last print and Monday's first print, and
//! turns that into the loan-to-value a position may carry into a weekend.
//!
//! For each asset it keeps an exponentially weighted moving variance (EWMA, RiskMetrics style)
//! of observed weekend gaps. The gap buffer is `z × σ`, clamped to `[min, max]`, and the safe
//! weekend LTV is the liquidation LTV shrunk by that buffer: a position entering the weekend at
//! that LTV survives a `z`-sigma gap without becoming liquidatable. Until enough weekends have
//! been observed the model answers with the maximum buffer.
//!
//! Gaps are recorded by the owner or an approved recorder (a keeper that reads the Chainlink
//! round history), one at a time or in batches for backfilling.
#![cfg_attr(not(any(test, feature = "export-abi")), no_main)]
extern crate alloc;

use alloc::vec::Vec;

use alloy_primitives::{Address, U256};
use alloy_sol_types::sol;
use openzeppelin_stylus::access::ownable::{self, IOwnable, Ownable};
use stylus_sdk::{
    prelude::*,
    storage::{StorageBool, StorageMap, StorageU256, StorageU32},
};

const BPS: u32 = 10_000;
/// Variance is stored in bps² scaled by this factor so small gaps keep precision.
const VAR_SCALE: u64 = 1_000_000;
/// √VAR_SCALE, used to bring σ back to bps.
const SIGMA_SCALE: u64 = 1_000;

sol! {
    event GapRecorded(address indexed asset, int32 gapBps, uint32 sigmaBps, uint32 observations);
    event ParamsSet(uint32 lambdaBps, uint32 zTimes100, uint32 minBufferBps, uint32 maxBufferBps, uint32 minObservations);
    event RecorderSet(address indexed recorder, bool allowed);

    #[derive(Debug)]
    error NotRecorder(address account);
    #[derive(Debug)]
    error GapOutOfRange(int32 gapBps);
    #[derive(Debug)]
    error InvalidParams();
    #[derive(Debug)]
    error AlreadyInitialized();
}

#[derive(SolidityError, Debug)]
pub enum Error {
    UnauthorizedAccount(ownable::OwnableUnauthorizedAccount),
    InvalidOwner(ownable::OwnableInvalidOwner),
    NotRecorder(NotRecorder),
    GapOutOfRange(GapOutOfRange),
    InvalidParams(InvalidParams),
    AlreadyInitialized(AlreadyInitialized),
}

impl From<ownable::Error> for Error {
    fn from(e: ownable::Error) -> Self {
        match e {
            ownable::Error::UnauthorizedAccount(x) => Error::UnauthorizedAccount(x),
            ownable::Error::InvalidOwner(x) => Error::InvalidOwner(x),
        }
    }
}

#[entrypoint]
#[storage]
pub struct GapGuard {
    ownable: Ownable,
    recorders: StorageMap<Address, StorageBool>,
    /// EWMA variance of weekend gaps, bps² × VAR_SCALE.
    variance: StorageMap<Address, StorageU256>,
    observations: StorageMap<Address, StorageU32>,
    /// Decay per observation, bps (9_000 = 0.90).
    lambda_bps: StorageU32,
    /// Confidence multiplier × 100 (300 = 3σ).
    z_times_100: StorageU32,
    min_buffer_bps: StorageU32,
    max_buffer_bps: StorageU32,
    min_observations: StorageU32,
}

#[public]
#[implements(IOwnable)]
impl GapGuard {
    /// One-time setup. A plain function rather than a Stylus constructor because Robinhood Chain
    /// mainnet has no StylusDeployer; deploy and initialize in consecutive transactions and check
    /// `owner()` afterwards.
    pub fn initialize(&mut self, owner: Address) -> Result<(), Error> {
        if !self.ownable.owner().is_zero() {
            return Err(Error::AlreadyInitialized(AlreadyInitialized {}));
        }
        self.ownable.constructor(owner)?;
        self.set(9_000, 300, 500, 5_000, 8)
    }

    // ------------------------------------------------------------------
    // Model reads
    // ------------------------------------------------------------------

    /// Current EWMA volatility of weekend gaps, in bps.
    pub fn sigma_bps(&self, asset: Address) -> u32 {
        // Variance is bounded by 10_000² × VAR_SCALE = 1e14, so it fits in u128.
        let var: u128 = self.variance.get(asset).try_into().unwrap_or(u128::MAX);
        let sigma = isqrt(var) / SIGMA_SCALE as u128;
        sigma.try_into().unwrap_or(u32::MAX)
    }

    pub fn observation_count(&self, asset: Address) -> u32 {
        self.observations.get(asset).to::<u32>()
    }

    /// Price drop, in bps, that a weekend position must be able to absorb.
    pub fn gap_buffer_bps(&self, asset: Address) -> u32 {
        let max = self.max_buffer_bps.get().to::<u32>();
        if self.observation_count(asset) < self.min_observations.get().to::<u32>() {
            return max;
        }
        let min = self.min_buffer_bps.get().to::<u32>();
        let z = self.z_times_100.get().to::<u64>();
        let raw = (self.sigma_bps(asset) as u64).saturating_mul(z) / 100;
        (raw.min(max as u64) as u32).max(min)
    }

    /// Highest LTV a position may carry into the weekend so that a `z`-sigma gap still leaves it
    /// below `liq_ltv_bps`.
    pub fn weekend_ltv_bps(&self, asset: Address, liq_ltv_bps: u16) -> u16 {
        let buffer = self.gap_buffer_bps(asset).min(BPS);
        ((liq_ltv_bps as u32) * (BPS - buffer) / BPS) as u16
    }

    pub fn params(&self) -> (u32, u32, u32, u32, u32) {
        (
            self.lambda_bps.get().to::<u32>(),
            self.z_times_100.get().to::<u32>(),
            self.min_buffer_bps.get().to::<u32>(),
            self.max_buffer_bps.get().to::<u32>(),
            self.min_observations.get().to::<u32>(),
        )
    }

    pub fn is_recorder(&self, account: Address) -> bool {
        self.recorders.get(account)
    }

    // ------------------------------------------------------------------
    // Writes
    // ------------------------------------------------------------------

    /// Record one weekend gap: (Monday's first print / Friday's last print − 1) in bps.
    pub fn record_gap(&mut self, asset: Address, gap_bps: i32) -> Result<(), Error> {
        self.only_recorder()?;
        self.update(asset, gap_bps)
    }

    /// Backfill several weekends at once, oldest first.
    pub fn record_gaps(&mut self, asset: Address, gaps_bps: Vec<i32>) -> Result<(), Error> {
        self.only_recorder()?;
        for gap in gaps_bps {
            self.update(asset, gap)?;
        }
        Ok(())
    }

    pub fn set_recorder(&mut self, recorder: Address, allowed: bool) -> Result<(), Error> {
        self.ownable.only_owner()?;
        self.recorders.setter(recorder).set(allowed);
        log(self.vm(), RecorderSet { recorder, allowed });
        Ok(())
    }

    pub fn set_params(
        &mut self,
        lambda_bps: u32,
        z_times_100: u32,
        min_buffer_bps: u32,
        max_buffer_bps: u32,
        min_observations: u32,
    ) -> Result<(), Error> {
        self.ownable.only_owner()?;
        self.set(lambda_bps, z_times_100, min_buffer_bps, max_buffer_bps, min_observations)
    }
}

#[public]
impl IOwnable for GapGuard {
    fn owner(&self) -> Address {
        self.ownable.owner()
    }

    fn transfer_ownership(&mut self, new_owner: Address) -> Result<(), Vec<u8>> {
        Ok(self.ownable.transfer_ownership(new_owner)?)
    }

    fn renounce_ownership(&mut self) -> Result<(), Vec<u8>> {
        Ok(self.ownable.renounce_ownership()?)
    }
}

impl GapGuard {
    fn only_recorder(&self) -> Result<(), Error> {
        let sender = self.vm().msg_sender();
        if sender == self.ownable.owner() || self.recorders.get(sender) {
            return Ok(());
        }
        Err(Error::NotRecorder(NotRecorder { account: sender }))
    }

    fn update(&mut self, asset: Address, gap_bps: i32) -> Result<(), Error> {
        if gap_bps.unsigned_abs() > BPS {
            return Err(Error::GapOutOfRange(GapOutOfRange { gapBps: gap_bps }));
        }
        let sq = U256::from(gap_bps.unsigned_abs() as u64 * gap_bps.unsigned_abs() as u64)
            * U256::from(VAR_SCALE);
        let n = self.observations.get(asset).to::<u32>();

        let var = if n == 0 {
            sq
        } else {
            let lambda = U256::from(self.lambda_bps.get().to::<u32>());
            let bps = U256::from(BPS);
            (self.variance.get(asset) * lambda + sq * (bps - lambda)) / bps
        };

        self.variance.setter(asset).set(var);
        let count = n.saturating_add(1);
        self.observations.setter(asset).set(alloy_primitives::aliases::U32::from(count));
        log(self.vm(), GapRecorded {
            asset,
            gapBps: gap_bps,
            sigmaBps: self.sigma_bps(asset),
            observations: count,
        });
        Ok(())
    }

    fn set(
        &mut self,
        lambda_bps: u32,
        z_times_100: u32,
        min_buffer_bps: u32,
        max_buffer_bps: u32,
        min_observations: u32,
    ) -> Result<(), Error> {
        if lambda_bps >= BPS || z_times_100 == 0 || min_buffer_bps > max_buffer_bps || max_buffer_bps >= BPS {
            return Err(Error::InvalidParams(InvalidParams {}));
        }
        use alloy_primitives::aliases::U32;
        self.lambda_bps.set(U32::from(lambda_bps));
        self.z_times_100.set(U32::from(z_times_100));
        self.min_buffer_bps.set(U32::from(min_buffer_bps));
        self.max_buffer_bps.set(U32::from(max_buffer_bps));
        self.min_observations.set(U32::from(min_observations));
        log(self.vm(), ParamsSet {
            lambdaBps: lambda_bps,
            zTimes100: z_times_100,
            minBufferBps: min_buffer_bps,
            maxBufferBps: max_buffer_bps,
            minObservations: min_observations,
        });
        Ok(())
    }
}

/// Integer square root (floor). Stylus has no floating point, so no `f64` shortcuts.
fn isqrt(n: u128) -> u128 {
    if n < 2 {
        return n;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

#[cfg(test)]
mod tests {
    use super::*;
    use motsu::prelude::*;

    const NVDA: Address = Address::repeat_byte(0x11);

    #[test]
    fn isqrt_is_exact_floor() {
        for n in [0u128, 1, 2, 3, 4, 15, 16, 17, 1_000_000, 234_000_000_000, u64::MAX as u128] {
            let r = isqrt(n);
            assert!(r * r <= n && (r + 1) * (r + 1) > n, "n={n} r={r}");
        }
    }

    #[motsu::test]
    fn cold_start_uses_max_buffer(contract: Contract<GapGuard>, alice: Address) {
        contract.sender(alice).initialize(alice).unwrap();
        assert_eq!(contract.sender(alice).gap_buffer_bps(NVDA), 5_000);
        // 65% liquidation LTV shrunk by 50% => 32.5%
        assert_eq!(contract.sender(alice).weekend_ltv_bps(NVDA, 6_500), 3_250);
    }

    #[motsu::test]
    fn steady_gaps_converge_to_their_size(contract: Contract<GapGuard>, alice: Address) {
        contract.sender(alice).initialize(alice).unwrap();
        let gaps = alloc::vec![200, -200, 200, -200, 200, -200, 200, -200, 200, -200];
        contract.sender(alice).record_gaps(NVDA, gaps).unwrap();
        assert_eq!(contract.sender(alice).observation_count(NVDA), 10);
        assert_eq!(contract.sender(alice).sigma_bps(NVDA), 200);
        // 3σ = 600 bps => weekend LTV = 65% × 94% = 61.1%
        assert_eq!(contract.sender(alice).gap_buffer_bps(NVDA), 600);
        assert_eq!(contract.sender(alice).weekend_ltv_bps(NVDA, 6_500), 6_110);
    }

    #[motsu::test]
    fn a_shock_widens_the_buffer(contract: Contract<GapGuard>, alice: Address) {
        contract.sender(alice).initialize(alice).unwrap();
        contract.sender(alice).record_gaps(NVDA, alloc::vec![100; 8]).unwrap();
        assert_eq!(contract.sender(alice).sigma_bps(NVDA), 100);
        assert_eq!(contract.sender(alice).gap_buffer_bps(NVDA), 500); // 3σ = 300, floored at 500

        contract.sender(alice).record_gap(NVDA, -1_500).unwrap(); // a 15% Monday gap
        // var = 0.9 × 100² + 0.1 × 1500² = 234_000  =>  σ ≈ 483.7 bps, 3σ ≈ 1451 bps
        assert_eq!(contract.sender(alice).sigma_bps(NVDA), 483);
        assert_eq!(contract.sender(alice).gap_buffer_bps(NVDA), 1_449);
        assert_eq!(contract.sender(alice).weekend_ltv_bps(NVDA, 6_500), 5_558);
    }

    #[motsu::test]
    fn buffer_is_clamped(contract: Contract<GapGuard>, alice: Address) {
        contract.sender(alice).initialize(alice).unwrap();
        contract.sender(alice).record_gaps(NVDA, alloc::vec![10; 8]).unwrap();
        assert_eq!(contract.sender(alice).gap_buffer_bps(NVDA), 500); // min
        contract.sender(alice).record_gaps(NVDA, alloc::vec![9_000; 8]).unwrap();
        assert_eq!(contract.sender(alice).gap_buffer_bps(NVDA), 5_000); // max
    }

    #[motsu::test]
    fn only_owner_or_recorder_can_record(contract: Contract<GapGuard>, alice: Address, bob: Address) {
        contract.sender(alice).initialize(alice).unwrap();
        assert!(contract.sender(bob).record_gap(NVDA, 100).is_err());
        contract.sender(alice).set_recorder(bob, true).unwrap();
        contract.sender(bob).record_gap(NVDA, 100).unwrap();
        assert!(contract.sender(bob).set_params(9_000, 300, 500, 5_000, 8).is_err());
    }

    #[motsu::test]
    fn initializes_once(contract: Contract<GapGuard>, alice: Address, bob: Address) {
        contract.sender(bob).initialize(alice).unwrap();
        assert_eq!(contract.sender(alice).owner(), alice);
        assert!(contract.sender(bob).initialize(bob).is_err());
        assert!(contract.sender(alice).initialize(alice).is_err());
    }

    #[motsu::test]
    fn rejects_bad_input(contract: Contract<GapGuard>, alice: Address) {
        contract.sender(alice).initialize(alice).unwrap();
        assert!(contract.sender(alice).record_gap(NVDA, 10_001).is_err());
        assert!(contract.sender(alice).set_params(10_000, 300, 500, 5_000, 8).is_err());
        assert!(contract.sender(alice).set_params(9_000, 300, 6_000, 5_000, 8).is_err());
    }
}
