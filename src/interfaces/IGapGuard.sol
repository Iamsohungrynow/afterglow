// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Solidity view of the GapGuard Stylus (Rust) contract in stylus/gap-guard.
/// Stylus exports snake_case Rust methods under camelCase Solidity names.
interface IGapGuard {
    /// @notice Highest LTV a position may carry into the weekend so that a z-sigma weekend gap
    /// still leaves it below `liqLtvBps`.
    function weekendLtvBps(address asset, uint16 liqLtvBps) external view returns (uint16);

    function gapBufferBps(address asset) external view returns (uint32);

    function sigmaBps(address asset) external view returns (uint32);

    function observationCount(address asset) external view returns (uint32);
}
