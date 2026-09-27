"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { marketAbi, savingsAbi, tranchesAbi } from "@/lib/abi";
import { BASE_RATE_PCT, MARKETS, PROTECTED_TARGET_PCT, deploymentFor, gapModel, premiumAprPct, premiumPpmFromSigma, type RiskParams } from "@/lib/markets";
import { SESSIONS, maxBorrowLtv, scheduleSession, weekendsBetween, type Session } from "@/lib/session";
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
  /** USDG parked in the savings vault by the weekend sweep. */
  idle?: number;
  savingsAprPct?: number;
  /** Weekend premium per weekend, parts per million of the amount borrowed, and weekends left. */
  premiumPpm?: number;
  weekends?: number;
  tranches: TrancheView;
}

export interface TrancheView {
  address?: Address;
  seniorAprPct: number; // Protected target rate
  minJuniorBps: number;
  seniorValue?: number;
  juniorValue?: number;
  coverBps?: number;
}

/** Share of lender money that is lent out. USDG in the savings vault is not lent. */
export function utilisation(m: MarketView): number | undefined {
  if (!m.totalAssets) return undefined;
  return Math.max(0, (m.totalAssets - (m.cash ?? 0) - (m.idle ?? 0)) / m.totalAssets);
}

/** Weekend premium for borrowing `amount` now: kept from what the borrower receives. */
export function premiumFor(m: MarketView, amount: number): number {
  return m.premiumPpm && m.weekends ? (amount * m.premiumPpm * m.weekends) / 1e6 : 0;
}

/** Yearly USDG earned on `capital`: the fixed rate plus weekend premiums on the lent share, and the
 * savings rate on the swept share. */
export function poolIncome(m: MarketView, capital: number): number {
  const lent = utilisation(m) ?? 0;
  const swept = m.totalAssets ? (m.idle ?? 0) / m.totalAssets : 0;
  const lendingPct = m.aprPct + (m.premiumPpm ? premiumAprPct(m.premiumPpm) : 0);
  return capital * ((lendingPct / 100) * lent + ((m.savingsAprPct ?? 0) / 100) * swept);
}

/** Boost APR implied by the waterfall: pool income minus Protected's target, over Boost capital. */
export function boostAprPct(m: MarketView): number | undefined {
  const t = m.tranches;
  if (t.seniorValue === undefined || t.juniorValue === undefined || !t.juniorValue) return undefined;
  const income = poolIncome(m, t.seniorValue + t.juniorValue);
  return ((income - t.seniorValue * (t.seniorAprPct / 100)) / t.juniorValue) * 100;
}

/** Boost share of the vault assumed for the indicative Boost APY while the vault has no deposits. */
export const INDICATIVE_BOOST_MIX = 0.25;

/**
 * Boost APY to show. With deposits it is the live estimate (boostAprPct). Without, it is indicative:
 * the pool fully lent at the fixed rate plus the weekend premium, Protected paid its target on 75%,
 * and the rest over a 25% Boost share.
 */
export function boostDisplay(m: MarketView): { pct: number; indicative: boolean; text: string } {
  const live = boostAprPct(m);
  if (live !== undefined) return { pct: live, indicative: false, text: `${live.toFixed(2)}%` };
  const pool = m.aprPct + (m.premiumPpm ? premiumAprPct(m.premiumPpm) : 0);
  const pct = (pool - (1 - INDICATIVE_BOOST_MIX) * m.tranches.seniorAprPct) / INDICATIVE_BOOST_MIX;
  return { pct, indicative: true, text: `~${pct.toFixed(0)}%` };
}

/** Sub-label for an indicative Boost APY. */
export const INDICATIVE_NOTE = "if fully lent";

/** Boost share of the vault in bps, or undefined while the vault holds no deposits (the contract reports 100%). */
export function vaultCoverBps(t: TrancheView): number | undefined {
  if (t.coverBps === undefined) return undefined;
  if ((t.seniorValue ?? 0) + (t.juniorValue ?? 0) <= 0) return undefined;
  return t.coverBps;
}

/** True once the tranche values are known and the vault is empty. */
export const vaultEmpty = (t: TrancheView) =>
  t.seniorValue !== undefined && t.juniorValue !== undefined && t.seniorValue + t.juniorValue <= 0;

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
      // Weekend premium, on markets that charge one (older deployments do not).
      let premiumPpm: number | undefined;
      let weekends: number | undefined;
      {
        const [pp, wk] = await client!.multicall({
          allowFailure: true,
          contracts: [
            { address, abi: marketAbi, functionName: "weekendPremiumPpm" },
            { address, abi: marketAbi, functionName: "weekendsToMaturity" },
          ],
        });
        if (pp.status === "success") premiumPpm = Number(pp.result);
        if (wk.status === "success") weekends = Number(wk.result);
      }
      // Weekend sweep, on deployments that have a savings vault.
      let idle: number | undefined;
      let savingsAprPct: number | undefined;
      const vault = dep!.idleVault;
      if (vault && !/^0x0+$/.test(vault)) {
        const [ia, rw] = await client!.multicall({
          allowFailure: true,
          contracts: [
            { address, abi: marketAbi, functionName: "idleAssets" },
            { address: vault, abi: savingsAbi, functionName: "rateWad" },
          ],
        });
        if (ia.status === "success") idle = Number(ia.result) / 1e6;
        if (rw.status === "success") savingsAprPct = (Number(rw.result) / 1e18) * 100;
      }
      let tranches: TrancheView = { seniorAprPct: (Number(rate) / 1e18) * 62.5, minJuniorBps: 2000 };
      if (entry!.tranches) {
        const t = entry!.tranches;
        const [vals, cover, srate, minJ] = (await client!.multicall({
          allowFailure: false,
          contracts: [
            { address: t, abi: tranchesAbi, functionName: "trancheValues" },
            { address: t, abi: tranchesAbi, functionName: "juniorCoverBps" },
            { address: t, abi: tranchesAbi, functionName: "seniorRateWad" },
            { address: t, abi: tranchesAbi, functionName: "minJuniorBps" },
          ],
        })) as unknown as [readonly [bigint, bigint], bigint, bigint, number];
        tranches = {
          address: t,
          seniorAprPct: (Number(srate) / 1e18) * 100,
          minJuniorBps: Number(minJ),
          seniorValue: Number(vals[0]) / 1e6,
          juniorValue: Number(vals[1]) / 1e6,
          coverBps: Number(cover),
        };
      }
      const view: MarketView = {
        symbol,
        mode: "live",
        tranches,
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
        idle,
        savingsAprPct,
        premiumPpm,
        weekends,
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
  const apr = BASE_RATE_PCT;
  const view: MarketView = {
    symbol,
    mode: "preview",
    tranches: { seniorAprPct: PROTECTED_TARGET_PCT, minJuniorBps: 2000 },
    premiumPpm: premiumPpmFromSigma(gapModel(info.gaps, info.risk.liqLtvBps).sigma),
    weekends: weekendsBetween(now, maturity),
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
