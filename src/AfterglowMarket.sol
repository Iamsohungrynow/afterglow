// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PhaselockOracle} from "./PhaselockOracle.sol";
import {IGapGuard} from "./interfaces/IGapGuard.sol";

/// @title AfterglowMarket
/// @notice Fixed-rate, fixed-maturity USDG loans against one tokenized stock.
///
/// Lenders deposit the loan token (USDG) and hold ERC-4626 shares that accrete toward par at
/// maturity. A borrower taking `P` at time `t` owes face value `F = P * (1 + r * (T - t) / year)`
/// at maturity `T`. Every loan shares one rate and one maturity, so all outstanding debt is worth
/// `totalFace * discount(now)` and accounting stays O(1). Repaying early costs `F * discount(now)`.
///
/// Risk follows the equity market clock via {PhaselockOracle}: borrowing capacity ramps down before
/// the weekly close, borrowing stops while prices are stale, and liquidations wait for a fresh price.
/// Repaying and adding collateral are always possible.
///
/// Weekend premium: on top of the fixed rate, each loan pays a premium for every weekly close before
/// maturity, priced from the stock's measured weekend-gap volatility (GapGuard's sigma). It is paid
/// upfront out of the borrowed amount and earned by lenders evenly until maturity, so it cannot be
/// captured by depositing just before a borrow. Through the tranche waterfall it lands with Boost,
/// the tranche that absorbs weekend gap losses first.
///
/// Weekend sweep: USDG that is not lent can sit in an ERC-4626 savings vault (`idleVault`). The cash
/// buffer follows the same clock: while borrowing is possible a larger share stays in the market, and
/// once the market closes (no new borrowing until the reopen) nearly all of it goes to the vault.
/// Anyone may call {rebalance}; borrows and lender withdrawals pull from the vault on demand.
contract AfterglowMarket is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant YEAR = 365 days;

    struct RiskParams {
        uint16 baseLtvBps; // max borrow LTV while the market is live
        uint16 weekendLtvBps; // max LTV at the weekly close and for withdrawals while closed
        uint16 liqLtvBps; // positions above this LTV can be liquidated
        uint16 liqBonusBps; // collateral bonus paid to liquidators
    }

    struct Position {
        uint256 collateral; // raw stock-token units
        uint256 face; // loan-token units owed at maturity
    }

    struct Config {
        IERC20 loanToken;
        IERC20 collateralToken;
        PhaselockOracle oracle;
        uint64 maturity;
        uint32 gracePeriod;
        uint256 rateWad; // simple annual rate, 1e18 = 100%
        RiskParams risk;
        uint256 supplyCap; // max total assets lenders may deposit up to; type(uint256).max = none
        address owner;
        address guardian;
        string name;
        string symbol;
    }

    struct SweepParams {
        uint16 liveBufferBps; // share of total assets kept as cash while borrowing is possible
        uint16 closedBufferBps; // share kept as cash while the market is closed (lender withdrawals only)
        uint16 minMoveBps; // skip moves smaller than this share of total assets (saves gas)
        uint256 maxIdle; // most USDG ever placed in the vault
    }

    struct PremiumParams {
        uint16 perSigmaBps; // premium per weekend as a share of GapGuard's gap sigma (1000 = 10% of sigma)
        uint16 fallbackBps; // premium per weekend when no GapGuard reading is available
        uint16 minBps; // floor per weekend
        uint16 maxBps; // cap per weekend
    }

    IERC20 public immutable collateralToken;
    PhaselockOracle public immutable oracle;
    uint64 public immutable maturity;
    uint32 public immutable gracePeriod;
    uint256 public immutable rateWad;
    /// @dev Converts `collateral * price` into loan-token units: 10^(collateralDecimals + 18 - loanDecimals).
    uint256 internal immutable valueScale;

    RiskParams public risk;
    address public guardian;
    /// @notice Optional Stylus gap-risk model. It can only tighten the weekend LTV, never loosen it.
    IGapGuard public gapGuard;

    /// @notice Loan tokens held by the market. Tracked internally so donations cannot move share price.
    uint256 public cash;
    /// @notice Sum of face value owed by all borrowers.
    uint256 public totalFace;
    /// @notice Cumulative face value written off after collateral ran out.
    uint256 public badDebt;
    /// @notice Deposits stop once total assets reach this. Keeps early deployments small.
    uint256 public supplyCap;
    /// @notice Optional ERC-4626 savings vault for USDG that is not lent out.
    IERC4626 public idleVault;
    /// @notice Idle-vault shares held for lenders. Tracked internally, like `cash`.
    uint256 public idleShares;
    SweepParams public sweepParams;
    PremiumParams public premiumParams;
    /// @dev Weekend premiums collected but not yet earned, as of `premiumCheckpoint`. Every loan in the
    /// market matures at the same time, so the unearned part of all of them shrinks by one common factor.
    uint256 internal unearnedPremium;
    uint256 internal premiumCheckpoint;

    mapping(address borrower => Position) public positions;

    event Borrow(address indexed borrower, address indexed receiver, uint256 assets, uint256 face);
    event Repay(address indexed payer, address indexed borrower, uint256 assets, uint256 face);
    event CollateralDeposited(address indexed from, address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, address indexed receiver, uint256 amount);
    event Liquidate(
        address indexed liquidator, address indexed borrower, uint256 assetsRepaid, uint256 faceRepaid, uint256 seized
    );
    event BadDebt(address indexed borrower, uint256 face);
    event RiskParamsSet(RiskParams risk);
    event GuardianSet(address guardian);
    event SupplyCapSet(uint256 supplyCap);
    event GapGuardSet(address gapGuard);
    event IdleVaultSet(address idleVault);
    event SweepParamsSet(SweepParams params);
    event Swept(uint256 deployed, uint256 recalled, uint256 idleAssets);
    event PremiumParamsSet(PremiumParams params);
    event WeekendPremium(address indexed borrower, uint256 weekends, uint256 perWeekendPpm, uint256 premium);

    error ZeroAmount();
    error Matured();
    error MarketNotLive(PhaselockOracle.Session session);
    error MarketHalted();
    error InsufficientCash();
    error LtvTooHigh(uint256 ltvBps, uint256 maxLtvBps);
    error PositionHealthy();
    error NoDebt();
    error InvalidRiskParams();
    error InvalidConfig();
    error NotGuardian();
    error IdleVaultInUse();
    error PremiumTooHigh();

    constructor(Config memory c) ERC20(c.name, c.symbol) ERC4626(c.loanToken) Ownable(c.owner) {
        if (c.maturity <= block.timestamp || address(c.oracle) == address(0) || c.rateWad > WAD) {
            revert InvalidConfig();
        }
        uint8 collateralDecimals = IERC20Metadata(address(c.collateralToken)).decimals();
        uint8 loanDecimals = IERC20Metadata(address(c.loanToken)).decimals();
        if (loanDecimals > collateralDecimals + 18) revert InvalidConfig();

        collateralToken = c.collateralToken;
        oracle = c.oracle;
        maturity = c.maturity;
        gracePeriod = c.gracePeriod;
        rateWad = c.rateWad;
        valueScale = 10 ** (uint256(collateralDecimals) + 18 - loanDecimals);
        guardian = c.guardian;
        supplyCap = c.supplyCap;
        _setRiskParams(c.risk);
        _setSweepParams(SweepParams({liveBufferBps: 2000, closedBufferBps: 500, minMoveBps: 100, maxIdle: type(uint256).max}));
        _setPremiumParams(PremiumParams({perSigmaBps: 1000, fallbackBps: 10, minBps: 2, maxBps: 50}));
        premiumCheckpoint = block.timestamp;
    }

    // ---------------------------------------------------------------------
    // Borrower actions
    // ---------------------------------------------------------------------

    function depositCollateral(uint256 amount, address onBehalf) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        positions[onBehalf].collateral += amount;
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        emit CollateralDeposited(msg.sender, onBehalf, amount);
    }

    /// @notice Borrow `assets` loan tokens at the market's fixed rate until maturity. The weekend
    /// premium ({premiumFor}) is kept from the amount sent, so `receiver` gets `assets - premium`.
    /// @return face Amount owed at maturity.
    function borrow(uint256 assets, address receiver) external nonReentrant whenNotPaused returns (uint256 face) {
        if (assets == 0) revert ZeroAmount();
        if (block.timestamp >= maturity) revert Matured();

        PhaselockOracle.Quote memory q = oracle.quote(address(collateralToken));
        if (q.session != PhaselockOracle.Session.Live && q.session != PhaselockOracle.Session.Closing) {
            revert MarketNotLive(q.session);
        }
        (uint256 premium, uint256 weekends, uint256 perWeekendPpm) = premiumFor(assets);
        if (premium >= assets) revert PremiumTooHigh();
        uint256 sent = assets - premium;
        _ensureCash(sent);

        face = assets.mulDiv(WAD, discountWad(), Math.Rounding.Ceil);
        Position storage p = positions[msg.sender];
        p.face += face;
        totalFace += face;
        cash -= sent;
        if (premium != 0) {
            unearnedPremium = unearnedPremiums() + premium;
            premiumCheckpoint = block.timestamp;
        }

        _requireLtv(p, q.price, maxBorrowLtvBps(q));

        IERC20(asset()).safeTransfer(receiver, sent);
        emit Borrow(msg.sender, receiver, assets, face);
        if (premium != 0) emit WeekendPremium(msg.sender, weekends, perWeekendPpm, premium);
    }

    /// @notice Repay up to `face` of `borrower`'s debt at today's discounted value. Never pausable.
    /// @param face Face amount to retire; type(uint256).max repays everything.
    /// @return assets Loan tokens pulled from the caller.
    function repay(address borrower, uint256 face) external nonReentrant returns (uint256 assets) {
        Position storage p = positions[borrower];
        if (face > p.face) face = p.face;
        if (face == 0) revert NoDebt();

        assets = face.mulDiv(discountWad(), WAD, Math.Rounding.Ceil);
        p.face -= face;
        totalFace -= face;
        cash += assets;

        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
        emit Repay(msg.sender, borrower, assets, face);
    }

    /// @notice Withdraw collateral. With debt outstanding, the remaining position must stay within
    /// the session's limit; while prices are stale only the conservative weekend LTV applies.
    function withdrawCollateral(uint256 amount, address receiver) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Position storage p = positions[msg.sender];
        p.collateral -= amount; // reverts on underflow

        if (p.face != 0) {
            PhaselockOracle.Quote memory q = oracle.quote(address(collateralToken));
            if (q.session == PhaselockOracle.Session.Halted) revert MarketHalted();
            uint256 limit = q.session == PhaselockOracle.Session.Closed ? weekendLtvBps() : maxBorrowLtvBps(q);
            _requireLtv(p, q.price, limit);
        }

        collateralToken.safeTransfer(receiver, amount);
        emit CollateralWithdrawn(msg.sender, receiver, amount);
    }

    // ---------------------------------------------------------------------
    // Liquidation
    // ---------------------------------------------------------------------

    /// @notice Repay part of an unsafe or defaulted position in exchange for collateral at a bonus.
    /// Only possible on a fresh price: liquidating against a frozen weekend price is refused.
    /// @return assetsRepaid Loan tokens pulled from the liquidator.
    /// @return seized Collateral sent to the liquidator.
    function liquidate(address borrower, uint256 face)
        external
        nonReentrant
        returns (uint256 assetsRepaid, uint256 seized)
    {
        PhaselockOracle.Quote memory q = oracle.quote(address(collateralToken));
        if (q.session != PhaselockOracle.Session.Live && q.session != PhaselockOracle.Session.Closing) {
            revert MarketNotLive(q.session);
        }

        Position storage p = positions[borrower];
        if (p.face == 0) revert NoDebt();
        if (!_isLiquidatable(p, q.price)) revert PositionHealthy();
        if (face > p.face) face = p.face;
        if (face == 0) revert ZeroAmount();

        uint256 d = discountWad();
        uint256 bonusFactor = BPS + risk.liqBonusBps;
        assetsRepaid = face.mulDiv(d, WAD, Math.Rounding.Ceil);
        seized = assetsRepaid.mulDiv(bonusFactor * valueScale, BPS * q.price, Math.Rounding.Floor);

        if (seized >= p.collateral) {
            // Collateral runs out first: the liquidator pays only for what is left.
            seized = p.collateral;
            assetsRepaid = _value(seized, q.price).mulDiv(BPS, bonusFactor, Math.Rounding.Ceil);
            face = Math.min(p.face, assetsRepaid.mulDiv(WAD, d, Math.Rounding.Floor));
        }

        p.collateral -= seized;
        p.face -= face;
        totalFace -= face;
        cash += assetsRepaid;

        if (p.collateral == 0 && p.face != 0) {
            uint256 loss = p.face;
            p.face = 0;
            totalFace -= loss;
            badDebt += loss;
            emit BadDebt(borrower, loss);
        }

        emit Liquidate(msg.sender, borrower, assetsRepaid, face, seized);
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assetsRepaid);
        collateralToken.safeTransfer(msg.sender, seized);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Present value of 1 unit of face value, 1e18 = par. Equals 1e18 from maturity on.
    function discountWad() public view returns (uint256) {
        if (block.timestamp >= maturity) return WAD;
        uint256 accrual = rateWad.mulDiv(maturity - block.timestamp, YEAR);
        return WAD.mulDiv(WAD, WAD + accrual);
    }

    /// @notice What `borrower` would pay to repay in full right now.
    function debtOf(address borrower) public view returns (uint256) {
        return positions[borrower].face.mulDiv(discountWad(), WAD, Math.Rounding.Ceil);
    }

    /// @notice Borrowing limit for the given quote: base LTV while live, ramping linearly to the
    /// weekend LTV through the closing window, zero otherwise.
    function maxBorrowLtvBps(PhaselockOracle.Quote memory q) public view returns (uint256) {
        uint256 base = risk.baseLtvBps;
        if (q.session == PhaselockOracle.Session.Live) return base;
        if (q.session == PhaselockOracle.Session.Closing) {
            return base - ((base - weekendLtvBps()) * q.rampBps) / BPS;
        }
        return 0;
    }

    /// @notice LTV a position may carry into the weekend: the configured value, tightened by the
    /// GapGuard model when one is set. A failing or missing model falls back to the configured value.
    function weekendLtvBps() public view returns (uint256 ltv) {
        ltv = risk.weekendLtvBps;
        IGapGuard g = gapGuard;
        if (address(g) == address(0)) return ltv;
        try g.weekendLtvBps(address(collateralToken), risk.liqLtvBps) returns (uint16 modelled) {
            if (modelled < ltv) ltv = modelled;
        } catch {}
    }

    /// @notice Current session and borrowing limit, for front ends.
    function marketStatus()
        external
        view
        returns (PhaselockOracle.Session session, uint256 price, uint256 maxLtvBps, uint256 discount)
    {
        PhaselockOracle.Quote memory q = oracle.quote(address(collateralToken));
        return (q.session, q.price, maxBorrowLtvBps(q), discountWad());
    }

    /// @notice Loan-to-value of `borrower` in bps at `price` (type(uint256).max if no collateral).
    function ltvBps(address borrower, uint256 price) public view returns (uint256) {
        Position memory p = positions[borrower];
        if (p.face == 0) return 0;
        uint256 value = _value(p.collateral, price);
        if (value == 0) return type(uint256).max;
        return p.face.mulDiv(discountWad(), WAD, Math.Rounding.Ceil).mulDiv(BPS, value, Math.Rounding.Ceil);
    }

    function isLiquidatable(address borrower) external view returns (bool) {
        PhaselockOracle.Quote memory q = oracle.quote(address(collateralToken));
        if (q.session != PhaselockOracle.Session.Live && q.session != PhaselockOracle.Session.Closing) return false;
        Position memory p = positions[borrower];
        return p.face != 0 && _isLiquidatable(p, q.price);
    }

    /// @notice Weekly closes between now and maturity: the weekends a new loan is exposed to.
    function weekendsToMaturity() public view returns (uint256) {
        if (block.timestamp >= maturity) return 0;
        uint256 nextClose = block.timestamp + oracle.secondsUntilWeeklyClose();
        return nextClose > maturity ? 0 : 1 + (maturity - nextClose) / 1 weeks;
    }

    /// @notice Premium per weekend, in parts per million of the amount borrowed (100 ppm = 1 bp):
    /// `perSigmaBps` of GapGuard's measured weekend-gap sigma for this stock, clamped to
    /// [minBps, maxBps]. Without a model reading the fallback applies. Choppier stocks pay more.
    function weekendPremiumPpm() public view returns (uint256 ppm) {
        PremiumParams memory p = premiumParams;
        ppm = uint256(p.fallbackBps) * 100;
        IGapGuard g = gapGuard;
        if (address(g) != address(0)) {
            try g.sigmaBps(address(collateralToken)) returns (uint32 sigma) {
                if (sigma != 0) ppm = uint256(sigma) * p.perSigmaBps / 100;
            } catch {}
        }
        if (ppm < uint256(p.minBps) * 100) ppm = uint256(p.minBps) * 100;
        if (ppm > uint256(p.maxBps) * 100) ppm = uint256(p.maxBps) * 100;
    }

    /// @notice Weekend premium for borrowing `assets` right now: the per-weekend rate times the weekends left.
    function premiumFor(uint256 assets) public view returns (uint256 premium, uint256 weekends, uint256 perWeekendPpm) {
        weekends = weekendsToMaturity();
        perWeekendPpm = weekendPremiumPpm();
        premium = assets.mulDiv(perWeekendPpm * weekends, 1e6);
    }

    /// @notice Premiums collected but not yet earned by lenders. They are earned evenly until maturity,
    /// so a deposit made just before a borrow does not capture them.
    function unearnedPremiums() public view returns (uint256) {
        uint256 u = unearnedPremium;
        if (u == 0 || block.timestamp >= maturity) return 0;
        return u.mulDiv(maturity - block.timestamp, maturity - premiumCheckpoint);
    }

    /// @notice USDG value of the idle-vault position.
    function idleAssets() public view returns (uint256) {
        uint256 s = idleShares;
        return s == 0 ? 0 : idleVault.previewRedeem(s);
    }

    /// @notice USDG the market can pay out right now: cash plus what the idle vault will release.
    function liquidAssets() public view returns (uint256) {
        uint256 s = idleShares;
        if (s == 0) return cash;
        return cash + Math.min(idleVault.previewRedeem(s), idleVault.maxWithdraw(address(this)));
    }

    /// @notice How much USDG the sweep wants in the idle vault right now. Follows the market clock:
    /// live or closing keeps `liveBufferBps` of total assets as cash for borrowers; closed keeps only
    /// `closedBufferBps`, since nobody can borrow until the reopen. Halted, paused, matured or no vault: zero.
    function targetIdle() public view returns (uint256) {
        if (address(idleVault) == address(0) || paused() || block.timestamp >= maturity) return 0;
        PhaselockOracle.Session s = oracle.quote(address(collateralToken)).session;
        if (s == PhaselockOracle.Session.Halted) return 0;
        SweepParams memory p = sweepParams;
        uint256 bufferBps = s == PhaselockOracle.Session.Closed ? p.closedBufferBps : p.liveBufferBps;
        uint256 unlent = cash + idleAssets();
        uint256 keep = totalAssets().mulDiv(bufferBps, BPS, Math.Rounding.Ceil);
        return unlent > keep ? Math.min(unlent - keep, p.maxIdle) : 0;
    }

    // ---------------------------------------------------------------------
    // Weekend sweep
    // ---------------------------------------------------------------------

    /// @notice Moves unlent USDG between the market and the idle vault toward {targetIdle}. Anyone can
    /// call it: the target comes from the market clock, not the caller. Moves smaller than
    /// `minMoveBps` of total assets are skipped, except a full recall.
    function rebalance() external nonReentrant returns (uint256 deployed, uint256 recalled) {
        IERC4626 v = idleVault;
        if (address(v) == address(0)) return (0, 0);
        uint256 target = targetIdle();
        uint256 current = idleAssets();

        if (target == 0) {
            if (idleShares == 0) return (0, 0);
            recalled = _recallAll();
        } else {
            uint256 minMove = totalAssets().mulDiv(sweepParams.minMoveBps, BPS);
            if (target > current) {
                deployed = Math.min(target - current, v.maxDeposit(address(this)));
                if (deployed == 0 || deployed < minMove) return (0, 0);
                cash -= deployed;
                IERC20(asset()).forceApprove(address(v), deployed);
                idleShares += v.deposit(deployed, address(this));
            } else {
                recalled = Math.min(current - target, v.maxWithdraw(address(this)));
                if (recalled == 0 || recalled < minMove) return (0, 0);
                _recall(recalled);
            }
        }
        emit Swept(deployed, recalled, idleAssets());
    }

    /// @notice Pulls everything back from the idle vault. Owner or guardian.
    function recallAll() external nonReentrant returns (uint256 recalled) {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        if (idleShares == 0) return 0;
        recalled = _recallAll();
        emit Swept(0, recalled, 0);
    }

    // ---------------------------------------------------------------------
    // ERC-4626
    // ---------------------------------------------------------------------

    /// @dev Unearned weekend premiums sit in cash but are not yet the lenders'.
    function totalAssets() public view override returns (uint256) {
        uint256 gross = cash + idleAssets() + totalFace.mulDiv(discountWad(), WAD, Math.Rounding.Floor);
        uint256 unearned = unearnedPremiums();
        return gross > unearned ? gross - unearned : 0;
    }

    function maxDeposit(address) public view override returns (uint256) {
        if (paused() || block.timestamp >= maturity) return 0;
        uint256 cap = supplyCap;
        if (cap == type(uint256).max) return cap;
        uint256 assets = totalAssets();
        return cap > assets ? cap - assets : 0;
    }

    function maxMint(address receiver) public view override returns (uint256) {
        uint256 assets = maxDeposit(receiver);
        return assets == type(uint256).max ? assets : _convertToShares(assets, Math.Rounding.Floor);
    }

    /// @dev Lenders can only take out what is not lent: cash plus what the idle vault will release.
    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(_convertToAssets(balanceOf(owner), Math.Rounding.Floor), liquidAssets());
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return Math.min(balanceOf(owner), _convertToShares(liquidAssets(), Math.Rounding.Floor));
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        super._deposit(caller, receiver, assets, shares);
        cash += assets;
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
        nonReentrant
    {
        _ensureCash(assets);
        cash -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    /// @dev Virtual-share offset makes first-depositor inflation attacks unprofitable.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setRiskParams(RiskParams calldata r) external onlyOwner {
        _setRiskParams(r);
    }

    function setGapGuard(IGapGuard gapGuard_) external onlyOwner {
        gapGuard = gapGuard_;
        emit GapGuardSet(address(gapGuard_));
    }

    /// @notice The vault must hold the same asset. Recall everything before switching vaults.
    function setIdleVault(IERC4626 idleVault_) external onlyOwner {
        if (idleShares != 0) revert IdleVaultInUse();
        if (address(idleVault_) != address(0) && idleVault_.asset() != asset()) revert InvalidConfig();
        idleVault = idleVault_;
        emit IdleVaultSet(address(idleVault_));
    }

    function setSweepParams(SweepParams calldata p) external onlyOwner {
        _setSweepParams(p);
    }

    function setPremiumParams(PremiumParams calldata p) external onlyOwner {
        _setPremiumParams(p);
    }

    function setSupplyCap(uint256 supplyCap_) external onlyOwner {
        supplyCap = supplyCap_;
        emit SupplyCapSet(supplyCap_);
    }

    /// @notice address(0) leaves pausing to the owner alone.
    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
        emit GuardianSet(guardian_);
    }

    /// @notice Stops new deposits and borrows. Repay, collateral top-ups, lender withdrawals and
    /// liquidations keep working.
    function pause() external {
        if (msg.sender != guardian && msg.sender != owner()) revert NotGuardian();
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _setRiskParams(RiskParams memory r) internal {
        // weekend <= base < liquidation, and a liquidation at the threshold must be solvent.
        if (
            r.weekendLtvBps > r.baseLtvBps || r.baseLtvBps >= r.liqLtvBps
                || uint256(r.liqLtvBps) * (BPS + r.liqBonusBps) >= BPS * BPS
        ) revert InvalidRiskParams();
        risk = r;
        emit RiskParamsSet(r);
    }

    function _setSweepParams(SweepParams memory p) internal {
        if (p.liveBufferBps > BPS || p.closedBufferBps > BPS || p.minMoveBps > BPS) revert InvalidConfig();
        sweepParams = p;
        emit SweepParamsSet(p);
    }

    /// @dev A weekend can cost at most 5% of the loan.
    function _setPremiumParams(PremiumParams memory p) internal {
        if (p.minBps > p.maxBps || p.maxBps > 500 || p.fallbackBps > p.maxBps) revert InvalidConfig();
        premiumParams = p;
        emit PremiumParamsSet(p);
    }

    /// @dev Makes sure `assets` is held as cash, pulling the shortfall from the idle vault.
    function _ensureCash(uint256 assets) internal {
        uint256 c = cash;
        if (assets <= c) return;
        if (assets > liquidAssets()) revert InsufficientCash();
        _recall(assets - c);
    }

    /// @dev Books the shares before calling out; ERC-4626 redeems at least what previewWithdraw promised.
    function _recall(uint256 assets) internal {
        IERC4626 v = idleVault;
        uint256 shares = Math.min(v.previewWithdraw(assets), idleShares);
        idleShares -= shares;
        uint256 got = v.redeem(shares, address(this), address(this));
        if (got < assets) revert InsufficientCash();
        cash += got;
    }

    function _recallAll() internal returns (uint256 assets) {
        uint256 shares = idleShares;
        idleShares = 0;
        assets = idleVault.redeem(shares, address(this), address(this));
        cash += assets;
    }

    /// @dev Collateral value in loan-token units.
    function _value(uint256 collateral, uint256 price) internal view returns (uint256) {
        return collateral.mulDiv(price, valueScale);
    }

    function _requireLtv(Position storage p, uint256 price, uint256 limitBps) internal view {
        uint256 debt = p.face.mulDiv(discountWad(), WAD, Math.Rounding.Ceil);
        uint256 value = _value(p.collateral, price);
        // debt / value <= limit, written without division
        if (debt * BPS > value * limitBps) {
            uint256 ltv = value == 0 ? type(uint256).max : debt.mulDiv(BPS, value, Math.Rounding.Ceil);
            revert LtvTooHigh(ltv, limitBps);
        }
    }

    function _isLiquidatable(Position memory p, uint256 price) internal view returns (bool) {
        if (block.timestamp > uint256(maturity) + gracePeriod) return true; // defaulted
        uint256 debt = p.face.mulDiv(discountWad(), WAD, Math.Rounding.Ceil);
        return debt * BPS > _value(p.collateral, price) * risk.liqLtvBps;
    }
}
