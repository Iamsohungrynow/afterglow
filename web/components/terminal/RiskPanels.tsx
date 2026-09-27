"use client";

import { useState } from "react";
import { WeekClock } from "@/components/WeekClock";
import { GapBars } from "@/components/GapBars";
import { MARKETS, gapModel } from "@/lib/markets";
import { fmtLtv, fmtPct, fmtPremium } from "@/lib/format";
import type { MarketView } from "@/hooks/useMarket";

type View = "Week" | "Gaps";

/**
 * Center panel, laid out like a chart: a toolbar that switches between the trading-week clock and
 * GapGuard's weekend-gap history, then GapGuard's model stats as a compact strip.
 */
export function MarketChartPanel({ symbol, m, now }: { symbol: string; m?: MarketView; now?: number }) {
  const [view, setView] = useState<View>("Week");
  const info = MARKETS[symbol] ?? MARKETS.TSLA;
  const risk = m?.risk ?? info.risk;
  const model = gapModel(info.gaps, risk.liqLtvBps);
  const configured = m?.risk.weekendLtvBps ?? info.risk.weekendLtvBps;
  const binding = model.weekendLtv < configured;

  return (
    <section className="flex shrink-0 flex-col border-b border-line">
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-fg">Market clock</span>
          <span className="h-3.5 w-px bg-line-strong" />
          <div className="flex items-center gap-0.5">
            {(["Week", "Gaps"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`h-6 rounded-[8px] px-2 text-[12px] transition-colors ${
                  view === v ? "bg-white/[0.07] text-fg" : "text-fg-3 hover:text-fg-2"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <span className="text-[11px] text-fg-3">{view === "Gaps" ? `${symbol} weekend gaps, Chainlink, UTC` : "UTC"}</span>
      </div>

      {view === "Week" ? (
        <div>
          <div className="px-3 pb-1 pt-3">
            <WeekClock now={now} risk={risk} weekendLtvBps={m?.weekendLtvBps} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 pb-3 text-[11.5px]">
            <Legend k="Weekday limit" v={fmtLtv(risk.baseLtvBps)} />
            <Legend k="Weekend limit" v={fmtLtv(m?.weekendLtvBps ?? risk.weekendLtvBps)} tone="glow" />
            <Legend k="Liquidation" v={fmtLtv(risk.liqLtvBps)} tone="halt" />
            <Legend k="Liquidation bonus" v={fmtLtv(risk.liqBonusBps)} />
          </div>
        </div>
      ) : (
        <div className="px-4 pb-3 pt-4">
          <GapBars gaps={info.gaps} height={240} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-px border-t border-line bg-line md:grid-cols-5">
        <Cell label="Gap volatility (σ)" value={fmtPct(model.sigma, 2)} tone="glow" />
        <Cell label="Safety buffer (3σ, min 5%)" value={fmtPct(model.buffer, 1)} />
        <Cell
          label="GapGuard limit"
          value={fmtLtv(model.weekendLtv)}
          tone={binding ? "glow" : "muted"}
          note={binding ? "binding" : "not binding"}
        />
        <Cell label="Weekend limit in use" value={fmtLtv(m?.weekendLtvBps ?? configured)} tone="glow" />
        <Cell
          label="Weekend premium"
          value={fmtPremium(m?.premiumPpm)}
          tone={m?.premiumPpm !== undefined ? "glow" : "muted"}
          className="col-span-2 md:col-span-1"
        />
      </div>
    </section>
  );
}

const TONE = { fg: "text-fg", glow: "text-glow", live: "text-live", halt: "text-halt", muted: "text-fg-3" } as const;
type Tone = keyof typeof TONE;

function Legend({ k, v, tone = "fg" }: { k: string; v: string; tone?: Tone }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-fg-3">{k}</span> <span className={`num ${TONE[tone]}`}>{v}</span>
    </span>
  );
}

/** Label over a value coloured by meaning: amber weekend, red liquidation, green healthy. */
function Cell({ label, value, tone = "fg", note, className = "" }: { label: string; value: string; tone?: Tone; note?: string; className?: string }) {
  return (
    <div className={`bg-ink px-4 py-3 ${className}`}>
      <div className="text-[11px] text-fg-3">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className={`num text-[14px] ${TONE[tone]}`}>{value}</span>
        {note && <span className="text-[11px] text-fg-3">{note}</span>}
      </div>
    </div>
  );
}
