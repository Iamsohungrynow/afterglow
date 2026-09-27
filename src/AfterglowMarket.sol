// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PhaselockOracle} from "./PhaselockOracle.sol";

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
        address owner;
        address guardian;
        string name;
        string symbol;
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

    /// @notice Loan tokens held by the market. Tracked internally so donations cannot move share price.
    uint256 public cash;
    /// @notice Sum of face value owed by all borrowers.
    uint256 public totalFace;
    /// @notice Cumulative face value written off after collateral ran out.
    uint256 public badDebt;

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
        _setRiskParams(c.risk);
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

    /// @notice Borrow `assets` loan tokens at the market's fixed rate until maturity.
    /// @return face Amount owed at maturity.
    function borrow(uint256 assets, address receiver) external nonReentrant whenNotPaused returns (uint256 face) {
        if (assets == 0) revert ZeroAmount();
        if (block.timestamp >= maturity) revert Matured();
        if (assets > cash) revert InsufficientCash();

        PhaselockOracle.Quote memory q = oracle.quote(address(collateralToken));
        if (q.session != PhaselockOracle.Session.Live && q.session != PhaselockOracle.Session.Closing) {
            revert MarketNotLive(q.session);
        }

        face = assets.mulDiv(WAD, discountWad(), Math.Rounding.Ceil);
        Position storage p = positions[msg.sender];
        p.face += face;
        totalFace += face;
        cash -= assets;

        _requireLtv(p, q.price, maxBorrowLtvBps(q));

        IERC20(asset()).safeTransfer(receiver, assets);
        emit Borrow(msg.sender, receiver, assets, face);
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
            uint256 limit = q.session == PhaselockOracle.Session.Closed ? risk.weekendLtvBps : maxBorrowLtvBps(q);
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
        RiskParams memory r = risk;
        if (q.session == PhaselockOracle.Session.Live) return r.baseLtvBps;
        if (q.session == PhaselockOracle.Session.Closing) {
            return r.baseLtvBps - (uint256(r.baseLtvBps - r.weekendLtvBps) * q.rampBps) / BPS;
        }
        return 0;
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

    // ---------------------------------------------------------------------
    // ERC-4626
    // ---------------------------------------------------------------------

    function totalAssets() public view override returns (uint256) {
        return cash + totalFace.mulDiv(discountWad(), WAD, Math.Rounding.Floor);
    }

    function maxDeposit(address) public view override returns (uint256) {
        return paused() || block.timestamp >= maturity ? 0 : type(uint256).max;
    }

    function maxMint(address) public view override returns (uint256) {
        return paused() || block.timestamp >= maturity ? 0 : type(uint256).max;
    }

    /// @dev Lenders can only take out what is not lent.
    function maxWithdraw(address owner) public view override returns (uint256) {
        return Math.min(_convertToAssets(balanceOf(owner), Math.Rounding.Floor), cash);
    }

    function maxRedeem(address owner) public view override returns (uint256) {
        return Math.min(balanceOf(owner), _convertToShares(cash, Math.Rounding.Floor));
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
        if (assets > cash) revert InsufficientCash();
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
