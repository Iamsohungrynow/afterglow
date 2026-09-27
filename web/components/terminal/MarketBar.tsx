"use client";

import { useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { MARKETS } from "@/lib/markets";
import { fmt, fmtDate, fmtPct, daysLeft } from "@/lib/format";
import { fmtDuration, nextTransition } from "@/lib/session";
import { SessionChip } from "@/components/SessionChip";
import { Chip, TokenMark } from "@/components/ui/primitives";
import { utilisation, type MarketView } from "@/hooks/useMarket";

/** Market header row: pair selector on the left, one line of compact labelled stats. */
export function MarketBar({
  symbols,
  symbol,
  onSelect,
  m,
  now,
  usdgUsd,
}: {
  symbols: string[];
  symbol: string;
  onSelect: (s: string) => void;
  m?: MarketView;
  now?: number;
  usdgUsd?: number;
}) {
  const [open, setOpen] = useState(false);
  const next = now ? nextTransition(now) : undefined;
  const live = m?.mode === "live";
  const u = m ? utilisation(m) : undefined;
  const util = u === undefined ? undefined : u * 10_000;
  const info = MARKETS[symbol];

  return (
    <div className="flex h-14 shrink-0 items-stretch border-b border-line">
      <div className="relative flex shrink-0 items-center gap-3 border-r border-line pl-4 pr-4">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-2.5 whitespace-nowrap rounded-[8px] py-1 pr-1 text-left transition-colors hover:text-fg"
        >
          <TokenMark symbol={symbol} size={26} />
          <span className="text-[17px] font-medium tracking-[-0.01em] text-fg">
            {symbol} <span className="text-fg-3">/</span> USDG
          </span>
          <CaretDown size={12} weight="bold" className={`text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <span className="hidden sm:inline-flex">
          <Chip>{info?.kind === "ETF" ? "ETF token" : "Stock token"}</Chip>
        </span>

        {open && (
          <>
            <button aria-label="Close market list" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
            <div className="absolute left-2 top-[calc(100%+4px)] z-40 w-72 border border-line-strong bg-ink-3 py-1 shadow-[0_18px_40px_rgb(0_0_0/0.5)]">
              <div className="flex justify-between px-3 pb-1.5 pt-1 text-[11px] text-fg-3">
                <span>Market</span>
                <span>Oracle feed</span>
              </div>
              {symbols.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    onSelect(s);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-white/[0.04] ${s === symbol ? "text-fg" : "text-fg-2"}`}
                >
                  <TokenMark symbol={s} size={20} />
                  <span className="flex-1">
                    {s} / USDG
                    <span className="ml-2 text-[11px] text-fg-3">{MARKETS[s]?.name}</span>
                  </span>
                  {s === symbol ? <Check size={12} className="text-glow" /> : <span className="text-[11px] text-fg-3">Chainlink</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto whitespace-nowrap px-4 [scrollbar-width:none]">
        <Stat label="Oracle price" loading={!m} value={m && fmt(m.price)} />
        <div className="shrink-0">
          <div className="text-[11px] leading-none text-fg-3">Session</div>
          <div className="mt-1.5 flex items-center gap-2 leading-none">
            {m ? <SessionChip session={m.session} /> : <Skel />}
            {next && (
              <span className="num text-[12px] text-fg-3">
                {next.to} in <span className="text-fg-2">{fmtDuration(next.in)}</span>
              </span>
            )}
          </div>
        </div>
        <Stat
          label="Borrow limit now"
          loading={!m}
          value={m && (m.maxLtvBps ? fmtPct(m.maxLtvBps, 1) : "Paused")}
          tone={!m?.maxLtvBps ? "muted" : m.session === "Closing" ? "glow" : "live"}
        />
        <Stat label="Weekend LTV" loading={!m} value={m && fmtPct(m.weekendLtvBps, 1)} tone="glow" />
        <Stat label="Fixed APR" loading={!m} value={m && `${m.aprPct.toFixed(2)}%`} />
        {m?.premiumPpm !== undefined && <Stat label="Weekend premium" value={`${(m.premiumPpm / 100).toFixed(1)} bp/wk`} tone="glow" />}
        <Stat
          label="Maturity"
          loading={!m || !now}
          value={m && now ? `${fmtDate(m.maturity)}, ${daysLeft(m.maturity, now).toFixed(1)}d` : undefined}
        />
        <Stat label="Liquidity" loading={!m} value={live && m?.cash !== undefined ? `${fmt(m.cash, 0)} USDG` : "-"} />
        <Stat label="Utilisation" loading={!m} value={live ? fmtPct(util) : "-"} />
        <Stat
          label="USDG peg"
          loading={usdgUsd === undefined}
          value={usdgUsd !== undefined ? `$${usdgUsd.toFixed(4)}` : undefined}
          tone={usdgUsd === undefined ? "fg" : Math.abs(usdgUsd - 1) <= 0.005 ? "live" : Math.abs(usdgUsd - 1) <= 0.02 ? "glow" : "halt"}
        />
      </div>
    </div>
  );
}

const TONE = { fg: "text-fg", glow: "text-glow", live: "text-live", halt: "text-halt", muted: "text-fg-3" } as const;
type Tone = keyof typeof TONE;

/** Label over a value coloured by meaning: amber weekend, red liquidation, green healthy. */
function Stat({ label, value, loading, tone = "fg" }: { label: string; value?: string; loading?: boolean; tone?: Tone }) {
  return (
    <div className="shrink-0">
      <div className="text-[11px] leading-none text-fg-3">{label}</div>
      <div className={`num mt-1.5 text-[13px] leading-none ${TONE[tone]}`}>
        {loading ? <Skel /> : (value ?? "-")}
      </div>
    </div>
  );
}

function Skel() {
  return <span className="inline-block h-3 w-14 animate-pulse bg-white/[0.06] align-middle" />;
}
