// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BaseTest} from "./Base.t.sol";
import {PhaselockOracle} from "../src/PhaselockOracle.sol";
import {MockERC20, MockFeed} from "./mocks/Mocks.sol";

contract PhaselockOracleTest is BaseTest {
    function setUp() public {
        _deployOracle();
    }

    function _session() internal view returns (PhaselockOracle.Session) {
        return oracle.quote(address(nvda)).session;
    }

    function test_live_normalisesPriceTo18Decimals() public view {
        PhaselockOracle.Quote memory q = oracle.quote(address(nvda));
        assertEq(uint8(q.session), uint8(PhaselockOracle.Session.Live));
        assertEq(q.price, 180e18);
        assertEq(q.rampBps, 0);
    }

    function test_secondsUntilWeeklyClose() public {
        vm.warp(MONDAY);
        assertEq(oracle.secondsUntilWeeklyClose(), 5 days);
        vm.warp(MONDAY + 5 days - 1);
        assertEq(oracle.secondsUntilWeeklyClose(), 1);
        vm.warp(MONDAY + 5 days); // exactly at close: next close is a week away
        assertEq(oracle.secondsUntilWeeklyClose(), 7 days);
        vm.warp(MONDAY + 6 days);
        assertEq(oracle.secondsUntilWeeklyClose(), 6 days);
    }

    function test_closing_rampsThroughWindow() public {
        _warpLive(MONDAY + 5 days - 4 hours); // window opens
        PhaselockOracle.Quote memory q = oracle.quote(address(nvda));
        assertEq(uint8(q.session), uint8(PhaselockOracle.Session.Closing));
        assertEq(q.rampBps, 0);

        _warpLive(MONDAY + 5 days - 2 hours);
        assertEq(oracle.quote(address(nvda)).rampBps, 5_000);

        _warpLive(MONDAY + 5 days - 1);
        assertGt(oracle.quote(address(nvda)).rampBps, 9_990);
    }

    function test_live_justBeforeWindow() public {
        _warpLive(MONDAY + 5 days - 4 hours - 1);
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Live));
    }

    function test_closed_whenFeedStale_keepsLastPrice() public {
        vm.warp(block.timestamp + MAX_STALENESS + 1);
        PhaselockOracle.Quote memory q = oracle.quote(address(nvda));
        assertEq(uint8(q.session), uint8(PhaselockOracle.Session.Closed));
        assertEq(q.price, 180e18);
    }

    function test_closed_overWeekend() public {
        _warpLive(MONDAY + 5 days - 1); // last update just before Friday 20:00 ET
        vm.warp(MONDAY + 6 days); // Sunday 00:00 UTC, feed silent
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Closed));
    }

    function test_halted_whenIssuerPausesOracle() public {
        nvda.setOraclePaused(true);
        PhaselockOracle.Quote memory q = oracle.quote(address(nvda));
        assertEq(uint8(q.session), uint8(PhaselockOracle.Session.Halted));
        assertEq(q.price, 0);
    }

    function test_halted_aroundCorporateAction() public {
        uint256 at = block.timestamp + 2 hours;
        nvda.stageMultiplier(2e18, at);
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Live), "outside lead window");

        _warpLive(at - 30 minutes);
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Halted), "inside lead window");

        vm.warp(at + 10 minutes); // action applied, feed has not published since
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Halted), "awaiting post-action price");

        _setPrice(NVDA_PRICE); // feed publishes (per-token price already includes the multiplier)
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Live), "resumed");
    }

    function test_halted_onBadFeedData() public {
        _setPrice(0);
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Halted));
        _setPrice(-1);
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Halted));
        feed.set(NVDA_PRICE, block.timestamp + 1); // from the future
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Halted));
        feed.set(NVDA_PRICE, block.timestamp);
        feed.setBroken(true);
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Halted));
    }

    function test_halted_whenAssetDisabledOrUnknown() public {
        assertEq(uint8(oracle.quote(address(0xBEEF)).session), uint8(PhaselockOracle.Session.Halted));
        vm.prank(owner);
        oracle.setAsset(address(nvda), feed, MAX_STALENESS, false);
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Halted));
    }

    function test_sequencerDownOrInGrace_halts() public {
        MockFeed seq = new MockFeed(0);
        seq.set(0, block.timestamp - 2 hours); // up since two hours ago
        vm.prank(owner);
        oracle.setSequencerFeed(seq, 1 hours);
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Live));

        seq.set(1, block.timestamp); // down
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Halted));

        seq.set(0, block.timestamp - 30 minutes); // back up, still in grace
        assertEq(uint8(_session()), uint8(PhaselockOracle.Session.Halted));
    }

    function test_plainErc20WithoutCorporateActionGetters() public {
        MockERC20 plain = new MockERC20("Plain", "PLN", 18);
        vm.prank(owner);
        oracle.setAsset(address(plain), feed, MAX_STALENESS, true);
        assertEq(uint8(oracle.quote(address(plain)).session), uint8(PhaselockOracle.Session.Live));
    }

    function test_onlyOwnerConfigures() public {
        vm.expectRevert();
        oracle.setSchedule(5 days, 4 hours, 1 hours);
        vm.prank(owner);
        vm.expectRevert(PhaselockOracle.InvalidSchedule.selector);
        oracle.setSchedule(7 days, 4 hours, 1 hours);
    }
}
