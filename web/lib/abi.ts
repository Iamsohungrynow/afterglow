import { parseAbi } from "viem";

export const feedAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

// Session enum order matches PhaselockOracle.Session.
export const oracleAbi = parseAbi([
  "struct Quote { uint256 price; uint8 session; uint16 rampBps; uint256 updatedAt; }",
  "function quote(address token) view returns (Quote)",
  "function stableUsd() view returns (bool ok, uint256 price)",
  "function secondsUntilWeeklyClose() view returns (uint256)",
  "function isMarketClosed() view returns (bool)",
]);

export const tranchesAbi = parseAbi([
  "function trancheValues() view returns (uint256 seniorValue, uint256 juniorValue)",
  "function balancesOf(address) view returns (uint256 seniorAssets, uint256 juniorAssets)",
  "function juniorCoverBps() view returns (uint256)",
  "function seniorRateWad() view returns (uint256)",
  "function minJuniorBps() view returns (uint16)",
  "function depositSenior(uint256 assets, address receiver) returns (uint256)",
  "function withdrawSenior(uint256 assets, address receiver) returns (uint256)",
  "function depositJunior(uint256 assets, address receiver) returns (uint256)",
  "function withdrawJunior(uint256 assets, address receiver) returns (uint256)",
]);

/** DemoSavingsVault exposes its rate; a real savings vault may not. */
export const savingsAbi = parseAbi(["function rateWad() view returns (uint256)"]);

export const marketAbi = parseAbi([
  "function marketStatus() view returns (uint8 session, uint256 price, uint256 maxLtvBps, uint256 discount)",
  "function positions(address) view returns (uint256 collateral, uint256 face)",
  "function debtOf(address) view returns (uint256)",
  "function risk() view returns (uint16 baseLtvBps, uint16 weekendLtvBps, uint16 liqLtvBps, uint16 liqBonusBps)",
  "function weekendLtvBps() view returns (uint256)",
  "function rateWad() view returns (uint256)",
  "function maturity() view returns (uint64)",
  "function cash() view returns (uint256)",
  "function totalFace() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function supplyCap() view returns (uint256)",
  "function idleAssets() view returns (uint256)",
  "function targetIdle() view returns (uint256)",
  "function rebalance() returns (uint256 deployed, uint256 recalled)",
  "function balanceOf(address) view returns (uint256)",
  "function maxWithdraw(address) view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function depositCollateral(uint256 amount, address onBehalf)",
  "function withdrawCollateral(uint256 amount, address receiver)",
  "function borrow(uint256 assets, address receiver) returns (uint256)",
  "function repay(address borrower, uint256 face) returns (uint256)",
  "function deposit(uint256 assets, address receiver) returns (uint256)",
  "function withdraw(uint256 assets, address receiver, address owner) returns (uint256)",
]);
