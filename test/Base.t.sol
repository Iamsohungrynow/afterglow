// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {PhaselockOracle} from "../src/PhaselockOracle.sol";
import {AfterglowMarket} from "../src/AfterglowMarket.sol";
import {MockERC20, MockStockToken, MockFeed} from "./mocks/Mocks.sol";

abstract contract BaseTest is Test {
    /// @dev A Monday 00:00 UTC in September 2026: (MONDAY + 3 days) % 1 weeks == 0.
    uint256 internal constant MONDAY = 2960 weeks + 4 days;

    address internal owner = makeAddr("owner");
    address internal guardian = makeAddr("guardian");
    address internal lender = makeAddr("lender");
    address internal borrower = makeAddr("borrower");
    address internal liquidator = makeAddr("liquidator");

    MockERC20 internal usdg;
    MockStockToken internal nvda;
    MockFeed internal feed;
    PhaselockOracle internal oracle;

    int256 internal constant NVDA_PRICE = 180e8; // $180, 8 decimals
    uint32 internal constant MAX_STALENESS = 26 hours; // Robinhood feeds: 24h heartbeat + buffer

    function _deployOracle() internal {
        vm.warp(MONDAY + 12 hours);
        usdg = new MockERC20("Global Dollar", "USDG", 6);
        nvda = new MockStockToken("NVDA");
        feed = new MockFeed(8);
        feed.set(NVDA_PRICE, block.timestamp);

        oracle = new PhaselockOracle(owner);
        vm.prank(owner);
        oracle.setAsset(address(nvda), feed, MAX_STALENESS, true);
    }

    /// @dev Moves time and keeps the feed fresh, as it is during market hours.
    function _warpLive(uint256 t) internal {
        vm.warp(t);
        feed.set(feed.answer(), t);
    }

    function _setPrice(int256 price) internal {
        feed.set(price, block.timestamp);
    }

    /// @dev Suites for the fixed-rate, tranche and sweep mechanics switch the weekend premium off so
    /// their amounts stay exact; the premium has its own suite (AfterglowPremium.t.sol).
    function _noPremium(AfterglowMarket m) internal {
        vm.prank(owner);
        m.setPremiumParams(AfterglowMarket.PremiumParams(0, 0, 0, 0));
    }
}
