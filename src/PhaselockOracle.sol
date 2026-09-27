// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {IStockToken} from "./interfaces/IStockToken.sol";

/// @title PhaselockOracle
/// @notice Prices tokenized stocks and phase-locks every read to the US equity market clock.
///
/// Robinhood Chain equity feeds publish 24/5 on a 0.5% deviation / 24h heartbeat basis, so a
/// quiet stock can go many hours without an update while its market is open, and the feed holds
/// the last value all weekend. Freshness therefore cannot tell open from closed: the session is
/// derived from the weekly schedule (plus owner-set holiday closures), and freshness is only used
/// to require a first post-reopen print and to detect a feed that has stopped keeping its heartbeat.
/// Prices are quoted in the loan stablecoin (USDG). When a USDG/USD feed is configured, every
/// stock price is divided by the live USDG price, and the whole oracle halts if USDG strays more
/// than `depegToleranceBps` from $1, so no market lends or liquidates through a depeg.
/// @dev Prices are per raw token (1e18 raw units) with 18 decimals. Robinhood feeds already
/// include the corporate-action multiplier, so no multiplier is applied here.
contract PhaselockOracle is Ownable2Step {
    enum Session {
        Live, // market open, price published since it opened
        Closing, // market open, inside the window before the weekly close
        Closed, // weekend or holiday, or no print yet since the market reopened
        Halted // price must not be used for risk decisions

    }

    struct Quote {
        uint256 price; // USDG per whole token, 1e18 = 1 USDG; last published value when Closed
        Session session;
        uint16 rampBps; // progress through the closing window, 0..10_000 (only in Closing)
        uint256 updatedAt;
    }

    struct Asset {
        AggregatorV3Interface feed;
        uint32 maxStaleness; // while open, older than this => Halted (feed missed its heartbeat)
        bool enabled;
    }

    struct Closure {
        uint64 start;
        uint64 end;
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
    /// @notice Length of the weekend closure (Friday 20:00 ET to Sunday 20:00 ET = 2 days).
    uint32 public weekendLength;
    /// @notice Length of the pre-close window in which borrowing capacity ramps down.
    uint32 public closingWindow;
    /// @notice How long before a scheduled corporate action the asset is halted.
    uint32 public corporateActionLead;

    /// @notice One-off market closure (exchange holiday), set ahead of time by the owner.
    Closure public closure;

    /// @notice USDG/USD feed; address(0) values USDG at exactly $1.
    AggregatorV3Interface public stableFeed;
    uint32 public stableMaxStaleness;
    uint16 public depegToleranceBps;

    event AssetSet(address indexed token, address feed, uint32 maxStaleness, bool enabled);
    event SequencerFeedSet(address feed, uint32 gracePeriod);
    event ScheduleSet(uint32 weeklyCloseOffset, uint32 weekendLength, uint32 closingWindow, uint32 corporateActionLead);
    event ClosureSet(uint64 start, uint64 end);
    event StableFeedSet(address feed, uint32 maxStaleness, uint16 depegToleranceBps);

    error InvalidSchedule();
    error InvalidClosure();
    error FeedDecimalsTooHigh();

    constructor(address owner_) Ownable(owner_) {
        _setSchedule(5 days, 2 days, 4 hours, 1 hours);
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

    /// @notice Price the loan stablecoin with a live feed instead of assuming $1.
    function setStableFeed(AggregatorV3Interface feed, uint32 maxStaleness, uint16 depegToleranceBps_)
        external
        onlyOwner
    {
        if (address(feed) != address(0) && feed.decimals() > 18) revert FeedDecimalsTooHigh();
        if (depegToleranceBps_ >= BPS) revert InvalidSchedule();
        stableFeed = feed;
        stableMaxStaleness = maxStaleness;
        depegToleranceBps = depegToleranceBps_;
        emit StableFeedSet(address(feed), maxStaleness, depegToleranceBps_);
    }

    /// @notice Owner updates the offset at each daylight-saving change (Saturday 00:00 UTC in
    /// summer, 01:00 UTC in winter).
    function setSchedule(
        uint32 weeklyCloseOffset_,
        uint32 weekendLength_,
        uint32 closingWindow_,
        uint32 corporateActionLead_
    ) external onlyOwner {
        _setSchedule(weeklyCloseOffset_, weekendLength_, closingWindow_, corporateActionLead_);
    }

    /// @notice Schedule a one-off closure such as an exchange holiday. Pass (0, 0) to clear.
    function setClosure(uint64 start, uint64 end) external onlyOwner {
        if (start > end) revert InvalidClosure();
        closure = Closure(start, end);
        emit ClosureSet(start, end);
    }

    function _setSchedule(
        uint32 weeklyCloseOffset_,
        uint32 weekendLength_,
        uint32 closingWindow_,
        uint32 corporateActionLead_
    ) internal {
        if (
            weeklyCloseOffset_ >= WEEK || weekendLength_ == 0 || weekendLength_ >= WEEK - 1 days
                || closingWindow_ == 0 || closingWindow_ >= 1 days
        ) revert InvalidSchedule();
        weeklyCloseOffset = weeklyCloseOffset_;
        weekendLength = weekendLength_;
        closingWindow = closingWindow_;
        corporateActionLead = corporateActionLead_;
        emit ScheduleSet(weeklyCloseOffset_, weekendLength_, closingWindow_, corporateActionLead_);
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

        (bool stableOk, uint256 stablePrice) = stableUsd();
        if (!stableOk) return q;
        q.price = (uint256(answer) * 10 ** (18 - a.feed.decimals()) * 1e18) / stablePrice;
        q.updatedAt = updatedAt;

        // Closed by the clock, or reopened but still showing the pre-close price.
        if (isMarketClosed() || updatedAt < lastOpen()) {
            q.session = Session.Closed;
            return q;
        }

        // Open, yet the feed has missed its heartbeat: something is wrong upstream.
        if (block.timestamp - updatedAt > a.maxStaleness) {
            q.price = 0;
            return q; // Halted
        }

        uint256 untilClose = secondsUntilWeeklyClose();
        if (untilClose <= closingWindow) {
            q.session = Session.Closing;
            q.rampBps = uint16(((closingWindow - untilClose) * BPS) / closingWindow);
        } else {
            q.session = Session.Live;
        }
    }

    /// @notice USD price of the loan stablecoin (1e18 = $1) and whether it is usable: fresh and
    /// within the depeg tolerance. Stablecoin feeds run 24/7, so staleness applies at all times.
    function stableUsd() public view returns (bool ok, uint256 price) {
        AggregatorV3Interface feed = stableFeed;
        if (address(feed) == address(0)) return (true, 1e18);
        (bool live, int256 answer,, uint256 updatedAt) = _latest(feed);
        if (!live || answer <= 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > stableMaxStaleness) {
            return (false, 0);
        }
        price = uint256(answer) * 10 ** (18 - feed.decimals());
        uint256 deviation = price > 1e18 ? price - 1e18 : 1e18 - price;
        ok = deviation * BPS <= uint256(depegToleranceBps) * 1e18;
    }

    /// @notice True during the weekly weekend window or an owner-set closure.
    function isMarketClosed() public view returns (bool) {
        Closure memory c = closure;
        if (block.timestamp >= c.start && block.timestamp < c.end) return true;
        uint256 sinceClose = (_intoWeek() + WEEK - weeklyCloseOffset) % WEEK;
        return sinceClose < weekendLength;
    }

    /// @notice Most recent moment the market (re)opened: the end of the last weekend or of a
    /// closure that has already finished, whichever is later. Only meaningful while open.
    function lastOpen() public view returns (uint256 t) {
        uint256 openOffset = (uint256(weeklyCloseOffset) + weekendLength) % WEEK;
        uint256 sinceOpen = (_intoWeek() + WEEK - openOffset) % WEEK;
        t = block.timestamp - sinceOpen;
        uint256 closureEnd = closure.end;
        if (closureEnd <= block.timestamp && closureEnd > t) t = closureEnd;
    }

    /// @notice Seconds from now until the next weekly close (0 < result <= 1 week).
    function secondsUntilWeeklyClose() public view returns (uint256) {
        uint256 intoWeek = _intoWeek();
        return intoWeek < weeklyCloseOffset ? weeklyCloseOffset - intoWeek : WEEK - intoWeek + weeklyCloseOffset;
    }

    function _intoWeek() internal view returns (uint256) {
        return (block.timestamp + MONDAY_SHIFT) % WEEK;
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
