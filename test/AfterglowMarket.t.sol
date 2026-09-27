// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {PhaselockOracle} from "../src/PhaselockOracle.sol";
import {AfterglowMarket} from "../src/AfterglowMarket.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract AfterglowMarketTest is BaseTest {
    AfterglowMarket internal market;

    uint256 internal constant RATE = 0.08e18; // 8% simple annual
    uint64 internal maturity;
    uint256 internal constant LEND = 100_000e6;
    uint256 internal constant COLLATERAL = 100e18; // 100 NVDA = $18,000

    function setUp() public {
        _deployOracle();
        maturity = uint64(block.timestamp + 28 days);
        market = new AfterglowMarket(
            AfterglowMarket.Config({
                loanToken: IERC20(address(usdg)),
                collateralToken: IERC20(address(nvda)),
                oracle: oracle,
                maturity: maturity,
                gracePeriod: 2 days,
                rateWad: RATE,
                risk: AfterglowMarket.RiskParams({baseLtvBps: 5500, weekendLtvBps: 4500, liqLtvBps: 6500, liqBonusBps: 700}),
                owner: owner,
                guardian: guardian,
                name: "Afterglow USDG/NVDA 28d",
                symbol: "glowUSDG-NVDA"
            })
        );

        usdg.mint(lender, LEND);
        vm.startPrank(lender);
        usdg.approve(address(market), type(uint256).max);
        market.deposit(LEND, lender);
        vm.stopPrank();

        nvda.mint(borrower, COLLATERAL);
        usdg.mint(borrower, 50_000e6); // to pay interest
        vm.startPrank(borrower);
        nvda.approve(address(market), type(uint256).max);
        usdg.approve(address(market), type(uint256).max);
        market.depositCollateral(COLLATERAL, borrower);
        vm.stopPrank();

        usdg.mint(liquidator, 100_000e6);
        vm.prank(liquidator);
        usdg.approve(address(market), type(uint256).max);
    }

    function _borrow(uint256 assets) internal returns (uint256 face) {
        vm.prank(borrower);
        face = market.borrow(assets, borrower);
    }

    // ------------------------------------------------------------------
    // Fixed-rate mechanics
    // ------------------------------------------------------------------

    function test_borrow_locksFixedRateToMaturity() public {
        uint256 face = _borrow(9_000e6);
        // 9,000 * (1 + 8% * 28/365)
        uint256 principal = 9_000e6;
        uint256 expected = principal + (principal * 8 * 28) / (100 * 365);
        assertApproxEqAbs(face, expected, 2);
        assertEq(usdg.balanceOf(borrower), 59_000e6);
        assertEq(market.cash(), LEND - 9_000e6);
    }

    function test_borrow_doesNotMoveSharePrice() public {
        uint256 before = market.totalAssets();
        _borrow(9_000e6);
        assertApproxEqAbs(market.totalAssets(), before, 1);
        assertGe(market.totalAssets(), before);
    }

    function test_lendersAccreteToFaceAtMaturity() public {
        uint256 face = _borrow(9_000e6);
        uint256 atStart = market.totalAssets();

        _warpLive(block.timestamp + 14 days);
        uint256 half = market.totalAssets();
        assertGt(half, atStart);

        _warpLive(maturity);
        assertEq(market.totalAssets(), LEND - 9_000e6 + face);
        assertGt(half - atStart, 0);
    }

    function test_earlyRepay_paysOnlyForTimeUsed() public {
        uint256 face = _borrow(9_000e6);
        _warpLive(block.timestamp + 7 days);
        uint256 owed = market.debtOf(borrower);
        // roughly 7 days of interest on 9,000 at 8%
        uint256 principal = 9_000e6;
        assertApproxEqRel(owed, principal + (principal * 8 * 7) / (100 * 365), 0.001e18);

        vm.prank(borrower);
        uint256 paid = market.repay(borrower, type(uint256).max);
        assertEq(paid, owed);
        (, uint256 remaining) = market.positions(borrower);
        assertEq(remaining, 0);
        assertEq(market.totalFace(), 0);
        assertLt(paid, face);
    }

    function test_borrow_revertsAboveBaseLtv() public {
        // 55% of $18,000 = $9,900
        vm.prank(borrower);
        vm.expectRevert();
        market.borrow(9_950e6, borrower);
        _borrow(9_850e6);
    }

    function test_borrow_revertsAfterMaturity() public {
        _warpLive(maturity);
        vm.prank(borrower);
        vm.expectRevert(AfterglowMarket.Matured.selector);
        market.borrow(1_000e6, borrower);
    }

    // ------------------------------------------------------------------
    // Session-aware risk
    // ------------------------------------------------------------------

    function test_closingWindow_rampsBorrowLimit() public {
        _warpLive(MONDAY + 5 days - 2 hours); // halfway through the 4h window
        (PhaselockOracle.Session s,, uint256 maxLtv,) = market.marketStatus();
        assertEq(uint8(s), uint8(PhaselockOracle.Session.Closing));
        assertEq(maxLtv, 5_000); // 55% -> 45%, halfway

        vm.prank(borrower);
        vm.expectRevert();
        market.borrow(9_200e6, borrower); // ~51%
        _borrow(8_900e6); // ~49.5%
    }

    function test_weekend_noBorrowNoLiquidation_butRepayAndTopUpWork() public {
        _borrow(9_000e6);
        _warpLive(MONDAY + 5 days - 1);
        vm.warp(MONDAY + 5 days + 12 hours); // Saturday, feed silent

        (PhaselockOracle.Session s,,,) = market.marketStatus();
        assertEq(uint8(s), uint8(PhaselockOracle.Session.Closed));

        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(AfterglowMarket.MarketNotLive.selector, PhaselockOracle.Session.Closed));
        market.borrow(100e6, borrower);

        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(AfterglowMarket.MarketNotLive.selector, PhaselockOracle.Session.Closed));
        market.liquidate(borrower, type(uint256).max);

        nvda.mint(borrower, 10e18);
        vm.startPrank(borrower);
        market.depositCollateral(10e18, borrower);
        market.repay(borrower, 1_000e6);
        vm.stopPrank();
    }

    function test_weekend_withdrawOnlyWithinWeekendLtv() public {
        _borrow(7_000e6); // ~38.9% of $18,000
        vm.warp(MONDAY + 5 days + 12 hours); // Saturday => Closed

        // Withdrawing 10 NVDA -> $16,200 collateral, ~43.2%: inside 45%
        vm.prank(borrower);
        market.withdrawCollateral(10e18, borrower);

        // Another 5 -> $15,300, ~45.8%: above weekend LTV
        vm.prank(borrower);
        vm.expectRevert();
        market.withdrawCollateral(5e18, borrower);
    }

    function test_halted_blocksWithdrawButNotRepay() public {
        _borrow(5_000e6);
        nvda.setOraclePaused(true);

        vm.prank(borrower);
        vm.expectRevert(AfterglowMarket.MarketHalted.selector);
        market.withdrawCollateral(1e18, borrower);

        vm.prank(borrower);
        market.repay(borrower, type(uint256).max);

        // with no debt, collateral can always leave
        vm.prank(borrower);
        market.withdrawCollateral(COLLATERAL, borrower);
        assertEq(nvda.balanceOf(borrower), COLLATERAL);
    }

    // ------------------------------------------------------------------
    // Liquidation
    // ------------------------------------------------------------------

    function test_liquidate_partialWithBonus() public {
        _borrow(9_800e6); // ~54.4%
        _setPrice(140e8); // $14,000 collateral, ~70% > 65%

        assertTrue(market.isLiquidatable(borrower));
        uint256 faceBefore = market.totalFace();

        vm.prank(liquidator);
        (uint256 repaid, uint256 seized) = market.liquidate(borrower, 2_000e6);

        // seized value = repaid * 1.07 at $140
        assertApproxEqRel(seized * 140, repaid * 107e12 / 100 * 1, 0.0001e18);
        assertEq(nvda.balanceOf(liquidator), seized);
        assertEq(market.totalFace(), faceBefore - 2_000e6);
        assertEq(market.badDebt(), 0);
    }

    function test_liquidate_revertsWhenHealthy() public {
        _borrow(9_000e6);
        vm.prank(liquidator);
        vm.expectRevert(AfterglowMarket.PositionHealthy.selector);
        market.liquidate(borrower, 1_000e6);
    }

    function test_liquidate_crash_writesOffBadDebt() public {
        _borrow(9_800e6);
        _setPrice(80e8); // $8,000 of collateral against ~$9,800 of debt

        uint256 assetsBefore = market.totalAssets();
        vm.prank(liquidator);
        (, uint256 seized) = market.liquidate(borrower, type(uint256).max);

        assertEq(seized, COLLATERAL);
        (uint256 coll, uint256 face) = market.positions(borrower);
        assertEq(coll, 0);
        assertEq(face, 0);
        assertGt(market.badDebt(), 0);
        assertLt(market.totalAssets(), assetsBefore); // lenders absorb the loss
    }

    function test_default_afterGrace_isLiquidatable() public {
        _borrow(5_000e6); // healthy
        _warpLive(uint256(maturity) + 2 days);
        assertFalse(market.isLiquidatable(borrower));
        _warpLive(uint256(maturity) + 2 days + 1);
        assertTrue(market.isLiquidatable(borrower));
        vm.prank(liquidator);
        market.liquidate(borrower, type(uint256).max);
        (, uint256 face) = market.positions(borrower);
        assertEq(face, 0);
    }

    // ------------------------------------------------------------------
    // Lender side / ERC-4626
    // ------------------------------------------------------------------

    function test_lenderWithdrawLimitedToCash() public {
        _borrow(9_000e6);
        assertEq(market.maxWithdraw(lender), LEND - 9_000e6);
        vm.prank(lender);
        vm.expectRevert();
        market.withdraw(LEND, lender, lender);
    }

    function test_lenderRedeemsAtMaturityWithInterest() public {
        uint256 face = _borrow(9_000e6);
        _warpLive(maturity);
        vm.prank(borrower);
        market.repay(borrower, type(uint256).max);

        uint256 shares = market.balanceOf(lender);
        vm.prank(lender);
        uint256 out = market.redeem(shares, lender, lender);
        assertApproxEqAbs(out, LEND - 9_000e6 + face, 1);
        assertGt(out, LEND);
    }

    function test_donation_doesNotChangeSharePrice() public {
        uint256 before = market.convertToAssets(1e18);
        usdg.mint(address(market), 1_000_000e6);
        assertEq(market.convertToAssets(1e18), before);
    }

    function test_noDepositsAfterMaturity() public {
        _warpLive(maturity);
        assertEq(market.maxDeposit(lender), 0);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function test_pause_blocksNewRiskOnly() public {
        _borrow(5_000e6);
        vm.prank(guardian);
        market.pause();

        vm.prank(borrower);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        market.borrow(100e6, borrower);
        assertEq(market.maxDeposit(lender), 0);

        vm.prank(borrower);
        market.repay(borrower, type(uint256).max);
        vm.prank(lender);
        market.withdraw(1_000e6, lender, lender);

        vm.prank(guardian);
        vm.expectRevert();
        market.unpause(); // only owner
    }

    function test_riskParamsValidated() public {
        vm.startPrank(owner);
        vm.expectRevert(AfterglowMarket.InvalidRiskParams.selector);
        market.setRiskParams(AfterglowMarket.RiskParams(6000, 4500, 6000, 500)); // base == liq
        vm.expectRevert(AfterglowMarket.InvalidRiskParams.selector);
        market.setRiskParams(AfterglowMarket.RiskParams(5000, 5500, 6500, 500)); // weekend > base
        vm.expectRevert(AfterglowMarket.InvalidRiskParams.selector);
        market.setRiskParams(AfterglowMarket.RiskParams(8000, 7000, 9500, 600)); // insolvent at threshold
        vm.stopPrank();
    }

    // ------------------------------------------------------------------
    // Fuzz
    // ------------------------------------------------------------------

    /// @dev Borrowing then repaying at any time never leaves lenders worse off.
    function testFuzz_borrowRepay_neverHurtsLenders(uint256 assets, uint256 wait) public {
        assets = bound(assets, 1, 9_800e6);
        wait = bound(wait, 0, 28 days);
        uint256 before = market.totalAssets();

        _borrow(assets);
        _warpLive(block.timestamp + wait);
        vm.prank(borrower);
        market.repay(borrower, type(uint256).max);

        assertEq(market.totalFace(), 0);
        assertGe(market.totalAssets(), before);
    }

    /// @dev Depositing then immediately redeeming never returns more than was put in.
    function testFuzz_depositRedeem_noFreeValue(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        _borrow(5_000e6);
        _warpLive(block.timestamp + 3 days);

        address alice = makeAddr("alice");
        usdg.mint(alice, amount);
        vm.startPrank(alice);
        usdg.approve(address(market), amount);
        uint256 shares = market.deposit(amount, alice);
        uint256 back = market.previewRedeem(shares);
        vm.stopPrank();
        assertLe(back, amount);
    }
}
