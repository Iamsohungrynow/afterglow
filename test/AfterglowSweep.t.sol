// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {AfterglowMarket} from "../src/AfterglowMarket.sol";
import {PhaselockOracle} from "../src/PhaselockOracle.sol";
import {DemoSavingsVault} from "../src/demo/DemoSavingsVault.sol";
import {MockERC20} from "./mocks/Mocks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

contract AfterglowSweepTest is BaseTest {
    AfterglowMarket internal market;
    DemoSavingsVault internal savings;

    uint256 internal constant DEPOSIT = 100_000e6;
    uint256 internal constant SAVINGS_RATE = 0.036e18;
    uint256 internal constant SATURDAY = MONDAY + 5 days + 12 hours;

    function setUp() public {
        _deployOracle();
        market = new AfterglowMarket(
            AfterglowMarket.Config({
                loanToken: IERC20(address(usdg)),
                collateralToken: IERC20(address(nvda)),
                oracle: oracle,
                maturity: uint64(block.timestamp + 28 days),
                gracePeriod: 2 days,
                rateWad: 0.08e18,
                risk: AfterglowMarket.RiskParams({baseLtvBps: 5500, weekendLtvBps: 4500, liqLtvBps: 6500, liqBonusBps: 700}),
                supplyCap: type(uint256).max,
                owner: owner,
                guardian: guardian,
                name: "Afterglow USDG/NVDA",
                symbol: "glowUSDG-NVDA"
            })
        );
        savings = new DemoSavingsVault(IERC20(address(usdg)), SAVINGS_RATE, owner);
        usdg.mint(address(savings), 10_000e6); // yield reserve

        usdg.mint(lender, 1_000_000e6);
        vm.startPrank(lender);
        usdg.approve(address(market), type(uint256).max);
        market.deposit(DEPOSIT, lender);
        vm.stopPrank();

        nvda.mint(borrower, 1_000e18); // $180,000
        vm.startPrank(borrower);
        nvda.approve(address(market), type(uint256).max);
        usdg.approve(address(market), type(uint256).max);
        market.depositCollateral(1_000e18, borrower);
        vm.stopPrank();

        vm.prank(owner);
        market.setIdleVault(IERC4626(address(savings)));
    }

    function _weekend() internal {
        _warpLive(MONDAY + 5 days - 1);
        vm.warp(SATURDAY);
    }

    // --- Targets follow the market clock ------------------------------------------------------

    function test_noVault_rebalanceIsNoop() public {
        vm.prank(owner);
        market.setIdleVault(IERC4626(address(0)));
        (uint256 d, uint256 r) = market.rebalance();
        assertEq(d + r, 0);
        assertEq(market.cash(), DEPOSIT);
    }

    function test_live_keepsBorrowerBuffer() public {
        (uint256 deployed,) = market.rebalance();
        assertEq(deployed, 80_000e6);
        assertEq(market.cash(), 20_000e6);
        assertApproxEqAbs(market.idleAssets(), 80_000e6, 1);
        assertApproxEqAbs(market.totalAssets(), DEPOSIT, 1);
    }

    function test_closed_sweepsNearlyEverything() public {
        _weekend();
        (PhaselockOracle.Session s,,,) = market.marketStatus();
        assertEq(uint8(s), uint8(PhaselockOracle.Session.Closed));

        market.rebalance();
        assertEq(market.cash(), 5_000e6);
        assertApproxEqAbs(market.idleAssets(), 95_000e6, 1);
    }

    function test_reopen_pullsBufferBack() public {
        _weekend();
        market.rebalance();
        _warpLive(MONDAY + 1 weeks + 1 hours); // Monday, fresh print

        (uint256 deployed, uint256 recalled) = market.rebalance();
        assertEq(deployed, 0);
        assertGt(recalled, 14_900e6);
        assertApproxEqAbs(market.cash(), 20_000e6, 200e6); // plus a week of savings yield on the buffer
    }

    function test_halted_recallsEverything() public {
        market.rebalance();
        vm.warp(block.timestamp + 27 hours); // open, but the feed missed its heartbeat
        (PhaselockOracle.Session s,,,) = market.marketStatus();
        assertEq(uint8(s), uint8(PhaselockOracle.Session.Halted));

        market.rebalance();
        assertEq(market.idleShares(), 0);
        assertEq(market.idleAssets(), 0);
        assertGe(market.cash(), DEPOSIT);
    }

    function test_paused_recallsEverything() public {
        market.rebalance();
        vm.prank(guardian);
        market.pause();
        market.rebalance();
        assertEq(market.idleShares(), 0);
    }

    function test_matured_recallsEverything() public {
        market.rebalance();
        _warpLive(market.maturity() + 1);
        market.rebalance();
        assertEq(market.idleShares(), 0);
        assertEq(market.maxWithdraw(lender), market.convertToAssets(market.balanceOf(lender)));
    }

    // --- Nobody is blocked --------------------------------------------------------------------

    function test_borrow_pullsFromVaultOnDemand() public {
        market.rebalance(); // 20k cash, 80k idle
        vm.prank(borrower);
        market.borrow(50_000e6, borrower);
        assertEq(usdg.balanceOf(borrower), 50_000e6);
        assertEq(market.cash(), 0);
        assertApproxEqAbs(market.idleAssets(), 50_000e6, 2);
    }

    function test_lenderWithdraw_pullsFromVaultOnWeekend() public {
        _weekend();
        market.rebalance(); // 5k cash
        uint256 before = usdg.balanceOf(lender);
        vm.prank(lender);
        market.withdraw(90_000e6, lender, lender);
        assertEq(usdg.balanceOf(lender) - before, 90_000e6);
    }

    function test_maxWithdraw_includesIdle() public {
        market.rebalance();
        assertApproxEqAbs(market.maxWithdraw(lender), DEPOSIT, 2);
    }

    function test_borrow_moreThanLiquid_reverts() public {
        market.rebalance();
        nvda.mint(borrower, 10_000e18);
        vm.prank(borrower);
        market.depositCollateral(10_000e18, borrower);
        vm.prank(borrower);
        vm.expectRevert(AfterglowMarket.InsufficientCash.selector);
        market.borrow(DEPOSIT + 1e6, borrower);
    }

    // --- Yield and accounting -----------------------------------------------------------------

    function test_savingsYield_goesToLenders() public {
        market.rebalance();
        uint256 priceBefore = market.convertToAssets(1e12);
        _warpLive(block.timestamp + 14 days);
        // 80k at 3.6% for 14 days is about 110 USDG
        assertApproxEqAbs(market.totalAssets() - DEPOSIT, 110e6, 1e6);
        assertGt(market.convertToAssets(1e12), priceBefore);
    }

    function test_donatedVaultShares_doNotMoveSharePrice() public {
        market.rebalance();
        uint256 assetsBefore = market.totalAssets();
        address donor = makeAddr("donor");
        usdg.mint(donor, 50_000e6);
        vm.startPrank(donor);
        usdg.approve(address(savings), type(uint256).max);
        savings.deposit(50_000e6, donor);
        IERC20(address(savings)).transfer(address(market), savings.balanceOf(donor));
        vm.stopPrank();
        assertEq(market.totalAssets(), assetsBefore);
    }

    function test_minMove_skipsSmallMoves() public {
        market.rebalance();
        vm.prank(lender);
        market.deposit(500e6, lender); // 0.5% of assets, below the 1% threshold
        (uint256 d, uint256 r) = market.rebalance();
        assertEq(d + r, 0);
    }

    function test_maxIdle_capsDeployment() public {
        vm.prank(owner);
        market.setSweepParams(AfterglowMarket.SweepParams(2000, 500, 100, 30_000e6));
        market.rebalance();
        assertApproxEqAbs(market.idleAssets(), 30_000e6, 1);
        assertEq(market.cash(), 70_000e6);
    }

    function test_rebalance_isPermissionless() public {
        vm.prank(makeAddr("anyone"));
        (uint256 deployed,) = market.rebalance();
        assertEq(deployed, 80_000e6);
    }

    // --- Admin --------------------------------------------------------------------------------

    function test_recallAll_ownerOrGuardianOnly() public {
        market.rebalance();
        vm.prank(makeAddr("anyone"));
        vm.expectRevert(AfterglowMarket.NotGuardian.selector);
        market.recallAll();

        vm.prank(guardian);
        market.recallAll();
        assertEq(market.idleShares(), 0);
        assertApproxEqAbs(market.cash(), DEPOSIT, 1);
    }

    function test_setIdleVault_rejectsWrongAsset() public {
        MockERC20 other = new MockERC20("Other", "OTH", 6);
        DemoSavingsVault wrong = new DemoSavingsVault(IERC20(address(other)), SAVINGS_RATE, owner);
        vm.prank(owner);
        vm.expectRevert(AfterglowMarket.InvalidConfig.selector);
        market.setIdleVault(IERC4626(address(wrong)));
    }

    function test_setIdleVault_refusesWhileInUse() public {
        market.rebalance();
        vm.prank(owner);
        vm.expectRevert(AfterglowMarket.IdleVaultInUse.selector);
        market.setIdleVault(IERC4626(address(0)));
    }

    function test_setSweepParams_bounds() public {
        vm.prank(owner);
        vm.expectRevert(AfterglowMarket.InvalidConfig.selector);
        market.setSweepParams(AfterglowMarket.SweepParams(10_001, 500, 100, type(uint256).max));
    }

    // --- Demo savings vault -------------------------------------------------------------------

    function test_demoVault_yieldStopsWhenReserveRunsDry() public {
        DemoSavingsVault dry = new DemoSavingsVault(IERC20(address(usdg)), 1e18, owner); // 100%, no reserve
        vm.startPrank(lender);
        usdg.approve(address(dry), type(uint256).max);
        dry.deposit(1_000e6, lender);
        vm.warp(block.timestamp + 365 days);
        assertEq(dry.totalAssets(), 1_000e6); // capped at what it holds
        dry.redeem(dry.balanceOf(lender), lender, lender);
        vm.stopPrank();
        assertEq(usdg.balanceOf(address(dry)), 0);
    }

    /// Whatever sequence of deposits, borrows and rebalances, lenders can always get back all
    /// unlent USDG, and the idle vault never holds more than the target allows.
    function testFuzz_unlentAlwaysWithdrawable(uint96 borrowAmt, bool weekend) public {
        uint256 b = bound(uint256(borrowAmt), 1e6, 90_000e6);
        market.rebalance();
        vm.prank(borrower);
        market.borrow(b, borrower);
        if (weekend) _weekend();
        market.rebalance();
        assertGe(market.liquidAssets() + 3, DEPOSIT - b); // plus any savings yield earned meanwhile
        uint256 max = market.maxWithdraw(lender);
        vm.prank(lender);
        market.withdraw(max, lender, lender);
        assertLe(market.cash() + market.idleAssets(), 3);
    }
}
