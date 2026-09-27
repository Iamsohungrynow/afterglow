// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PhaselockOracle} from "../../src/PhaselockOracle.sol";
import {AfterglowMarket} from "../../src/AfterglowMarket.sol";
import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";
import {IStockToken} from "../../src/interfaces/IStockToken.sol";

/// @notice Runs against Robinhood Chain mainnet state. Opt in with `FORK=true forge test`.
/// Forks the latest block (the public RPC keeps no archive state) and warps to a computed
/// weekend or reopen, so results do not depend on the day the tests run.
contract RobinhoodForkTest is Test {
    // Robinhood Chain (4663) addresses: docs.robinhood.com/chain/contracts, Chainlink feed directory.
    address internal constant NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
    address internal constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant NVDA_USD_FEED = 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15;
    address internal constant USDG_USD_FEED = 0x61B7e5650328764B076A108EFF5fa7282a1B9aD2;

    address internal owner = makeAddr("owner");
    address internal lender = makeAddr("lender");
    address internal borrower = makeAddr("borrower");

    PhaselockOracle internal oracle;
    AfterglowMarket internal market;
    AggregatorV3Interface internal feed = AggregatorV3Interface(NVDA_USD_FEED);

    function setUp() public {
        if (!vm.envOr("FORK", false)) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork("robinhood");

        oracle = new PhaselockOracle(owner);
        vm.prank(owner);
        oracle.setAsset(NVDA, feed, 26 hours, true);

        market = new AfterglowMarket(
            AfterglowMarket.Config({
                loanToken: IERC20(USDG),
                collateralToken: IERC20(NVDA),
                oracle: oracle,
                maturity: uint64(block.timestamp + 28 days),
                gracePeriod: 2 days,
                rateWad: 0.08e18,
                risk: AfterglowMarket.RiskParams({baseLtvBps: 5500, weekendLtvBps: 4500, liqLtvBps: 6500, liqBonusBps: 700}),
                supplyCap: type(uint256).max,
                owner: owner,
                guardian: owner,
                name: "Afterglow USDG/NVDA 28d",
                symbol: "glowUSDG-NVDA"
            })
        );

        deal(USDG, lender, 50_000e6);
        vm.startPrank(lender);
        IERC20(USDG).approve(address(market), type(uint256).max);
        market.deposit(50_000e6, lender);
        vm.stopPrank();

        deal(NVDA, borrower, 20e18);
        vm.startPrank(borrower);
        IERC20(NVDA).approve(address(market), type(uint256).max);
        market.depositCollateral(20e18, borrower);
        vm.stopPrank();
    }

    /// @dev First Saturday 12:00 UTC strictly after both now and the feed's last print.
    function _warpToWeekend() internal returns (uint256 saturday) {
        (,,, uint256 updatedAt,) = feed.latestRoundData();
        uint256 t = updatedAt > block.timestamp ? updatedAt : block.timestamp;
        uint256 intoWeek = (t + 3 days) % 1 weeks; // Monday 00:00 UTC = 0
        saturday = t - intoWeek + 5 days + 12 hours;
        if (saturday <= t) saturday += 1 weeks;
        vm.warp(saturday);
    }

    /// @dev Pretends the feed published `price` (8 decimals) at `t`, as it would after Monday's open.
    function _mockPrint(int256 price, uint256 t) internal {
        vm.mockCall(
            NVDA_USD_FEED,
            abi.encodeWithSelector(AggregatorV3Interface.latestRoundData.selector),
            abi.encode(uint80(1), price, t, t, uint80(1))
        );
    }

    function test_fork_realTokenAndFeedShape() public view {
        assertEq(feed.decimals(), 8);
        assertEq(IStockToken(NVDA).oraclePaused(), false);
        assertGt(IStockToken(NVDA).uiMultiplier(), 1e18); // dividends already folded in
        assertEq(IERC20(USDG).balanceOf(address(market)), 50_000e6);
    }

    function test_fork_realUsdgFeed_isFreshAndOnPeg() public {
        vm.prank(owner);
        oracle.setStableFeed(AggregatorV3Interface(USDG_USD_FEED), 26 hours, 200);
        (bool ok, uint256 usdgUsd) = oracle.stableUsd();
        assertTrue(ok);
        assertApproxEqRel(usdgUsd, 1e18, 0.02e18);
    }

    function test_fork_weekendIsClosed_withLastPrice() public {
        _warpToWeekend();
        PhaselockOracle.Quote memory q = oracle.quote(NVDA);
        assertEq(uint8(q.session), uint8(PhaselockOracle.Session.Closed));
        (, int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        assertEq(q.price, uint256(answer) * 1e10);
        assertEq(q.updatedAt, updatedAt);
        assertTrue(oracle.isMarketClosed());
    }

    function test_fork_weekend_blocksBorrow() public {
        _warpToWeekend();
        vm.prank(borrower);
        vm.expectRevert(
            abi.encodeWithSelector(AfterglowMarket.MarketNotLive.selector, PhaselockOracle.Session.Closed)
        );
        market.borrow(1_000e6, borrower);
    }

    function test_fork_mondayReopen_borrowAfterFirstPrint() public {
        (, int256 fridayPrice,,,) = feed.latestRoundData();
        uint256 mondayOpen = _warpToWeekend() + 1 days + 12 hours; // following Monday 00:00 UTC
        vm.warp(mondayOpen + 14 hours); // 10:00 ET, feed has not printed yet
        assertEq(uint8(oracle.quote(NVDA).session), uint8(PhaselockOracle.Session.Closed));

        _mockPrint(fridayPrice, block.timestamp);
        assertEq(uint8(oracle.quote(NVDA).session), uint8(PhaselockOracle.Session.Live));

        // 20 NVDA at ~$225 = ~$4,500; borrow ~50%
        uint256 collateralUsd = (20 * uint256(fridayPrice)) / 1e2; // 6-decimal USD
        uint256 amount = collateralUsd / 2;
        (uint256 premium,,) = market.premiumFor(amount);
        assertGt(premium, 0); // weekends remain before maturity
        vm.prank(borrower);
        market.borrow(amount, borrower);
        assertEq(IERC20(USDG).balanceOf(borrower), amount - premium);
        assertGt(market.debtOf(borrower), amount - 1);
    }
}
