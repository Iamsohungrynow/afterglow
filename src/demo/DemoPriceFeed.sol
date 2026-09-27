// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

/// @title DemoPriceFeed
/// @notice TESTNET ONLY. Robinhood Chain testnet has no Chainlink equity feeds, so demos use this
/// owner-updated feed with the same interface. Never configure it on mainnet.
contract DemoPriceFeed is AggregatorV3Interface, Ownable {
    uint8 public immutable decimals;
    string public description;

    uint80 internal _roundId;
    int256 internal _answer;
    uint256 internal _updatedAt;

    event PricePublished(uint80 indexed roundId, int256 answer, uint256 updatedAt);

    constructor(address owner_, string memory description_, uint8 decimals_, int256 initialAnswer)
        Ownable(owner_)
    {
        decimals = decimals_;
        description = description_;
        _publish(initialAnswer);
    }

    function publish(int256 answer) external onlyOwner {
        _publish(answer);
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    function _publish(int256 answer) internal {
        _roundId++;
        _answer = answer;
        _updatedAt = block.timestamp;
        emit PricePublished(_roundId, answer, block.timestamp);
    }
}
