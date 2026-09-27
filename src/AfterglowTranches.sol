// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Share token for one tranche. Only the tranche vault mints and burns.
contract TrancheToken is ERC20 {
    address public immutable vault;

    error OnlyVault();

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        vault = msg.sender;
    }

    /// @dev Shares carry 6 extra decimals of precision over USDG (virtual-share offset).
    function decimals() public pure override returns (uint8) {
        return 12;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != vault) revert OnlyVault();
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != vault) revert OnlyVault();
        _burn(from, amount);
    }
}

/// @title AfterglowTranches
/// @notice Splits one Afterglow market's lender side into two risk classes.
///
/// - **Protected (senior)** accrues a fixed target rate and is paid first.
/// - **Boost (junior)** receives everything the pool earns above that, and absorbs losses first.
///
/// All USDG sits in the underlying market as ordinary lender shares; this contract only runs the
/// waterfall. At any moment: seniorValue = min(poolValue, seniorClaim), juniorValue = the rest.
/// Senior deposits require the junior tranche to stay at least `minJuniorBps` of the pool, and
/// junior withdrawals may not take it below that while senior money is in.
contract AfterglowTranches is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant YEAR = 365 days;
    /// @dev Virtual shares: first-depositor inflation attacks become unprofitable.
    uint256 internal constant OFFSET = 1e6;

    IERC4626 public immutable market;
    IERC20 public immutable asset;
    TrancheToken public immutable senior;
    TrancheToken public immutable junior;

    /// @notice Senior target rate, simple annual, 1e18 = 100%.
    uint256 public seniorRateWad;
    /// @notice Minimum junior share of the pool while senior money is in.
    uint16 public minJuniorBps;

    /// @notice What senior is owed, including accrual up to `lastAccrual`.
    uint256 public seniorClaim;
    uint64 public lastAccrual;

    event Deposit(address indexed caller, address indexed receiver, bool indexed isSenior, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, bool indexed isSenior, uint256 assets, uint256 shares);
    event SeniorRateSet(uint256 seniorRateWad);
    event MinJuniorSet(uint16 minJuniorBps);

    error JuniorCoverTooThin(uint256 juniorBps, uint256 minBps);
    error JuniorWipedOut();
    error ZeroAmount();
    error InvalidParams();

    constructor(IERC4626 market_, uint256 seniorRateWad_, uint16 minJuniorBps_, address owner_, string memory tag)
        Ownable(owner_)
    {
        market = market_;
        asset = IERC20(market_.asset());
        senior = new TrancheToken(string.concat("Afterglow Protected ", tag), string.concat("glowP-", tag));
        junior = new TrancheToken(string.concat("Afterglow Boost ", tag), string.concat("glowB-", tag));
        _setParams(seniorRateWad_, minJuniorBps_);
        lastAccrual = uint64(block.timestamp);
        asset.forceApprove(address(market_), type(uint256).max);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice USDG value of everything this vault holds in the market.
    function poolValue() public view returns (uint256) {
        return market.convertToAssets(market.balanceOf(address(this)));
    }

    /// @notice Senior claim including accrual since the last checkpoint.
    function pendingSeniorClaim() public view returns (uint256) {
        uint256 dt = block.timestamp - lastAccrual;
        return seniorClaim + seniorClaim.mulDiv(seniorRateWad * dt, WAD * YEAR);
    }

    /// @notice Current waterfall: senior is paid first, junior holds the remainder.
    function trancheValues() public view returns (uint256 seniorValue, uint256 juniorValue) {
        uint256 total = poolValue();
        seniorValue = Math.min(total, pendingSeniorClaim());
        juniorValue = total - seniorValue;
    }

    function seniorSharePrice() external view returns (uint256) {
        (uint256 s,) = trancheValues();
        return _toAssets(1e12, senior.totalSupply(), s);
    }

    function juniorSharePrice() external view returns (uint256) {
        (, uint256 j) = trancheValues();
        return _toAssets(1e12, junior.totalSupply(), j);
    }

    /// @notice USDG value of `owner`'s shares in each tranche.
    function balancesOf(address owner) external view returns (uint256 seniorAssets, uint256 juniorAssets) {
        (uint256 s, uint256 j) = trancheValues();
        seniorAssets = _toAssets(senior.balanceOf(owner), senior.totalSupply(), s);
        juniorAssets = _toAssets(junior.balanceOf(owner), junior.totalSupply(), j);
    }

    /// @notice Junior share of the pool, in bps (10_000 when the pool is empty).
    function juniorCoverBps() public view returns (uint256) {
        (uint256 s, uint256 j) = trancheValues();
        uint256 total = s + j;
        return total == 0 ? BPS : j * BPS / total;
    }

    // ---------------------------------------------------------------------
    // Senior (Protected)
    // ---------------------------------------------------------------------

    function depositSenior(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        _accrue();
        (uint256 s, uint256 j) = trancheValues();
        uint256 cover = j * BPS / (s + j + assets);
        if (cover < minJuniorBps) revert JuniorCoverTooThin(cover, minJuniorBps);

        shares = _toShares(assets, senior.totalSupply(), s, Math.Rounding.Floor);
        seniorClaim += assets;
        _pullAndLend(assets);
        senior.mint(receiver, shares);
        emit Deposit(msg.sender, receiver, true, assets, shares);
    }

    function withdrawSenior(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        _accrue();
        (uint256 s,) = trancheValues();
        shares = _toShares(assets, senior.totalSupply(), s, Math.Rounding.Ceil);
        senior.burn(msg.sender, shares);
        // If senior is fully covered its value equals its claim; otherwise reduce the claim pro rata.
        seniorClaim -= s >= seniorClaim ? assets : assets.mulDiv(seniorClaim, s, Math.Rounding.Ceil).min(seniorClaim);
        market.withdraw(assets, receiver, address(this));
        emit Withdraw(msg.sender, receiver, true, assets, shares);
    }

    // ---------------------------------------------------------------------
    // Junior (Boost)
    // ---------------------------------------------------------------------

    function depositJunior(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        _accrue();
        (, uint256 j) = trancheValues();
        uint256 supply = junior.totalSupply();
        if (supply != 0 && j == 0) revert JuniorWipedOut();
        shares = _toShares(assets, supply, j, Math.Rounding.Floor);
        _pullAndLend(assets);
        junior.mint(receiver, shares);
        emit Deposit(msg.sender, receiver, false, assets, shares);
    }

    function withdrawJunior(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        _accrue();
        (uint256 s, uint256 j) = trancheValues();
        if (s != 0) {
            uint256 total = s + j - assets; // reverts if assets > pool
            uint256 cover = total == 0 ? 0 : (j - assets) * BPS / total;
            if (cover < minJuniorBps) revert JuniorCoverTooThin(cover, minJuniorBps);
        }
        shares = _toShares(assets, junior.totalSupply(), j, Math.Rounding.Ceil);
        junior.burn(msg.sender, shares);
        market.withdraw(assets, receiver, address(this));
        emit Withdraw(msg.sender, receiver, false, assets, shares);
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /// @notice New rate applies from now; accrual up to now uses the old rate.
    function setParams(uint256 seniorRateWad_, uint16 minJuniorBps_) external onlyOwner {
        _accrue();
        _setParams(seniorRateWad_, minJuniorBps_);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _accrue() internal {
        seniorClaim = pendingSeniorClaim();
        lastAccrual = uint64(block.timestamp);
    }

    function _pullAndLend(uint256 assets) internal {
        asset.safeTransferFrom(msg.sender, address(this), assets);
        market.deposit(assets, address(this));
    }

    function _toShares(uint256 assets, uint256 supply, uint256 value, Math.Rounding r) internal pure returns (uint256) {
        return assets.mulDiv(supply + OFFSET, value + 1, r);
    }

    function _toAssets(uint256 shares, uint256 supply, uint256 value) internal pure returns (uint256) {
        return shares.mulDiv(value + 1, supply + OFFSET);
    }

    function _setParams(uint256 seniorRateWad_, uint16 minJuniorBps_) internal {
        if (seniorRateWad_ > WAD || minJuniorBps_ > BPS) revert InvalidParams();
        seniorRateWad = seniorRateWad_;
        minJuniorBps = minJuniorBps_;
        emit SeniorRateSet(seniorRateWad_);
        emit MinJuniorSet(minJuniorBps_);
    }
}
