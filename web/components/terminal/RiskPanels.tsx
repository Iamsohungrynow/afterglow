"use client";

import { WeekClock } from "@/components/WeekClock";
import { GapBars } from "@/components/GapBars";
import { MARKETS, gapModel } from "@/lib/markets";
import { fmtPct } from "@/lib/format";
import type { MarketView } from "@/hooks/useMarket";

export function ClockPanel({ m, now }: { m?: MarketView; now?: number }) {
  const risk = m?.risk ?? MARKETS.NVDA.risk;
  return (
    <section className="flex min-h-0 flex-col border-b border-line">
      <PanelHead title="Market clock" note="Borrow limit across the trading week, UTC" />
      <div className="px-3 pb-2 pt-3">
        <WeekClock now={now} risk={risk} weekendLtvBps={m?.weekendLtvBps} />
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-line bg-line md:grid-cols-4">
        <Cell label="Weekday limit" value={fmtPct(risk.baseLtvBps, 0)} />
        <Cell label="Weekend limit" value={fmtPct(m?.weekendLtvBps ?? risk.weekendLtvBps, 1)} accent />
        <Cell label="Liquidation" value={fmtPct(risk.liqLtvBps, 0)} />
        <Cell label="Liquidation bonus" value={fmtPct(risk.liqBonusBps, 0)} />
      </div>
    </section>
  );
}

export function GapPanel({ symbol, m }: { symbol: string; m?: MarketView }) {
  const info = MARKETS[symbol];
  if (!info) return null;
  const liq = m?.risk.liqLtvBps ?? info.risk.liqLtvBps;
  const model = gapModel(info.gaps, liq);
  const configured = m?.risk.weekendLtvBps ?? info.risk.weekendLtvBps;
  const binding = model.weekendLtv < configured;
  return (
    <section className="flex flex-col">
      <PanelHead title="GapGuard" note={`${symbol} weekend gaps, Chainlink history`} />
      <div className="px-4 pt-4">
        <GapBars gaps={info.gaps} height={92} />
      </div>
      <div className="mt-auto grid grid-cols-2 gap-px border-t border-line bg-line md:grid-cols-4">
        <Cell label="Gap volatility (σ)" value={fmtPct(model.sigma, 2)} />
        <Cell label="3σ buffer" value={fmtPct(model.buffer, 1)} />
        <Cell label="Model weekend limit" value={fmtPct(model.weekendLtv, 1)} accent={binding} />
        <Cell label="Binding" value={binding ? "Model" : "Configured"} />
      </div>
    </section>
  );
}

function PanelHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex h-10 items-center justify-between border-b border-line px-4">
      <span className="text-[12.5px] text-fg">{title}</span>
      <span className="text-[11px] text-fg-3">{note}</span>
    </div>
  );
}

function Cell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-ink px-4 py-3">
      <div className="text-[11px] text-fg-3">{label}</div>
      <div className={`num mt-1 text-[13px] ${accent ? "text-glow" : "text-fg"}`}>{value}</div>
    </div>
  );
}
