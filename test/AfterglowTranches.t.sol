// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {AfterglowMarket} from "../src/AfterglowMarket.sol";
import {AfterglowTranches, TrancheToken} from "../src/AfterglowTranches.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

contract AfterglowTranchesTest is BaseTest {
    AfterglowMarket internal market;
    AfterglowTranches internal tranches;

    address internal alice = makeAddr("alice"); // senior / protected
    address internal bob = makeAddr("bob"); // junior / boost

    uint256 internal constant MARKET_RATE = 0.08e18;
    uint256 internal constant SENIOR_RATE = 0.05e18;
    uint64 internal maturity;

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
                rateWad: MARKET_RATE,
                risk: AfterglowMarket.RiskParams({baseLtvBps: 5500, weekendLtvBps: 4500, liqLtvBps: 6500, liqBonusBps: 700}),
                supplyCap: type(uint256).max,
                owner: owner,
                guardian: guardian,
                name: "Afterglow USDG/NVDA",
                symbol: "glowUSDG-NVDA"
            })
        );
        tranches = new AfterglowTranches(IERC4626(address(market)), SENIOR_RATE, 2000, owner, "NVDA");

        for (uint256 i; i < 2; ++i) {
            address who = i == 0 ? alice : bob;
            usdg.mint(who, 1_000_000e6);
            vm.prank(who);
            usdg.approve(address(tranches), type(uint256).max);
        }

        nvda.mint(borrower, 1_000e18); // $180,000
        usdg.mint(borrower, 100_000e6);
        vm.startPrank(borrower);
        nvda.approve(address(market), type(uint256).max);
        usdg.approve(address(market), type(uint256).max);
        market.depositCollateral(1_000e18, borrower);
        vm.stopPrank();

        usdg.mint(liquidator, 1_000_000e6);
        vm.prank(liquidator);
        usdg.approve(address(market), type(uint256).max);
    }

    function _fund(uint256 juniorAmt, uint256 seniorAmt) internal {
        vm.prank(bob);
        tranches.depositJunior(juniorAmt, bob);
        vm.prank(alice);
        tranches.depositSenior(seniorAmt, alice);
    }

    function _values() internal view returns (uint256 s, uint256 j) {
        return tranches.trancheValues();
    }

    // ------------------------------------------------------------------
    // Waterfall
    // ------------------------------------------------------------------

    function test_waterfall_seniorGetsTarget_juniorGetsTheRest() public {
        _fund(30_000e6, 70_000e6);
        vm.prank(borrower);
        market.borrow(90_000e6, borrower); // 90% of the pool at 8%

        _warpLive(maturity);
        vm.prank(borrower);
        market.repay(borrower, type(uint256).max);

        (uint256 s, uint256 j) = _values();
        uint256 seniorIn = 70_000e6;
        uint256 lent = 90_000e6;
        uint256 seniorTarget = seniorIn + (seniorIn * 5 * 28) / (100 * 365); // 5% on 70k for 28 days
        assertApproxEqAbs(s, seniorTarget, 2);

        uint256 poolInterest = s + j - 100_000e6;
        assertApproxEqAbs(poolInterest, (lent * 8 * 28) / (100 * 365), 3);
        // Junior earns its own share plus the spread senior gave up: well above the pool's 7.2% (8% x 90%)
        uint256 juniorGain = j - 30_000e6;
        assertGt(juniorGain * 365 * 10_000 / (30_000e6 * 28), 1_200); // > 12% annualised
    }

    function test_withdrawals_payOutEachTranche() public {
        _fund(30_000e6, 70_000e6);
        vm.prank(borrower);
        market.borrow(50_000e6, borrower);
        _warpLive(maturity);
        vm.prank(borrower);
        market.repay(borrower, type(uint256).max);

        (uint256 sAlice, uint256 jBob) = (0, 0);
        (sAlice,) = tranches.balancesOf(alice);
        (, jBob) = tranches.balancesOf(bob);

        vm.prank(alice);
        tranches.withdrawSenior(sAlice, alice);
        assertApproxEqAbs(usdg.balanceOf(alice), 1_000_000e6 - 70_000e6 + sAlice, 1);
        assertGt(sAlice, 70_000e6);

        vm.prank(bob);
        tranches.withdrawJunior(jBob, bob);
        assertGt(usdg.balanceOf(bob), 1_000_000e6 - 1);
    }

    // ------------------------------------------------------------------
    // Losses
    // ------------------------------------------------------------------

    function _crashAndLiquidate(int256 price) internal {
        _setPrice(price);
        vm.prank(liquidator);
        market.liquidate(borrower, type(uint256).max);
    }

    function test_loss_hitsJuniorFirst() public {
        _fund(30_000e6, 70_000e6);
        vm.prank(borrower);
        market.borrow(95_000e6, borrower); // ~52.8% LTV
        (uint256 sBefore, uint256 jBefore) = _values();

        _crashAndLiquidate(80e8); // collateral now $80,000 against ~$95,000 of debt

        (uint256 s, uint256 j) = _values();
        assertGt(market.badDebt(), 0);
        assertGe(s, sBefore); // protected
        assertLt(j, jBefore - 10_000e6); // junior absorbed the shortfall
    }

    function test_catastrophicLoss_reachesSeniorOnlyAfterJuniorIsGone() public {
        _fund(20_000e6, 80_000e6);
        vm.prank(borrower);
        market.borrow(98_000e6, borrower);

        _crashAndLiquidate(40e8); // collateral $40,000: pool loses well over the junior 20k

        (uint256 s, uint256 j) = _values();
        assertEq(j, 0);
        assertLt(s, 80_000e6);
        assertEq(s, tranches.poolValue());

        vm.prank(bob);
        vm.expectRevert(AfterglowTranches.JuniorWipedOut.selector);
        tranches.depositJunior(1_000e6, bob);
    }

    // ------------------------------------------------------------------
    // Cover rules and liquidity
    // ------------------------------------------------------------------

    function test_seniorDeposit_needsJuniorCover() public {
        vm.prank(bob);
        tranches.depositJunior(10_000e6, bob);

        vm.prank(alice);
        vm.expectRevert(); // 10 / 55 = 18.2% < 20%
        tranches.depositSenior(45_000e6, alice);

        vm.prank(alice);
        tranches.depositSenior(40_000e6, alice); // exactly 20%
        assertEq(tranches.juniorCoverBps(), 2000);
    }

    function test_juniorWithdraw_blockedBelowCover() public {
        _fund(30_000e6, 70_000e6);
        vm.prank(bob);
        vm.expectRevert();
        tranches.withdrawJunior(15_000e6, bob); // would leave 15 / 85 = 17.6%

        vm.prank(bob);
        tranches.withdrawJunior(10_000e6, bob); // 20 / 90 = 22.2%
    }

    function test_juniorAlone_canLeaveFreely() public {
        vm.startPrank(bob);
        tranches.depositJunior(10_000e6, bob);
        tranches.withdrawJunior(10_000e6, bob);
        vm.stopPrank();
        assertEq(usdg.balanceOf(bob), 1_000_000e6);
    }

    function test_withdraw_limitedByMarketLiquidity() public {
        _fund(30_000e6, 70_000e6);
        vm.prank(borrower);
        market.borrow(90_000e6, borrower); // only 10k cash left in the market

        vm.prank(alice);
        vm.expectRevert();
        tranches.withdrawSenior(20_000e6, alice);

        vm.prank(alice);
        tranches.withdrawSenior(5_000e6, alice);
    }

    function test_onlyVaultMintsShares() public {
        TrancheToken s = tranches.senior();
        vm.expectRevert(TrancheToken.OnlyVault.selector);
        s.mint(alice, 1);
    }

    function test_seniorRateChange_accruesOldRateFirst() public {
        _fund(30_000e6, 70_000e6);
        _warpLive(block.timestamp + 10 days);
        uint256 before = tranches.pendingSeniorClaim();
        vm.prank(owner);
        tranches.setParams(0.03e18, 2000);
        assertEq(tranches.seniorClaim(), before);
    }

    // ------------------------------------------------------------------
    // Fuzz
    // ------------------------------------------------------------------

    /// @dev Depositing and immediately withdrawing the same amount never returns more than was put in.
    function testFuzz_roundTrip_noFreeValue(uint256 j, uint256 s) public {
        j = bound(j, 1e6, 200_000e6); // keeps senior (<= 4j) within alice's 1M balance
        s = bound(s, 1e6, j * 4); // keep junior cover >= 20%
        _fund(j, s);

        (uint256 sAlice,) = tranches.balancesOf(alice);
        (, uint256 jBob) = tranches.balancesOf(bob);
        assertLe(sAlice, s);
        assertLe(jBob, j);
    }
}
