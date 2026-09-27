"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { AmountCell, Card, Chip, PageHeader, Skel, TokenMark } from "@/components/ui/primitives";
import { Segmented } from "@/components/earn/Segmented";
import { useReadChain } from "@/hooks/useReadChain";
import { useNow } from "@/hooks/useNow";
import { INDICATIVE_NOTE, boostDisplay, useMarket, vaultCoverBps, vaultEmpty, type MarketView } from "@/hooks/useMarket";
import { MARKETS, marketsFor } from "@/lib/markets";
import { NO_SCROLLBAR, fmt, fmtPct } from "@/lib/format";

type Filter = "All" | "Protected" | "Boost";
type Tranche = "protected" | "boost";

/** Table columns from `sm` up; below that each vault is a stacked card. */
const COLS = "hidden sm:grid grid-cols-[minmax(220px,1.6fr)_1fr_1fr_0.8fr_0.9fr_0.9fr] items-center gap-4";

export default function EarnPage() {
  const chainId = useReadChain();
  const now = useNow();
  const symbols = marketsFor(chainId);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [totals, setTotals] = useState<Record<string, number | undefined>>({});

  const report = useCallback((sym: string, v: number | undefined) => {
    setTotals((t) => (t[sym] === v ? t : { ...t, [sym]: v }));
  }, []);

  const total = useMemo(() => {
    const vals = symbols.map((s) => totals[s]).filter((v): v is number => v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : undefined;
  }, [symbols, totals]);

  // Which rows are visible is known without chain data: filter on names only.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return symbols
      .map((sym) => {
        const tranches = (["protected", "boost"] as Tranche[]).filter((t) => {
          if (filter === "Protected" && t !== "protected") return false;
          if (filter === "Boost" && t !== "boost") return false;
          if (!q) return true;
          const hay = `${t === "protected" ? "protected" : "boost"} ${sym} ${MARKETS[sym]?.name ?? ""} usdg`.toLowerCase();
          return q.split(/\s+/).every((w) => hay.includes(w));
        });
        return { sym, tranches };
      })
      .filter((r) => r.tranches.length > 0);
  }, [symbols, query, filter]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <PageHeader
        title="Earn"
        subtitle="Lend USDG against stock at a fixed rate. Protected is paid first. Boost earns more and takes losses first."
        pill={{ label: "Total deposits", value: total === undefined ? <Skel w={70} h={12} /> : `${fmt(total)} USDG` }}
      />

      <Card className="mt-8 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-[320px]">
            <span className="sr-only">Filter vaults</span>
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by stock or tranche"
              className="h-9 w-full rounded-[8px] border border-line bg-ink pl-9 pr-3 text-[13px] text-fg placeholder:text-fg-3 outline-none transition focus:border-line-strong"
            />
          </label>
          <Segmented items={["All", "Protected", "Boost"] as Filter[]} value={filter} onChange={setFilter} />
        </div>

        <div className={`overflow-x-auto ${NO_SCROLLBAR}`}>
          <div className="sm:min-w-[900px]">
            <div className={`${COLS} px-5 py-3 text-[12px] text-fg-3`}>
              <span>Vault</span>
              <span>Deposits</span>
              <span>Backing</span>
              <span>Role</span>
              <span>Cover</span>
              <span className="text-right">APY</span>
            </div>
            {symbols.map((sym) => {
              const row = visible.find((r) => r.sym === sym);
              return <MarketRows key={sym} symbol={sym} chainId={chainId} now={now} tranches={row?.tranches ?? []} onTotal={report} />;
            })}
            {visible.length === 0 && (
              <div className="border-t border-line px-5 py-14 text-center">
                <p className="text-[14px] text-fg-2">No vaults match this filter.</p>
                <button
                  onClick={() => {
                    setQuery("");
                    setFilter("All");
                  }}
                  className="mt-3 rounded-[8px] border border-line-strong px-3 py-1.5 text-[12.5px] text-fg-2 transition hover:text-fg"
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <p className="mt-4 text-[12px] text-fg-3">
        Protected APY is the target rate the vault pays before Boost earns anything. Boost APY is an estimate from the current utilisation
        and moves with it. Figures marked ~ are indicative for a vault with no deposits yet: the pool fully lent, with 25% in Boost.
      </p>
    </div>
  );
}

/** One market: fetches its view once and renders its Protected and Boost rows. */
function MarketRows({
  symbol,
  chainId,
  now,
  tranches,
  onTotal,
}: {
  symbol: string;
  chainId: number | undefined;
  now: number | undefined;
  tranches: Tranche[];
  onTotal: (sym: string, v: number | undefined) => void;
}) {
  const { data: m } = useMarket(symbol, chainId, now);
  const t = m?.tranches;
  const sum = t?.seniorValue !== undefined && t.juniorValue !== undefined ? t.seniorValue + t.juniorValue : m ? 0 : undefined;

  useEffect(() => {
    onTotal(symbol, sum);
  }, [symbol, sum, onTotal]);

  return (
    <>
      {tranches.map((tr) => (m ? <TrancheRow key={tr} m={m} tranche={tr} /> : <SkeletonRow key={tr} />))}
    </>
  );
}

function TrancheRow({ m, tranche }: { m: MarketView; tranche: Tranche }) {
  const t = m.tranches;
  const isP = tranche === "protected";
  const value = isP ? t.seniorValue : t.juniorValue;
  const boost = boostDisplay(m);
  const label = isP ? "Protected" : "Boost";
  const cover = vaultCoverBps(t);
  const empty = vaultEmpty(t);
  const href = `/earn/${m.symbol}?t=${tranche}`;
  const apy = isP ? (
    <AmountCell main={`${t.seniorAprPct.toFixed(2)}%`} sub="target" />
  ) : (
    <AmountCell main={<span className="text-glow">{boost.text}</span>} sub={boost.indicative ? INDICATIVE_NOTE : "estimated"} />
  );

  return (
    <>
    <Link
      href={href}
      className="flex items-center gap-3 border-t border-line px-4 py-4 transition-colors hover:bg-white/[0.02] sm:hidden"
    >
      <TokenMark symbol="USDG" size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] text-fg">
            {label} {m.symbol}
          </span>
          <Chip tone={isP ? "neutral" : "glow"}>{isP ? "Paid first" : "First loss"}</Chip>
        </div>
        <div className="num mt-1 text-[12px] text-fg-3">
          {value === undefined ? "Not deployed here" : `${fmt(value)} USDG deposited`}
        </div>
      </div>
      <div className="shrink-0 text-right">{apy}</div>
    </Link>
    <Link
      href={href}
      className={`${COLS} border-t border-line px-5 py-4 transition-colors hover:bg-white/[0.02]`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <TokenMark symbol="USDG" size={30} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] text-fg">
              {label} {m.symbol}
            </span>
            <Chip tone={isP ? "neutral" : "glow"}>{label}</Chip>
          </div>
          {m.mode === "preview" && <div className="mt-0.5 text-[11.5px] text-fg-3">Preview, not deployed on this network</div>}
        </div>
      </div>

      <AmountCell main={value === undefined ? "-" : `${fmt(value)} USDG`} />

      <div className="flex items-center gap-2">
        <TokenMark symbol={m.symbol} size={22} />
        <span className="text-[13px] text-fg-2">{m.symbol} collateral</span>
      </div>

      <span className="text-[13px] text-fg-2">{isP ? "Paid first" : "First loss"}</span>

      <AmountCell main={fmtPct(cover)} sub={empty ? "No deposits yet" : `min ${fmtPct(t.minJuniorBps, 0)}`} />

      <div className="text-right">{apy}</div>
    </Link>
    </>
  );
}

function SkeletonRow() {
  return (
    <>
    <div className="flex items-center gap-3 border-t border-line px-4 py-4 sm:hidden">
      <Skel w={30} h={30} />
      <div className="flex-1">
        <Skel w={120} h={14} />
      </div>
      <Skel w={52} />
    </div>
    <div className={`${COLS} border-t border-line px-5 py-4`}>
      <div className="flex items-center gap-3">
        <Skel w={30} h={30} />
        <Skel w={140} h={14} />
      </div>
      <Skel w={90} />
      <Skel w={100} />
      <Skel w={64} />
      <Skel w={48} />
      <div className="text-right">
        <Skel w={52} />
      </div>
    </div>
    </>
  );
}
