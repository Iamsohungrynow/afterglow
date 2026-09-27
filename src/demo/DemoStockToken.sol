// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DemoStockToken
/// @notice TESTNET ONLY. Arbitrum Sepolia has no Robinhood stock tokens, so demos there use this
/// stand-in with the same shape (18 decimals, ERC-8056 getters) and a rate-limited public faucet.
contract DemoStockToken is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 100e18;
    uint256 public constant FAUCET_COOLDOWN = 1 hours;

    uint256 public constant uiMultiplier = 1e18;
    uint256 public constant newUIMultiplier = 1e18;
    uint256 public constant effectiveAt = 0;
    bool public constant oraclePaused = false;

    mapping(address account => uint256) public lastFaucet;

    error FaucetCooldown(uint256 availableAt);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    /// @notice Mint 100 demo shares to the caller, once per hour.
    function faucet() external {
        uint256 next = lastFaucet[msg.sender] + FAUCET_COOLDOWN;
        if (lastFaucet[msg.sender] != 0 && block.timestamp < next) revert FaucetCooldown(next);
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
