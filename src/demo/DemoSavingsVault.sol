// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title DemoSavingsVault
/// @notice TESTNET ONLY. Stand-in for a USDG savings vault, so the weekend sweep can be shown where no
/// real one exists. Deposits grow at a fixed simple rate, paid out of a reserve the owner tops up with
/// plain transfers. Assets are capped at the vault's balance: if the reserve runs dry, yield stops and
/// every depositor can still withdraw. Never configure it on mainnet.
contract DemoSavingsVault is ERC4626, Ownable {
    using Math for uint256;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant YEAR = 365 days;

    /// @notice Simple annual rate, 1e18 = 100%.
    uint256 public rateWad;
    /// @dev Depositors' assets as of `lastAccrual`.
    uint256 internal accounted;
    uint256 internal lastAccrual;

    event RateSet(uint256 rateWad);

    constructor(IERC20 asset_, uint256 rateWad_, address owner_)
        ERC20("USDG Savings (demo)", "svUSDG")
        ERC4626(asset_)
        Ownable(owner_)
    {
        rateWad = rateWad_;
        lastAccrual = block.timestamp;
    }

    function totalAssets() public view override returns (uint256) {
        uint256 grown = accounted + accounted.mulDiv(rateWad * (block.timestamp - lastAccrual), WAD * YEAR);
        return Math.min(grown, IERC20(asset()).balanceOf(address(this)));
    }

    function setRate(uint256 rateWad_) external onlyOwner {
        _accrue();
        rateWad = rateWad_;
        emit RateSet(rateWad_);
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        _accrue();
        super._deposit(caller, receiver, assets, shares);
        accounted += assets;
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        _accrue();
        accounted -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function _accrue() internal {
        accounted = totalAssets();
        lastAccrual = block.timestamp;
    }

    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }
}
