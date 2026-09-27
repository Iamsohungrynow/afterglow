"use client";

import { useReadContract } from "wagmi";
import { Card, Skel } from "@/components/ui/primitives";
import { SessionChip } from "@/components/SessionChip";
import { WeekClock } from "@/components/WeekClock";
import { GapBars } from "@/components/GapBars";
import type { MarketView } from "@/hooks/useMarket";
import { MARKETS, gapModel } from "@/lib/markets";
import { fmtDate, fmtPct } from "@/lib/format";
import { fmtSeconds, maturityLeft } from "./format";

const graceAbi = [
  { type: "function", name: "gracePeriod", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
] as const;

/** Grace period the deploy script uses; preview markets show it since they have no contract. */
const DEFAULT_GRACE = 2 * 86400;

export function MarketTab({ m, now }: { m?: MarketView; now?: number }) {
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-[13.5px] text-fg">Borrow limit across the week</h3>
          <span className="text-[12px] text-fg-3">UTC</span>
        </div>
        <div className="mt-4">
          {m ? <WeekClock now={now} risk={m.risk} weekendLtvBps={m.weekendLtvBps} /> : <div className="h-[220px] animate-pulse rounded-[8px] bg-white/[0.03]" />}
        </div>
      </Card>
      <div className="max-w-[70ch] space-y-3 text-[13px] leading-relaxed text-fg-2">
        <p>
          The oracle follows the US stock week. While the market is <span className="text-fg">Live</span> you can borrow up to the base
          LTV ({m ? fmtPct(m.risk.baseLtvBps) : "-"}). In the four hours before the Friday close (20:00 ET, Saturday 00:00 UTC) the
          session is <span className="text-fg">Closing</span> and the limit ramps down to the weekend LTV ({m ? fmtPct(m.weekendLtvBps) : "-"}).
        </p>
        <p>
          From the close until the Sunday 20:00 ET reopen the market is <span className="text-fg">Closed</span>: no new borrowing,
          collateral withdrawals must keep the loan within the weekend LTV, and no one can liquidate against the frozen Friday price.
          The market is <span className="text-fg">Halted</span> whenever the price cannot be trusted, for example when a feed
          misses its heartbeat or reports bad data, the issuer pauses the token or a corporate action is due, or USDG trades more than
          2% away from $1. Repaying always works.
        </p>
      </div>
    </div>
  );
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[13px] text-fg-3">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] text-fg-3/80">{hint}</div>}
      </div>
      <div className="num shrink-0 whitespace-nowrap text-right text-[13px] text-fg">{children}</div>
    </div>
  );
}

export function RiskTab({ m, chainId, now }: { m?: MarketView; chainId?: number; now?: number }) {
  const grace = useReadContract({
    address: m?.market,
    abi: graceAbi,
    functionName: "gracePeriod",
    chainId,
    query: { enabled: Boolean(m?.market), staleTime: Infinity },
  });
  const graceSec = m?.mode === "live" ? (grace.data !== undefined ? Number(grace.data) : undefined) : DEFAULT_GRACE;
  const s = <Skel w={48} />;
  const tightened = m && m.weekendLtvBps < m.risk.weekendLtvBps;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Card className="p-5">
        <h3 className="text-[13.5px] text-fg">Loan-to-value limits</h3>
        <div className="mt-4 space-y-3.5">
          <Row label="Base LTV" hint="Borrow limit while the market is live">
            {m ? fmtPct(m.risk.baseLtvBps) : s}
          </Row>
          <Row label="Weekend LTV" hint={tightened ? `Tightened by GapGuard from ${fmtPct(m.risk.weekendLtvBps)}` : "Limit carried over the weekend"}>
            {m ? fmtPct(m.weekendLtvBps) : s}
          </Row>
          <Row label="Liquidation LTV" hint="Loans above this can be liquidated">
            {m ? fmtPct(m.risk.liqLtvBps) : s}
          </Row>
          <Row label="Liquidation bonus" hint="Extra collateral paid to the liquidator">
            {m ? fmtPct(m.risk.liqBonusBps) : s}
          </Row>
        </div>
      </Card>
      <Card className="p-5">
        <h3 className="text-[13.5px] text-fg">Oracle and term</h3>
        <div className="mt-4 space-y-3.5">
          <Row label="Oracle session">{m ? <SessionChip session={m.session} /> : s}</Row>
          <Row label="Maturity" hint={m ? maturityLeft(m.maturity, now) : undefined}>
            {m ? fmtDate(m.maturity) : s}
          </Row>
          <Row label="Grace period" hint="After maturity plus grace, unpaid loans can be liquidated">
            {graceSec !== undefined ? fmtSeconds(graceSec) : s}
          </Row>
          <Row label="Fixed APR" hint="Set when you borrow, owed at maturity">
            {m ? `${m.aprPct.toFixed(2)}%` : s}
          </Row>
        </div>
      </Card>
    </div>
  );
}

export function WeekendTab({ m, symbol }: { m?: MarketView; symbol: string }) {
  const info = MARKETS[symbol];
  if (!info) return null;
  const liq = m?.risk.liqLtvBps ?? info.risk.liqLtvBps;
  const model = gapModel(info.gaps, liq);
  const pct = (bps: number) => `${(bps / 100).toFixed(2)}%`;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="text-[13.5px] text-fg">Weekend gaps, last {info.gaps.length} weekends</h3>
          <span className="text-[12px] text-fg-3">Chainlink, Robinhood Chain</span>
        </div>
        <div className="mt-5">
          <GapBars gaps={info.gaps} height={180} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line md:grid-cols-5">
          {[
            { label: "Gap volatility (σ)", value: pct(model.sigma), tone: "text-glow" },
            { label: "Safety buffer", value: pct(model.buffer), tone: "text-fg" },
            { label: "Model weekend LTV", value: fmtPct(model.weekendLtv, 2), tone: "text-fg" },
            { label: "Weekend LTV in use", value: m ? fmtPct(m.weekendLtvBps, 2) : "-", tone: "text-glow" },
            {
              label: "Weekend premium",
              value: m?.premiumPpm !== undefined ? `${(m.premiumPpm / 100).toFixed(1)} bp` : "-",
              tone: m?.premiumPpm !== undefined ? "text-glow" : "text-fg-3",
            },
          ].map((x) => (
            <div key={x.label} className="bg-ink-2 p-4">
              <div className="text-[12px] text-fg-3">{x.label}</div>
              <div className={`num mt-1.5 text-[18px] ${x.tone}`}>{x.value}</div>
            </div>
          ))}
        </div>
      </Card>
      <p className="max-w-[70ch] text-[13px] leading-relaxed text-fg-2">
        Each bar is one weekend: the move from Friday&apos;s last price to the first price after the Sunday night reopen. GapGuard, a
        Stylus contract, weights recent weekends more (EWMA, lambda 0.90), sets a safety buffer of three times that volatility kept
        between 5% and 50%, and limits the weekend LTV to the liquidation LTV reduced by the buffer. It can only tighten the configured
        weekend LTV, never loosen it.
      </p>
    </div>
  );
}
