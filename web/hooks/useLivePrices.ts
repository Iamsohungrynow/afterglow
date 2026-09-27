"use client";

import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http } from "viem";
import { robinhood } from "@/lib/chains";
import { feedAbi } from "@/lib/abi";
import { MARKETS, USDG_USD_FEED } from "@/lib/markets";

const mainnet = createPublicClient({ chain: robinhood, transport: http() });

export interface LivePrice {
  usd: number; // per token
  updatedAt: number;
}

/** Real Chainlink prints from Robinhood Chain mainnet: every stock feed plus USDG/USD. */
export function useLivePrices() {
  return useQuery({
    queryKey: ["live-prices"],
    refetchInterval: 20_000,
    queryFn: async () => {
      const symbols = Object.keys(MARKETS);
      const feeds = [...symbols.map((s) => MARKETS[s].mainnetFeed), USDG_USD_FEED];
      const results = await mainnet.multicall({
        allowFailure: true,
        contracts: feeds.map((address) => ({ address, abi: feedAbi, functionName: "latestRoundData" as const })),
      });
      const out: Record<string, LivePrice> = {};
      results.forEach((r, i) => {
        if (r.status !== "success") return;
        const [, answer, , updatedAt] = r.result as readonly [bigint, bigint, bigint, bigint, bigint];
        const key = i < symbols.length ? symbols[i] : "USDG";
        out[key] = { usd: Number(answer) / 1e8, updatedAt: Number(updatedAt) };
      });
      return out;
    },
  });
}
