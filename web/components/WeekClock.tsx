"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SCHEDULE, WEEK, intoWeek, maxBorrowLtv, scheduleSession } from "@/lib/session";
import type { RiskParams } from "@/lib/markets";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PAD_T = 18;
const PAD_B = 28;

/**
 * The trading week as Phaselock sees it (UTC): borrowing limit over time, the pre-close ramp,
 * the weekend lock, and where "now" sits. Drawn from the same schedule the contract enforces.
 */
export function WeekClock({
  now,
  risk,
  weekendLtvBps,
  compact = false,
}: {
  now: number | undefined;
  risk: RiskParams;
  weekendLtvBps?: number;
  compact?: boolean;
}) {
  // Draw at the element's real pixel width so text and strokes are never stretched.
  const ref = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(1000);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = compact ? 160 : 220;
  const plotH = H - PAD_T - PAD_B;
  const weekend = weekendLtvBps ?? risk.weekendLtvBps;
  const s = DEFAULT_SCHEDULE;
  const x = (sec: number) => (sec / WEEK) * W;
  const y = (bps: number) => PAD_T + plotH - (bps / 10_000) * plotH * 1.18;

  // Borrow-limit path, sampled every 10 minutes across the week (Monday 00:00 UTC origin).
  const path = useMemo(() => {
    const monday = 4 * 86400; // unix 4 days = Monday 00:00 UTC
    const pts: string[] = [];
    for (let t = 0; t <= WEEK; t += 600) {
      const { session, rampBps } = scheduleSession(monday + t, s);
      const v = maxBorrowLtv(session, rampBps, risk.baseLtvBps, weekend);
      pts.push(`${pts.length ? "L" : "M"}${x(t).toFixed(1)},${y(v).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [risk.baseLtvBps, weekend, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeX = x(s.weeklyCloseOffset);
  const openX = x((s.weeklyCloseOffset + s.weekendLength) % WEEK || WEEK);
  const rampX = x(s.weeklyCloseOffset - s.closingWindow);
  const nowX = now !== undefined ? x(intoWeek(now)) : undefined;
  const nowState = now !== undefined ? scheduleSession(now, s) : undefined;
  const nowLtv = nowState ? maxBorrowLtv(nowState.session, nowState.rampBps, risk.baseLtvBps, weekend) : 0;

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className={compact ? "h-[160px] w-full" : "h-[220px] w-full"}
      role="img"
      aria-label="Borrow limit across the trading week"
    >
      <defs>
        <linearGradient id="wc-ramp" x1="0" x2="1">
          <stop offset="0" stopColor="var(--color-glow)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--color-glow)" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="wc-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--color-glow)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--color-glow)" stopOpacity="0" />
        </linearGradient>
        <pattern id="wc-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgb(255 255 255 / 0.05)" strokeWidth="2" />
        </pattern>
      </defs>

      {/* Weekend lock */}
      <rect x={closeX} y={PAD_T} width={openX - closeX} height={plotH} fill="url(#wc-hatch)" />
      {/* Pre-close ramp */}
      <rect x={rampX} y={PAD_T} width={closeX - rampX} height={plotH} fill="url(#wc-ramp)" />

      {/* Day grid */}
      {DAYS.map((d, i) => (
        <g key={d}>
          <line x1={x(i * 86400)} x2={x(i * 86400)} y1={PAD_T} y2={H - PAD_B} stroke="var(--color-line)" />
          <text x={x(i * 86400) + 6} y={H - 10} fill="var(--color-fg-3)" fontSize="11" fontFamily="var(--font-mono)">
            {d}
          </text>
        </g>
      ))}

      {/* Reference levels */}
      {[
        { v: risk.liqLtvBps, label: "liquidation" },
        { v: weekend, label: "weekend" },
      ].map(({ v, label }) => (
        <g key={label}>
          <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--color-line-strong)" strokeDasharray="3 5" />
          {!compact && (
            <text x={W - 6} y={y(v) - 5} textAnchor="end" fill="var(--color-fg-3)" fontSize="10.5" fontFamily="var(--font-mono)">
              {label} {(v / 100).toFixed(0)}%
            </text>
          )}
        </g>
      ))}

      {/* Borrow limit */}
      <path d={`${path} L${W},${H - PAD_B} L0,${H - PAD_B} Z`} fill="url(#wc-area)" />
      <path d={path} fill="none" stroke="var(--color-glow)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />

      {/* Now */}
      {nowX !== undefined && (
        <g>
          <line x1={nowX} x2={nowX} y1={PAD_T - 6} y2={H - PAD_B} stroke="var(--color-fg)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <circle cx={nowX} cy={y(nowLtv)} r="4" fill="var(--color-fg)" className="animate-pulse-soft" />
        </g>
      )}
    </svg>
  );
}
