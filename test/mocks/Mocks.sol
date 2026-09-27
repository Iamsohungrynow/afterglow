// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Stock token with the ERC-8056 corporate-action getters the oracle reads.
contract MockStockToken is MockERC20 {
    bool public oraclePaused;
    uint256 public uiMultiplier = 1e18;
    uint256 public newUIMultiplier;
    uint256 public effectiveAt;

    constructor(string memory symbol_) MockERC20(symbol_, symbol_, 18) {}

    function setOraclePaused(bool paused) external {
        oraclePaused = paused;
    }

    function stageMultiplier(uint256 multiplier, uint256 at) external {
        newUIMultiplier = multiplier;
        effectiveAt = at;
    }
}

contract MockFeed is AggregatorV3Interface {
    uint8 public immutable decimals;
    int256 public answer;
    uint256 public startedAt;
    uint256 public updatedAt;
    bool public broken;

    constructor(uint8 decimals_) {
        decimals = decimals_;
    }

    function set(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
        startedAt = updatedAt_;
    }

    function setStartedAt(uint256 startedAt_) external {
        startedAt = startedAt_;
    }

    function setBroken(bool broken_) external {
        broken = broken_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        require(!broken, "feed down");
        return (1, answer, startedAt, updatedAt, 1);
    }
}

/// @notice Stand-in for the GapGuard Stylus contract (Foundry's EVM cannot execute Stylus wasm).
contract MockGapGuard {
    uint16 public modelled;
    bool public broken;

    function set(uint16 modelled_, bool broken_) external {
        modelled = modelled_;
        broken = broken_;
    }

    function weekendLtvBps(address, uint16) external view returns (uint16) {
        require(!broken, "model down");
        return modelled;
    }

    uint32 internal sigma;

    function setSigma(uint32 sigma_) external {
        sigma = sigma_;
    }

    function sigmaBps(address) external view returns (uint32) {
        require(!broken, "model down");
        return sigma;
    }
}
