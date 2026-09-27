"use client";

import { useNow } from "@/hooks/useNow";
import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtDuration, nextTransition, scheduleSession } from "@/lib/session";
import { MARKETS } from "@/lib/markets";
import { SessionChip } from "@/components/SessionChip";
import { WeekClock } from "@/components/WeekClock";

/** Live hero visual: the real market session, countdown and Robinhood Chain prices. */
export function MarketClockCard() {
  const now = useNow();
  const { data: prices } = useLivePrices();
  const state = now ? scheduleSession(now) : undefined;
  const next = now ? nextTransition(now) : undefined;

  return (
    <div className="relative w-full border border-line bg-ink-2/80 backdrop-blur-sm shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-fg-2">US equities</span>
          {state && <SessionChip session={state.session} />}
        </div>
        {next && (
          <span className="num text-[12px] text-fg-3">
            {next.to} in <span className="text-fg">{fmtDuration(next.in)}</span>
          </span>
        )}
      </div>

      <div className="px-2 pt-3">
        <WeekClock now={now} risk={MARKETS.NVDA.risk} compact />
      </div>

      <div className="grid grid-cols-3 border-t border-line">
        {(["NVDA", "SPY", "USDG"] as const).map((k, i) => {
          const p = prices?.[k];
          return (
            <div key={k} className={`px-5 py-3.5 ${i ? "border-l border-line" : ""}`}>
              <div className="text-[11px] text-fg-3">{k === "USDG" ? "USDG / USD" : `${k} / USD`}</div>
              <div className="num mt-1 text-[15px] text-fg">
                {p ? (k === "USDG" ? p.usd.toFixed(4) : p.usd.toFixed(2)) : <span className="inline-block h-4 w-16 animate-pulse bg-white/5" />}
              </div>
            </div>
          );
        })}
      </div>
      <p className="border-t border-line px-5 py-2.5 text-[11px] text-fg-3">
        Chainlink on Robinhood Chain. {MARKETS.NVDA.symbol} limits shown: {MARKETS.NVDA.risk.baseLtvBps / 100}% weekday,{" "}
        {MARKETS.NVDA.risk.weekendLtvBps / 100}% into the weekend.
      </p>
    </div>
  );
}
