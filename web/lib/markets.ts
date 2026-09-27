import type { Address } from "viem";
import deployments from "./deployments.json";
import { robinhood, robinhoodTestnet, arbitrumSepolia } from "./chains";

export interface RiskParams {
  baseLtvBps: number;
  weekendLtvBps: number;
  liqLtvBps: number;
  liqBonusBps: number;
}

export interface MarketInfo {
  symbol: string;
  name: string;
  kind: "Stock" | "ETF";
  /** Chainlink feed on Robinhood Chain mainnet, used for the live preview. */
  mainnetFeed: Address;
  /**
   * Weekend gaps in bps (Friday's last print to the first print after the Sunday-night reopen),
   * extracted from the mainnet Chainlink round history with scripts/weekend-gaps.mjs on 27 Sep 2026.
   */
  gaps: number[];
  risk: RiskParams;
}

const stock: RiskParams = { baseLtvBps: 5500, weekendLtvBps: 4500, liqLtvBps: 6500, liqBonusBps: 700 };
const etf: RiskParams = { baseLtvBps: 7000, weekendLtvBps: 6000, liqLtvBps: 7700, liqBonusBps: 500 };

export const MARKETS: Record<string, MarketInfo> = {
  NVDA: {
    symbol: "NVDA",
    name: "NVIDIA",
    kind: "Stock",
    mainnetFeed: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15",
    gaps: [86, 88, 1, 30, 118, 107, 20, -12, 117, -81, 36, -111, 15],
    risk: stock,
  },
  SPY: {
    symbol: "SPY",
    name: "S&P 500 ETF",
    kind: "ETF",
    mainnetFeed: "0x319724394D3A0e3669269846abE664Cd621f9f6A",
    gaps: [26, 55, -8, -29, 70, 68, -5, -14, 8, -53, -8, -68, 49],
    risk: etf,
  },
  QQQ: {
    symbol: "QQQ",
    name: "Nasdaq-100 ETF",
    kind: "ETF",
    mainnetFeed: "0x80901d846d5D7B030F26B480776EE3b29374C2ae",
    gaps: [110, 116, -40, 53, 176, 68, 22, 36, 15, -57, -5, -117, 41],
    risk: etf,
  },
  TSLA: {
    symbol: "TSLA",
    name: "Tesla",
    kind: "Stock",
    mainnetFeed: "0x4A1166a659A55625345e9515b32adECea5547C38",
    gaps: [86, 132, -46, 21, 125, 92, 31, 24, 115, -58, 4, -108, 38],
    risk: stock,
  },
  AMZN: {
    symbol: "AMZN",
    name: "Amazon",
    kind: "Stock",
    mainnetFeed: "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C",
    gaps: [33, 37, -38, 1, 100, 95, -28, 52, 6, -49, -45, -117, 43],
    risk: stock,
  },
};

export const USDG_USD_FEED: Address = "0x61B7e5650328764B076A108EFF5fa7282a1B9aD2";

export interface Deployment {
  chainId: number;
  usdg: Address;
  usdgFeed: Address;
  gapGuard: Address;
  oracle: Address;
  maturity: number;
  markets: Record<
    string,
    { token: Address; feed: Address; market: Address; tranches?: Address; protectedToken?: Address; boostToken?: Address }
  >;
}

const DEPLOYMENTS = deployments as Record<string, Deployment>;

export function deploymentFor(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[String(chainId)];
}

/** Chains with a deployment, preferring the testnets the demo runs on. */
export function deployedChains() {
  return [robinhoodTestnet, arbitrumSepolia, robinhood].filter((c) => deploymentFor(c.id));
}

/** Markets tradable on a chain; in preview mode, every market with a mainnet feed. */
export function marketsFor(chainId: number | undefined): string[] {
  const d = chainId ? deploymentFor(chainId) : undefined;
  return d ? Object.keys(d.markets) : ["NVDA", "SPY", "QQQ", "TSLA", "AMZN"];
}

/** Stats a real GapGuard would compute: EWMA sigma (lambda 0.90) and 3-sigma buffer, clamped 5-50%. */
export function gapModel(gaps: number[], liqLtvBps: number) {
  let v = 0;
  gaps.forEach((g, i) => {
    v = i === 0 ? g * g : 0.9 * v + 0.1 * g * g;
  });
  const sigma = Math.sqrt(v);
  const buffer = gaps.length < 8 ? 5000 : Math.min(5000, Math.max(500, 3 * sigma));
  return { sigma, buffer, weekendLtv: Math.floor((liqLtvBps * (10_000 - buffer)) / 10_000) };
}
