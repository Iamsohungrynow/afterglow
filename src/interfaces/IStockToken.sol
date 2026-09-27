// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The subset of a Robinhood Chain stock token (ERC-8056 Scaled UI Amount) that the
/// risk engine reads. Raw balances never change on corporate actions; the multiplier does.
interface IStockToken {
    /// @notice Advisory flag set by the issuer while a corporate action is being applied.
    function oraclePaused() external view returns (bool);

    /// @notice Current multiplier, 1e18 = 1.0.
    function uiMultiplier() external view returns (uint256);

    /// @notice Pending multiplier staged for a corporate action.
    function newUIMultiplier() external view returns (uint256);

    /// @notice Unix time at which the pending multiplier takes effect.
    function effectiveAt() external view returns (uint256);
}
