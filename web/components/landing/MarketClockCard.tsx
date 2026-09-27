"use client";

import { useLivePrices } from "@/hooks/useLivePrices";
import { fmtDuration, maxBorrowLtv, nextTransition, scheduleSession } from "@/lib/session";
import { MARKETS } from "@/lib/markets";
import { SessionChip } from "@/components/SessionChip";
import { WeekClock } from "@/components/WeekClock";

/** Live hero visual: the real market session, countdown, NVDA limit and Robinhood Chain prices. */
export function MarketClockCard({ now }: { now: number | undefined }) {
  const { data: prices } = useLivePrices();
  const risk = MARKETS.NVDA.risk;
  const state = now ? scheduleSession(now) : undefined;
  const next = now ? nextTransition(now) : undefined;
  const limit = state ? maxBorrowLtv(state.session, state.rampBps, risk.baseLtvBps, risk.weekendLtvBps) : undefined;

  return (
    <div className="relative w-full overflow-hidden rounded-[14px] border border-line-strong bg-ink-2/70 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_30px_80px_-30px_rgb(0_0_0/0.8)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-fg-2">US equities</span>
          {state && <SessionChip session={state.session} />}
        </div>
        {next && (
          <span className="num whitespace-nowrap text-[12px] text-fg-3">
            {next.to} in <span className="text-fg">{fmtDuration(next.in)}</span>
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-4 px-5 pt-5">
        <div>
          <div className="text-[12px] text-fg-3">NVDA borrow limit now</div>
          <div className="num mt-1.5 text-[30px] leading-none text-fg">
            {limit === undefined ? (
              <span className="inline-block h-7 w-20 animate-pulse bg-white/5" />
            ) : limit === 0 ? (
              <span className="text-fg-2">Paused</span>
            ) : (
              <>
                {(limit / 100).toFixed(2)}
                <span className="text-fg-3">%</span>
              </>
            )}
          </div>
        </div>
        <div className="num text-right text-[12px] leading-relaxed text-fg-3">
          <div>weekday {risk.baseLtvBps / 100}%</div>
          <div>weekend {risk.weekendLtvBps / 100}%</div>
        </div>
      </div>

      <div className="px-2 pt-2">
        <WeekClock now={now} risk={risk} compact />
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
      <p className="border-t border-line px-5 py-2.5 text-[11px] text-fg-3">Live Chainlink prices on Robinhood Chain. Times in UTC.</p>
    </div>
  );
}
