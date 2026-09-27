"use client";

import { useNow } from "@/hooks/useNow";
import { WeekClock } from "@/components/WeekClock";
import { GapBars } from "@/components/GapBars";
import { MARKETS, gapModel } from "@/lib/markets";

export function LandingWeek() {
  const now = useNow();
  return <WeekClock now={now} risk={MARKETS.NVDA.risk} />;
}

export function LandingGaps() {
  const m = MARKETS.NVDA;
  const model = gapModel(m.gaps, m.risk.liqLtvBps);
  return (
    <div>
      <GapBars gaps={m.gaps} height={84} />
      <div className="mt-3 flex justify-between text-[12px] text-fg-3">
        <span>NVDA, last {m.gaps.length} weekends</span>
        <span className="num">
          σ {(model.sigma / 100).toFixed(2)}% · buffer {(model.buffer / 100).toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
