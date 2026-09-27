// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {IStockToken} from "./interfaces/IStockToken.sol";

/// @title PhaselockOracle
/// @notice Prices tokenized stocks and classifies every read by the US equity market clock.
/// Robinhood Chain feeds publish 24/5 and hold the last value off-hours, so a price alone
/// cannot tell a lending market whether it is safe to act on. This oracle adds that context.
/// @dev Prices are per raw token (1e18 raw units) in USD with 18 decimals. Robinhood feeds
/// already include the corporate-action multiplier, so no multiplier is applied here.
contract PhaselockOracle is Ownable2Step {
    enum Session {
        Live, // fresh price, market clock normal
        Closing, // fresh price, inside the window before the weekly close
        Closed, // price stale: weekend, holiday or overnight gap
        Halted // price must not be used for risk decisions

    }

    struct Quote {
        uint256 price; // USD per whole token, 1e18 = $1
        Session session;
        uint16 rampBps; // progress through the closing window, 0..10_000 (only in Closing)
        uint256 updatedAt;
    }

    struct Asset {
        AggregatorV3Interface feed;
        uint32 maxStaleness; // older than this => Closed
        bool enabled;
    }

    uint16 internal constant BPS = 10_000;
    uint256 internal constant WEEK = 7 days;
    /// @dev Unix time 0 was a Thursday; shifting by 3 days makes Monday 00:00 UTC offset 0.
    uint256 internal constant MONDAY_SHIFT = 3 days;

    mapping(address token => Asset) public assets;

    /// @notice Chainlink L2 sequencer uptime feed; address(0) disables the check.
    AggregatorV3Interface public sequencerFeed;
    uint32 public sequencerGracePeriod;

    /// @notice Seconds after Monday 00:00 UTC at which feeds stop for the weekend.
    /// Friday 20:00 ET is Saturday 00:00 UTC in summer (EDT) and 01:00 UTC in winter (EST).
    uint32 public weeklyCloseOffset;
    /// @notice Length of the pre-close window in which borrowing capacity ramps down.
    uint32 public closingWindow;
    /// @notice How long before a scheduled corporate action the asset is halted.
    uint32 public corporateActionLead;

    event AssetSet(address indexed token, address feed, uint32 maxStaleness, bool enabled);
    event SequencerFeedSet(address feed, uint32 gracePeriod);
    event ScheduleSet(uint32 weeklyCloseOffset, uint32 closingWindow, uint32 corporateActionLead);

    error InvalidSchedule();
    error FeedDecimalsTooHigh();

    constructor(address owner_) Ownable(owner_) {
        _setSchedule(5 days, 4 hours, 1 hours);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setAsset(address token, AggregatorV3Interface feed, uint32 maxStaleness, bool enabled)
        external
        onlyOwner
    {
        if (address(feed) != address(0) && feed.decimals() > 18) revert FeedDecimalsTooHigh();
        assets[token] = Asset(feed, maxStaleness, enabled);
        emit AssetSet(token, address(feed), maxStaleness, enabled);
    }

    function setSequencerFeed(AggregatorV3Interface feed, uint32 gracePeriod) external onlyOwner {
        sequencerFeed = feed;
        sequencerGracePeriod = gracePeriod;
        emit SequencerFeedSet(address(feed), gracePeriod);
    }

    function setSchedule(uint32 weeklyCloseOffset_, uint32 closingWindow_, uint32 corporateActionLead_)
        external
        onlyOwner
    {
        _setSchedule(weeklyCloseOffset_, closingWindow_, corporateActionLead_);
    }

    function _setSchedule(uint32 weeklyCloseOffset_, uint32 closingWindow_, uint32 corporateActionLead_) internal {
        if (weeklyCloseOffset_ >= WEEK || closingWindow_ == 0 || closingWindow_ >= 1 days) revert InvalidSchedule();
        weeklyCloseOffset = weeklyCloseOffset_;
        closingWindow = closingWindow_;
        corporateActionLead = corporateActionLead_;
        emit ScheduleSet(weeklyCloseOffset_, closingWindow_, corporateActionLead_);
    }

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    /// @notice Price and market session for `token`. Never reverts for a configured asset;
    /// anything untrustworthy is reported as Halted with price 0.
    function quote(address token) external view returns (Quote memory q) {
        q.session = Session.Halted;
        Asset memory a = assets[token];
        if (!a.enabled || address(a.feed) == address(0) || !_sequencerUp()) return q;

        (bool ok, int256 answer,, uint256 updatedAt) = _latest(a.feed);
        if (!ok || answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp) return q;
        if (_corporateActionPending(token, updatedAt)) return q;

        q.price = uint256(answer) * 10 ** (18 - a.feed.decimals());
        q.updatedAt = updatedAt;

        if (block.timestamp - updatedAt > a.maxStaleness) {
            q.session = Session.Closed;
            return q;
        }

        uint256 untilClose = secondsUntilWeeklyClose();
        if (untilClose <= closingWindow) {
            q.session = Session.Closing;
            q.rampBps = uint16(((closingWindow - untilClose) * BPS) / closingWindow);
        } else {
            q.session = Session.Live;
        }
    }

    /// @notice Seconds from now until the next weekly close (0 < result <= 1 week).
    function secondsUntilWeeklyClose() public view returns (uint256) {
        uint256 intoWeek = (block.timestamp + MONDAY_SHIFT) % WEEK;
        return intoWeek < weeklyCloseOffset ? weeklyCloseOffset - intoWeek : WEEK - intoWeek + weeklyCloseOffset;
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _latest(AggregatorV3Interface feed)
        internal
        view
        returns (bool ok, int256 answer, uint256 startedAt, uint256 updatedAt)
    {
        try feed.latestRoundData() returns (uint80, int256 answer_, uint256 startedAt_, uint256 updatedAt_, uint80) {
            return (true, answer_, startedAt_, updatedAt_);
        } catch {
            return (false, 0, 0, 0);
        }
    }

    /// @dev Chainlink uptime feed: answer 0 = up, 1 = down; startedAt = last status change.
    function _sequencerUp() internal view returns (bool) {
        AggregatorV3Interface feed = sequencerFeed;
        if (address(feed) == address(0)) return true;
        (bool ok, int256 status, uint256 startedAt,) = _latest(feed);
        if (!ok || status != 0 || startedAt == 0 || startedAt > block.timestamp) return false;
        return block.timestamp - startedAt > sequencerGracePeriod;
    }

    /// @dev Halted while the issuer flags the oracle as paused, shortly before a staged
    /// multiplier change, and after it until the feed publishes a post-action price.
    function _corporateActionPending(address token, uint256 updatedAt) internal view returns (bool) {
        (bool okPaused, uint256 paused) = _readUint(token, IStockToken.oraclePaused.selector);
        if (okPaused && paused != 0) return true;

        (bool okAt, uint256 effectiveAt) = _readUint(token, IStockToken.effectiveAt.selector);
        if (!okAt || effectiveAt == 0) return false;
        if (block.timestamp < effectiveAt) return block.timestamp + corporateActionLead >= effectiveAt;
        return updatedAt < effectiveAt;
    }

    /// @dev Tolerates tokens that do not implement an optional getter.
    function _readUint(address target, bytes4 selector) internal view returns (bool, uint256) {
        (bool ok, bytes memory data) = target.staticcall(abi.encodeWithSelector(selector));
        if (!ok || data.length < 32) return (false, 0);
        return (true, abi.decode(data, (uint256)));
    }
}
