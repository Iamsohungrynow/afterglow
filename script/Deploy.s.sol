// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {PhaselockOracle} from "../src/PhaselockOracle.sol";
import {AfterglowMarket} from "../src/AfterglowMarket.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";
import {IGapGuard} from "../src/interfaces/IGapGuard.sol";
import {DemoPriceFeed} from "../src/demo/DemoPriceFeed.sol";
import {DemoStockToken} from "../src/demo/DemoStockToken.sol";
import {DemoSavingsVault} from "../src/demo/DemoSavingsVault.sol";
import {AfterglowTranches} from "../src/AfterglowTranches.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/// @notice Deploys Phaselock plus one Afterglow market per collateral.
///
///   Robinhood Chain (4663):          real stock tokens, Chainlink stock + USDG/USD feeds, 1,000 USDG cap.
///   Robinhood Chain testnet (46630): faucet stock tokens, DemoPriceFeed prices (no Chainlink equities there).
///   Arbitrum Sepolia (421614):       DemoStockToken collateral (no stock tokens there), DemoPriceFeed prices.
///   Testnets also get a demo USDG/USD feed so a depeg halt can be shown live.
///
/// Usage (keystore account created with `cast wallet import deployer --interactive`):
///   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --account deployer --broadcast
///
/// Optional env: RATE_WAD (default 0.08e18), TERM_DAYS (28), SUPPLY_CAP (loan-token units),
/// GAP_GUARD (address of the deployed GapGuard Stylus contract, wired into every market),
/// ORACLE (reuse a deployed PhaselockOracle: its USDG feed and any asset feeds it already has are kept),
/// IDLE_VAULT (ERC-4626 USDG savings vault for the weekend sweep; testnets deploy a DemoSavingsVault
/// when unset), SAVINGS_RESERVE (USDG units the deployer sends to a new DemoSavingsVault as its yield reserve).
/// Addresses are written to deployments/<chainId>.json on broadcast.
contract Deploy is Script {
    using Strings for uint256;

    uint256 internal constant ROBINHOOD = 4663;
    uint256 internal constant ROBINHOOD_TESTNET = 46630;
    uint256 internal constant ARBITRUM_SEPOLIA = 421614;
    uint16 internal constant DEPEG_TOLERANCE_BPS = 200; // halt if USDG is more than 2% off $1
    uint32 internal constant MAX_STALENESS = 26 hours; // Chainlink 24h heartbeat + buffer

    struct Asset {
        string symbol;
        address token; // address(0) => deploy a DemoStockToken
        address feed; // address(0) => deploy a DemoPriceFeed
        int256 demoPrice; // 8 decimals, testnet only
        AfterglowMarket.RiskParams risk;
    }

    struct Params {
        address deployer;
        address usdg;
        uint64 maturity;
        uint256 rateWad;
        uint256 supplyCap;
        address gapGuard;
        address idleVault;
    }

    struct Deployed {
        string symbol;
        address token;
        address feed;
        address market;
        address tranches;
        address protectedToken;
        address boostToken;
    }

    function run() external returns (PhaselockOracle oracle, Deployed[] memory out) {
        Asset[] memory assets;
        uint256 defaultCap;
        address stableFeed;
        Params memory p;
        bool demoSavings;
        (p.usdg, stableFeed, assets, defaultCap, demoSavings) = _config(block.chainid);
        p.rateWad = vm.envOr("RATE_WAD", uint256(0.08e18));
        p.supplyCap = vm.envOr("SUPPLY_CAP", defaultCap);
        p.maturity = nextThursdayClose(block.timestamp + vm.envOr("TERM_DAYS", uint256(28)) * 1 days);
        p.gapGuard = vm.envOr("GAP_GUARD", address(0));
        p.idleVault = vm.envOr("IDLE_VAULT", address(0));
        address reuse = vm.envOr("ORACLE", address(0));

        vm.startBroadcast();
        (, p.deployer,) = vm.readCallers();

        if (reuse != address(0)) {
            oracle = PhaselockOracle(reuse);
            stableFeed = address(oracle.stableFeed());
        } else {
            oracle = new PhaselockOracle(p.deployer);
            if (stableFeed == address(0)) {
                stableFeed = address(new DemoPriceFeed(p.deployer, "USDG / USD (demo)", 8, 1e8));
            }
            oracle.setStableFeed(AggregatorV3Interface(stableFeed), MAX_STALENESS, DEPEG_TOLERANCE_BPS);
        }

        if (p.idleVault == address(0) && demoSavings) {
            DemoSavingsVault savings = new DemoSavingsVault(IERC20(p.usdg), 0.036e18, p.deployer);
            p.idleVault = address(savings);
            uint256 reserve = vm.envOr("SAVINGS_RESERVE", uint256(0));
            if (reserve != 0) IERC20(p.usdg).transfer(p.idleVault, reserve);
        }

        out = new Deployed[](assets.length);
        for (uint256 i; i < assets.length; ++i) {
            out[i] = _deployMarket(oracle, assets[i], p);
        }
        vm.stopBroadcast();

        _log(oracle, out, p);
        console.log("USDG/USD feed:", stableFeed);
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) _write(oracle, out, p, stableFeed);
    }

    function _deployMarket(PhaselockOracle oracle, Asset memory a, Params memory p)
        internal
        returns (Deployed memory d)
    {
        if (a.token == address(0)) {
            a.token = address(new DemoStockToken(string.concat(a.symbol, " (demo stock)"), a.symbol));
        }
        // A reused oracle keeps the feed it already has for this token (e.g. one the price mirror updates).
        (AggregatorV3Interface existing,,) = oracle.assets(a.token);
        address feed = address(existing);
        if (feed == address(0)) {
            feed = a.feed;
            if (feed == address(0)) {
                feed = address(new DemoPriceFeed(p.deployer, string.concat(a.symbol, " / USD (demo)"), 8, a.demoPrice));
            }
            oracle.setAsset(a.token, AggregatorV3Interface(feed), MAX_STALENESS, true);
        }

        string memory tag = string.concat(a.symbol, "-", formatDate(p.maturity));
        AfterglowMarket market = new AfterglowMarket(
            AfterglowMarket.Config({
                loanToken: IERC20(p.usdg),
                collateralToken: IERC20(a.token),
                oracle: oracle,
                maturity: p.maturity,
                gracePeriod: 2 days,
                rateWad: p.rateWad,
                risk: a.risk,
                supplyCap: p.supplyCap,
                owner: p.deployer,
                guardian: p.deployer,
                name: string.concat("Afterglow USDG/", tag),
                symbol: string.concat("glowUSDG-", tag)
            })
        );
        if (p.gapGuard != address(0)) market.setGapGuard(IGapGuard(p.gapGuard));
        if (p.idleVault != address(0)) market.setIdleVault(IERC4626(p.idleVault));
        // Protected / Boost tranches on top of the market: senior targets 5/8 of the market rate,
        // junior must stay at least 20% of the tranche vault.
        AfterglowTranches tranches =
            new AfterglowTranches(IERC4626(address(market)), p.rateWad * 5 / 8, 2000, p.deployer, tag);
        d = Deployed(
            a.symbol, a.token, feed, address(market), address(tranches), address(tranches.senior()), address(tranches.junior())
        );
    }

    // ---------------------------------------------------------------------
    // Per-chain configuration
    // ---------------------------------------------------------------------

    function _config(uint256 chainId)
        internal
        pure
        returns (address usdg, address stableFeed, Asset[] memory assets, uint256 defaultCap, bool demoSavings)
    {
        AfterglowMarket.RiskParams memory stock =
            AfterglowMarket.RiskParams({baseLtvBps: 5500, weekendLtvBps: 4500, liqLtvBps: 6500, liqBonusBps: 700});
        AfterglowMarket.RiskParams memory etf =
            AfterglowMarket.RiskParams({baseLtvBps: 7000, weekendLtvBps: 6000, liqLtvBps: 7700, liqBonusBps: 500});

        if (chainId == ROBINHOOD_TESTNET) {
            usdg = 0x7E955252E15c84f5768B83c41a71F9eba181802F; // Paxos "Global Dollar" (testnet)
            assets = new Asset[](2);
            assets[0] = Asset("TSLA", 0xC9f9c86933092BbbfFF3CCb4b105A4A94bf3Bd4E, address(0), 371_7471_0000, stock);
            assets[1] = Asset("AMZN", 0x5884aD2f920c162CFBbACc88C9C51AA75eC09E02, address(0), 249_9420_0000, stock);
            defaultCap = type(uint256).max;
            demoSavings = true;
        } else if (chainId == ROBINHOOD) {
            usdg = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
            assets = new Asset[](3);
            assets[0] = Asset(
                "NVDA", 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC, 0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15, 0, stock
            );
            assets[1] = Asset(
                "SPY", 0x117cc2133c37B721F49dE2A7a74833232B3B4C0C, 0x319724394D3A0e3669269846abE664Cd621f9f6A, 0, etf
            );
            assets[2] = Asset(
                "QQQ", 0xD5f3879160bc7c32ebb4dC785F8a4F505888de68, 0x80901d846d5D7B030F26B480776EE3b29374C2ae, 0, etf
            );
            stableFeed = 0x61B7e5650328764B076A108EFF5fa7282a1B9aD2; // Chainlink USDG / USD
            defaultCap = 1_000e6; // unaudited: keep each market tiny
        } else if (chainId == ARBITRUM_SEPOLIA) {
            usdg = 0xFFC95faa3d63Cde504a05B567C600B78C0b41892; // Paxos "Global Dollar" (testnet)
            assets = new Asset[](2);
            assets[0] = Asset("NVDA", address(0), address(0), 225_6601_8707, stock);
            assets[1] = Asset("SPY", address(0), address(0), 77232802713, etf);
            defaultCap = type(uint256).max;
            demoSavings = true;
        } else {
            revert("Deploy: unsupported chain");
        }
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /// @notice First Thursday 20:00 UTC (16:00 ET in summer) at or after `t`, so loans mature on a
    /// trading day with a full day of market hours left for repayment and liquidations.
    function nextThursdayClose(uint256 t) public pure returns (uint64) {
        uint256 intoWeek = (t + 3 days) % 1 weeks; // Monday 00:00 UTC = 0
        uint256 m = t - intoWeek + 3 days + 20 hours;
        if (m < t) m += 1 weeks;
        return uint64(m);
    }

    /// @notice "29OCT26"-style date for token symbols (civil-from-days, Howard Hinnant).
    function formatDate(uint256 timestamp) public pure returns (string memory) {
        int256 z = int256(timestamp / 1 days) + 719_468;
        int256 era = z / 146_097;
        uint256 doe = uint256(z - era * 146_097);
        uint256 yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        uint256 day = doy - (153 * mp + 2) / 5 + 1;
        uint256 month = mp < 10 ? mp + 3 : mp - 9;
        uint256 year = uint256(int256(yoe) + era * 400) + (month <= 2 ? 1 : 0);

        string[12] memory names = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
        string memory dd = day < 10 ? string.concat("0", day.toString()) : day.toString();
        return string.concat(dd, names[month - 1], (year % 100).toString());
    }

    function _log(PhaselockOracle oracle, Deployed[] memory out, Params memory p) internal pure {
        console.log("PhaselockOracle:", address(oracle));
        console.log("maturity (unix):", p.maturity, formatDate(p.maturity));
        console.log("rate (bps):", p.rateWad / 1e14);
        console.log("supply cap:", p.supplyCap);
        console.log("idle vault:", p.idleVault);
        for (uint256 i; i < out.length; ++i) {
            console.log(string.concat(out[i].symbol, " market:"), out[i].market);
            console.log(string.concat(out[i].symbol, " feed:  "), out[i].feed);
            console.log(string.concat(out[i].symbol, " tranches:"), out[i].tranches);
        }
    }

    function _write(PhaselockOracle oracle, Deployed[] memory out, Params memory p, address stableFeed) internal {
        string memory root = "deployment";
        vm.serializeUint(root, "chainId", block.chainid);
        vm.serializeAddress(root, "usdg", p.usdg);
        vm.serializeAddress(root, "usdgFeed", stableFeed);
        vm.serializeAddress(root, "gapGuard", p.gapGuard);
        vm.serializeAddress(root, "idleVault", p.idleVault);
        vm.serializeUint(root, "maturity", p.maturity);

        string memory markets = "markets";
        string memory marketsJson;
        for (uint256 i; i < out.length; ++i) {
            string memory key = out[i].symbol;
            vm.serializeAddress(key, "token", out[i].token);
            vm.serializeAddress(key, "feed", out[i].feed);
            vm.serializeAddress(key, "market", out[i].market);
            vm.serializeAddress(key, "protectedToken", out[i].protectedToken);
            vm.serializeAddress(key, "boostToken", out[i].boostToken);
            string memory entry = vm.serializeAddress(key, "tranches", out[i].tranches);
            marketsJson = vm.serializeString(markets, key, entry);
        }
        vm.serializeString(root, "markets", marketsJson);
        string memory json = vm.serializeAddress(root, "oracle", address(oracle));

        string memory path = string.concat("deployments/", block.chainid.toString(), ".json");
        vm.writeJson(json, path);
        console.log("wrote", path);
    }
}
