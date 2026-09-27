"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { MARKETS } from "@/lib/markets";
import { fmt, fmtDate, fmtPct, daysLeft } from "@/lib/format";
import { fmtDuration, nextTransition } from "@/lib/session";
import { SessionChip } from "@/components/SessionChip";
import type { MarketView } from "@/hooks/useMarket";

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
  const util = m?.totalAssets ? ((m.totalAssets - (m.cash ?? 0)) / m.totalAssets) * 10_000 : undefined;

  return (
    <div className="flex min-h-14 flex-wrap items-center gap-x-8 gap-y-2 border-b border-line px-4 py-2">
      <div className="relative">
        <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 text-left">
          <span className="flex size-7 items-center justify-center rounded-full border border-line-strong text-[10px] font-semibold text-fg-2">
            {symbol.slice(0, 2)}
          </span>
          <span>
            <span className="block text-[15px] font-medium leading-none">{symbol} / USDG</span>
            <span className="mt-1 block text-[11px] text-fg-3">{MARKETS[symbol]?.name}</span>
          </span>
          <CaretDown size={12} className="text-fg-3" />
        </button>
        {open && (
          <div className="absolute left-0 top-11 z-30 w-64 border border-line-strong bg-ink-3 py-1 shadow-[0_18px_40px_rgb(0_0_0/0.45)]">
            {symbols.map((s) => (
              <button
                key={s}
                onClick={() => {
                  onSelect(s);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-white/[0.04] ${s === symbol ? "text-fg" : "text-fg-2"}`}
              >
                <span>{s}</span>
                <span className="text-[11px] text-fg-3">{MARKETS[s]?.kind}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Stat label="Oracle price" value={m ? `${fmt(m.price)}` : undefined} mono />
      <div>
        <div className="text-[11px] text-fg-3">Session</div>
        <div className="mt-1 flex items-center gap-2">
          {m ? <SessionChip session={m.session} /> : <Skel />}
          {next && <span className="num text-[11.5px] text-fg-3">{next.to} in {fmtDuration(next.in)}</span>}
        </div>
      </div>
      <Stat label="Borrow limit now" value={m ? fmtPct(m.maxLtvBps, 1) : undefined} mono accent={m?.session === "Closing"} />
      <Stat label="Fixed APR" value={m ? `${m.aprPct.toFixed(2)}%` : undefined} mono />
      <Stat
        label="Maturity"
        value={m && now ? `${fmtDate(m.maturity)}  ·  ${daysLeft(m.maturity, now).toFixed(1)}d` : undefined}
        mono
      />
      {m?.mode === "live" && (
        <>
          <Stat label="Available" value={`${fmt(m.cash, 0)} USDG`} mono />
          <Stat label="Utilisation" value={fmtPct(util)} mono />
        </>
      )}
      <Stat label="USDG / USD" value={usdgUsd ? usdgUsd.toFixed(4) : undefined} mono />
    </div>
  );
}

function Stat({ label, value, mono, accent }: { label: string; value?: string; mono?: boolean; accent?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-fg-3">{label}</div>
      <div className={`mt-1 text-[13px] ${mono ? "num" : ""} ${accent ? "text-glow" : "text-fg"}`}>{value ?? <Skel />}</div>
    </div>
  );
}

function Skel() {
  return <span className="inline-block h-3.5 w-14 animate-pulse bg-white/5 align-middle" />;
}
