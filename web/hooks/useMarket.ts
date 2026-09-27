"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { marketAbi } from "@/lib/abi";
import { MARKETS, deploymentFor, type RiskParams } from "@/lib/markets";
import { SESSIONS, maxBorrowLtv, scheduleSession, type Session } from "@/lib/session";
import { useLivePrices } from "./useLivePrices";

export interface MarketView {
  symbol: string;
  mode: "live" | "preview";
  market?: Address;
  token?: Address;
  usdg?: Address;
  session: Session;
  price: number; // USDG per token
  maxLtvBps: number;
  weekendLtvBps: number;
  risk: RiskParams;
  aprPct: number;
  maturity: number;
  discount: number; // present value of 1 face
  cash?: number; // USDG
  totalFace?: number;
  totalAssets?: number;
  supplyCap?: number;
}

/** First Thursday 20:00 UTC at or after t (matches the deploy script). */
function previewMaturity(now: number) {
  const t = now + 28 * 86400;
  const into = (t + 3 * 86400) % (7 * 86400);
  let m = t - into + 3 * 86400 + 20 * 3600;
  if (m < t) m += 7 * 86400;
  return m;
}

export function useMarket(symbol: string, chainId: number | undefined, now: number | undefined) {
  const dep = chainId ? deploymentFor(chainId) : undefined;
  const entry = dep?.markets[symbol];
  const client = usePublicClient({ chainId });
  const { data: prices } = useLivePrices();

  const live = useQuery({
    enabled: Boolean(entry && client),
    queryKey: ["market", chainId, entry?.market],
    refetchInterval: 12_000,
    queryFn: async () => {
      const address = entry!.market;
      const calls = [
        "marketStatus",
        "risk",
        "weekendLtvBps",
        "rateWad",
        "maturity",
        "cash",
        "totalFace",
        "totalAssets",
        "supplyCap",
      ] as const;
      const r = await client!.multicall({
        allowFailure: false,
        contracts: calls.map((functionName) => ({ address, abi: marketAbi, functionName })),
      });
      const [status, risk, weekend, rate, maturity, cash, totalFace, totalAssets, cap] = r as unknown as [
        readonly [number, bigint, bigint, bigint],
        readonly [number, number, number, number],
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ];
      const view: MarketView = {
        symbol,
        mode: "live",
        market: address,
        token: entry!.token,
        usdg: dep!.usdg,
        session: SESSIONS[status[0]] ?? "Halted",
        price: Number(status[1]) / 1e18,
        maxLtvBps: Number(status[2]),
        weekendLtvBps: Number(weekend),
        risk: { baseLtvBps: risk[0], weekendLtvBps: risk[1], liqLtvBps: risk[2], liqBonusBps: risk[3] },
        aprPct: (Number(rate) / 1e18) * 100,
        maturity: Number(maturity),
        discount: Number(status[3]) / 1e18,
        cash: Number(cash) / 1e6,
        totalFace: Number(totalFace) / 1e6,
        totalAssets: Number(totalAssets) / 1e6,
        supplyCap: cap > 10n ** 30n ? undefined : Number(cap) / 1e6,
      };
      return view;
    },
  });

  if (entry) return { data: live.data, isLoading: live.isLoading, error: live.error };

  // Preview: real mainnet Chainlink prices, schedule from the same rules the oracle enforces.
  const info = MARKETS[symbol];
  const p = prices?.[symbol];
  const usdg = prices?.USDG?.usd ?? 1;
  if (!info || !p || now === undefined) return { data: undefined, isLoading: true, error: null };
  const { session, rampBps } = scheduleSession(now);
  const maturity = previewMaturity(now);
  const apr = 8;
  const view: MarketView = {
    symbol,
    mode: "preview",
    session,
    price: p.usd / usdg,
    maxLtvBps: maxBorrowLtv(session, rampBps, info.risk.baseLtvBps, info.risk.weekendLtvBps),
    weekendLtvBps: info.risk.weekendLtvBps,
    risk: info.risk,
    aprPct: apr,
    maturity,
    discount: 1 / (1 + (apr / 100) * ((maturity - now) / (365 * 86400))),
  };
  return { data: view, isLoading: false, error: null };
}
