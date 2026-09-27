"use client";

import { memo, useEffect } from "react";
import type { Address } from "viem";
import { useMarket } from "@/hooks/useMarket";
import { usePosition } from "@/hooks/usePosition";

/** Flat, primitive-only summary of one market's position, so it can be compared cheaply. */
export interface MarketSummary {
  symbol: string;
  loading: boolean;
  live: boolean;
  price: number;
  liqLtvBps: number;
  aprPct: number;
  seniorAprPct: number;
  maturity: number;
  collateral: number;
  face: number;
  debtNow: number;
  lent: number;
  protectedValue: number;
  boostValue: number;
}

/**
 * Reads one market and the owner's position in it, and reports a summary upward. Hooks cannot be
 * called in a loop, so the portfolio renders one of these per symbol. Renders nothing.
 */
export const MarketProbe = memo(function MarketProbe({
  symbol,
  chainId,
  owner,
  now,
  onData,
}: {
  symbol: string;
  chainId: number | undefined;
  owner: Address | undefined;
  now: number | undefined;
  onData: (s: MarketSummary) => void;
}) {
  const { data: m, isLoading: mLoading } = useMarket(symbol, chainId, now);
  const { data: pos, isLoading: pLoading } = usePosition(m, chainId, owner);

  const summary: MarketSummary = {
    symbol,
    loading: mLoading || pLoading || (m?.mode === "live" && Boolean(owner) && !pos),
    live: m?.mode === "live",
    price: m?.price ?? 0,
    liqLtvBps: m?.risk.liqLtvBps ?? 0,
    aprPct: m?.aprPct ?? 0,
    seniorAprPct: m?.tranches.seniorAprPct ?? 0,
    maturity: m?.maturity ?? 0,
    collateral: pos?.collateral ?? 0,
    face: pos?.face ?? 0,
    debtNow: pos?.debtNow ?? 0,
    lent: pos?.lent ?? 0,
    protectedValue: pos?.protectedValue ?? 0,
    boostValue: pos?.boostValue ?? 0,
  };
  // Report only when something actually changed (preview markets rebuild their view every tick).
  const key = JSON.stringify(summary);
  useEffect(() => {
    onData(JSON.parse(key) as MarketSummary);
  }, [key, onData]);

  return null;
});
