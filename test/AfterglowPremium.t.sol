// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {AfterglowMarket} from "../src/AfterglowMarket.sol";
import {PhaselockOracle} from "../src/PhaselockOracle.sol";
import {AfterglowTranches} from "../src/AfterglowTranches.sol";
import {IGapGuard} from "../src/interfaces/IGapGuard.sol";
import {MockGapGuard} from "./mocks/Mocks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// Weekend premium: priced from GapGuard's weekend-gap sigma, paid upfront, earned evenly to maturity.
contract AfterglowPremiumTest is BaseTest {
    AfterglowMarket internal market;
    MockGapGuard internal guard;
    uint64 internal maturity;

    uint256 internal constant LEND = 100_000e6;
    uint256 internal constant LOAN = 10_000e6;
    uint32 internal constant TSLA_SIGMA = 78; // bps, GapGuard's live reading for TSLA

    function setUp() public {
        _deployOracle(); // Monday 12:00 UTC
        maturity = uint64(block.timestamp + 28 days); // four weekly closes (Sat 00:00 UTC) before it
        market = new AfterglowMarket(
            AfterglowMarket.Config({
                loanToken: IERC20(address(usdg)),
                collateralToken: IERC20(address(nvda)),
                oracle: oracle,
                maturity: maturity,
                gracePeriod: 2 days,
                rateWad: 0.06e18,
                risk: AfterglowMarket.RiskParams({baseLtvBps: 5500, weekendLtvBps: 4500, liqLtvBps: 6500, liqBonusBps: 700}),
                supplyCap: type(uint256).max,
                owner: owner,
                guardian: guardian,
                name: "Afterglow USDG/NVDA",
                symbol: "glowUSDG-NVDA"
            })
        );
        guard = new MockGapGuard();
        guard.set(4500, false);
        guard.setSigma(TSLA_SIGMA);
        vm.prank(owner);
        market.setGapGuard(IGapGuard(address(guard)));

        usdg.mint(lender, 1_000_000e6);
        vm.startPrank(lender);
        usdg.approve(address(market), type(uint256).max);
        market.deposit(LEND, lender);
        vm.stopPrank();

        nvda.mint(borrower, 1_000e18); // $180,000
        usdg.mint(borrower, 100_000e6);
        vm.startPrank(borrower);
        nvda.approve(address(market), type(uint256).max);
        usdg.approve(address(market), type(uint256).max);
        market.depositCollateral(1_000e18, borrower);
        vm.stopPrank();
    }

    function _status() internal view returns (uint8 session, uint256 price, uint256 maxLtv, uint256 discount) {
        (PhaselockOracle.Session s, uint256 p, uint256 m, uint256 d) = market.marketStatus();
        return (uint8(s), p, m, d);
    }

    function _borrow(uint256 assets) internal returns (uint256 face) {
        vm.prank(borrower);
        face = market.borrow(assets, borrower);
    }

    // --- Pricing ------------------------------------------------------------------------------

    function test_weekendsToMaturity_countsWeeklyCloses() public {
        assertEq(market.weekendsToMaturity(), 4);
        _warpLive(MONDAY + 3 weeks + 12 hours); // one close left, Saturday of week four
        assertEq(market.weekendsToMaturity(), 1);
        _warpLive(MONDAY + 3 weeks + 5 days + 1); // past the last close
        assertEq(market.weekendsToMaturity(), 0);
    }

    function test_premium_isShareOfGapSigma() public view {
        assertEq(market.weekendPremiumPpm(), 780); // 10% of 78 bps = 7.8 bps per weekend
        (uint256 premium, uint256 weekends, uint256 ppm) = market.premiumFor(LOAN);
        assertEq(weekends, 4);
        assertEq(ppm, 780);
        assertEq(premium, 31_200_000); // 10,000 USDG x 7.8 bps x 4 = 31.20 USDG
    }

    function test_choppierStock_paysMore() public {
        uint256 calm = market.weekendPremiumPpm();
        guard.setSigma(TSLA_SIGMA * 3);
        assertEq(market.weekendPremiumPpm(), calm * 3);
    }

    function test_noModel_usesFallback() public {
        vm.prank(owner);
        market.setGapGuard(IGapGuard(address(0)));
        assertEq(market.weekendPremiumPpm(), 1_000); // 10 bps
    }

    function test_brokenModel_usesFallback() public {
        guard.set(4500, true);
        assertEq(market.weekendPremiumPpm(), 1_000);
    }

    function test_premium_isClamped() public {
        guard.setSigma(100_000); // absurd reading
        assertEq(market.weekendPremiumPpm(), 5_000); // capped at 50 bps
        guard.setSigma(1);
        assertEq(market.weekendPremiumPpm(), 200); // floor of 2 bps
    }

    function test_noWeekendLeft_noPremium() public {
        _warpLive(MONDAY + 3 weeks + 5 days + 1 hours);
        (uint256 premium,,) = market.premiumFor(LOAN);
        assertEq(premium, 0);
    }

    // --- Borrowing ----------------------------------------------------------------------------

    function test_borrower_receivesLoanMinusPremium_owesOnFullAmount() public {
        (uint256 premium,,) = market.premiumFor(LOAN);
        uint256 face = _borrow(LOAN);
        assertEq(usdg.balanceOf(borrower), 100_000e6 + LOAN - premium);
        (, uint256 owed) = market.positions(borrower);
        assertEq(face, owed);
        assertApproxEqAbs(market.debtOf(borrower), LOAN, 1); // debt is on the full amount
    }

    function test_premiumEmitsEvent() public {
        vm.expectEmit(true, false, false, true, address(market));
        emit AfterglowMarket.WeekendPremium(borrower, 4, 780, 31_200_000);
        _borrow(LOAN);
    }

    // --- Earned evenly, not captured at once ----------------------------------------------------

    function test_premium_doesNotJumpSharePrice() public {
        uint256 before = market.totalAssets();
        _borrow(LOAN);
        assertApproxEqAbs(market.totalAssets(), before, 2);
    }

    function test_premium_isEarnedEvenlyUntilMaturity() public {
        (uint256 premium,,) = market.premiumFor(LOAN);
        _borrow(LOAN);
        uint256 start = market.unearnedPremiums();
        assertEq(start, premium);
        _warpLive(block.timestamp + 14 days);
        assertApproxEqAbs(market.unearnedPremiums(), premium / 2, 1);
        _warpLive(maturity);
        assertEq(market.unearnedPremiums(), 0);
    }

    function test_premiumsFromSeveralLoans_allEarnedByMaturity() public {
        uint256 p1;
        uint256 p2;
        (p1,,) = market.premiumFor(LOAN);
        _borrow(LOAN);
        _warpLive(block.timestamp + 8 days); // one weekend gone
        (p2,,) = market.premiumFor(LOAN);
        _borrow(LOAN);
        assertLt(p2, p1); // fewer weekends left, smaller premium

        _warpLive(maturity);
        vm.prank(borrower);
        market.repay(borrower, type(uint256).max);
        // Lenders end with their deposit, the fixed interest and every premium.
        uint256 interest = market.cash() - (LEND + p1 + p2);
        assertEq(market.totalAssets(), market.cash());
        assertGt(interest, 0);
        assertApproxEqAbs(market.totalAssets(), LEND + p1 + p2 + interest, 1);
    }

    function test_justInTimeDeposit_doesNotCapturePremium() public {
        address sniper = makeAddr("sniper");
        usdg.mint(sniper, 1_000_000e6);
        vm.startPrank(sniper);
        usdg.approve(address(market), type(uint256).max);
        uint256 shares = market.deposit(1_000_000e6, sniper);
        vm.stopPrank();

        _borrow(LOAN);

        vm.prank(sniper);
        uint256 out = market.redeem(shares, sniper, sniper);
        assertLe(out, 1_000_000e6); // nothing gained within the block
    }

    // --- Boost earns it -------------------------------------------------------------------------

    /// Same loan, with and without the premium: Protected ends identical, Boost ends higher by exactly
    /// the premium. (Whether Boost beats its deposit depends on utilisation; that is the waterfall's job.)
    function test_premium_landsEntirelyWithBoost() public {
        // The tranche vault is the only lender here, so every unit of premium is its to split.
        vm.startPrank(lender);
        market.redeem(market.balanceOf(lender), lender, lender);
        vm.stopPrank();
        AfterglowTranches tranches = new AfterglowTranches(IERC4626(address(market)), 0.05e18, 2000, owner, "NVDA");
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        usdg.mint(alice, 75_000e6);
        usdg.mint(bob, 25_000e6);
        vm.startPrank(bob);
        usdg.approve(address(tranches), type(uint256).max);
        tranches.depositJunior(25_000e6, bob);
        vm.stopPrank();
        vm.startPrank(alice);
        usdg.approve(address(tranches), type(uint256).max);
        tranches.depositSenior(75_000e6, alice);
        vm.stopPrank();

        uint256 snap = vm.snapshotState();
        (uint256 premium,,) = market.premiumFor(LOAN);
        (uint256 seniorWith, uint256 juniorWith) = _loanToMaturity(tranches);

        vm.revertToState(snap);
        _noPremium(market);
        (uint256 seniorWithout, uint256 juniorWithout) = _loanToMaturity(tranches);

        assertApproxEqAbs(seniorWith, seniorWithout, 2);
        assertApproxEqAbs(juniorWith - juniorWithout, premium, 3);
    }

    function _loanToMaturity(AfterglowTranches tranches) internal returns (uint256 senior, uint256 junior) {
        _borrow(LOAN);
        _warpLive(maturity);
        vm.prank(borrower);
        market.repay(borrower, type(uint256).max);
        (senior, junior) = tranches.trancheValues();
    }

    // --- Admin --------------------------------------------------------------------------------

    function test_setPremiumParams_bounds() public {
        vm.startPrank(owner);
        vm.expectRevert(AfterglowMarket.InvalidConfig.selector);
        market.setPremiumParams(AfterglowMarket.PremiumParams(1000, 10, 60, 50)); // min > max
        vm.expectRevert(AfterglowMarket.InvalidConfig.selector);
        market.setPremiumParams(AfterglowMarket.PremiumParams(1000, 10, 2, 501)); // over 5% a weekend
        vm.stopPrank();
    }

    /// Lenders never end below their deposit plus interest, whatever the loan size and timing.
    function testFuzz_premium_neverHurtsLenders(uint256 amount, uint256 delay) public {
        amount = bound(amount, 1e6, 80_000e6); // under the weekend LTV, so the closing ramp never blocks it
        delay = bound(delay, 0, 20 days);
        _warpLive(block.timestamp + delay);
        (uint8 session,,,) = _status();
        vm.assume(session <= 1); // borrowing is only possible while live or closing
        (uint256 premium,,) = market.premiumFor(amount);
        _borrow(amount);
        _warpLive(maturity);
        vm.prank(borrower);
        market.repay(borrower, type(uint256).max);
        assertGe(market.totalAssets(), LEND + premium);
    }
}
