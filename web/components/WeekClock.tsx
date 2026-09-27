"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SCHEDULE, WEEK, intoWeek, maxBorrowLtv, scheduleSession } from "@/lib/session";
import type { RiskParams } from "@/lib/markets";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONDAY = 4 * 86400; // unix 4 days = Monday 00:00 UTC
const MONO = "var(--font-mono)";
const AXIS = "rgb(255 255 255 / 0.28)";

const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
const hhmm = (sec: number) => {
  const d = Math.floor(sec / 86400) % 7;
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${DAYS[d]} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/**
 * The trading week as Phaselock sees it (UTC): the borrow limit over time, the pre-close ramp, the
 * weekend lock, the liquidation zone and where "now" sits. Drawn from the same schedule the
 * contract enforces, as a proper chart: labelled axes, a faint grid, tinted zones, dashed markers.
 */
export function WeekClock({
  now,
  risk,
  weekendLtvBps,
  compact = false,
  hover = !compact,
}: {
  now: number | undefined;
  risk: RiskParams;
  weekendLtvBps?: number;
  compact?: boolean;
  /** Crosshair with a time and limit readout under the pointer. */
  hover?: boolean;
}) {
  // Draw at the element's real pixel width so text and strokes are never stretched.
  const ref = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(1000);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.max(320, Math.round(el.getBoundingClientRect().width))); // before first paint, no stretched frame
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [hoverSec, setHoverSec] = useState<number>();
  // Several charts share a page: ids must be unique or one chart clips to another's size.
  const uid = useId().replace(/:/g, "");
  const hatchId = `wc-hatch-${uid}`;
  const clipId = `wc-plot-${uid}`;

  const H = compact ? 160 : 240;
  const PAD_L = compact ? 30 : 40;
  const PAD_R = compact ? 6 : 10;
  const PAD_T = compact ? 10 : 30;
  const PAD_B = 22;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const weekend = weekendLtvBps ?? risk.weekendLtvBps;
  const s = DEFAULT_SCHEDULE;

  // Y from 0 to the first 20% step above the liquidation line, so the liquidation zone has room.
  const yMax = Math.ceil((risk.liqLtvBps + 500) / 2000) * 2000;
  const ticks = Array.from({ length: yMax / 2000 + 1 }, (_, i) => i * 2000).filter((t) => !compact || t % 4000 === 0);
  const x = (sec: number) => PAD_L + (sec / WEEK) * plotW;
  const y = (bps: number) => PAD_T + plotH - (bps / yMax) * plotH;
  const limitAt = (sec: number) => {
    const st = scheduleSession(MONDAY + sec, s);
    return maxBorrowLtv(st.session, st.rampBps, risk.baseLtvBps, weekend);
  };

  // Borrow-limit path, sampled every 10 minutes across the week.
  const path = useMemo(() => {
    const pts: string[] = [];
    for (let t = 0; t <= WEEK; t += 600) pts.push(`${pts.length ? "L" : "M"}${x(t).toFixed(1)},${y(limitAt(t)).toFixed(1)}`);
    return pts.join(" ");
  }, [risk.baseLtvBps, weekend, W, H, yMax]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeX = x(s.weeklyCloseOffset);
  const openX = x((s.weeklyCloseOffset + s.weekendLength) % WEEK || WEEK);
  const rampX = x(s.weeklyCloseOffset - s.closingWindow);
  const base = y(0);
  const nowSec = now !== undefined ? intoWeek(now) : undefined;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!hover || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px < PAD_L || px > W - PAD_R) return setHoverSec(undefined);
    setHoverSec(Math.round((((px - PAD_L) / plotW) * WEEK) / 900) * 900);
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className={`${compact ? "h-[160px]" : "h-[240px]"} w-full select-none`}
      role="img"
      aria-label={`Borrow limit across the trading week: ${pct(risk.baseLtvBps)} on weekdays, easing to ${pct(weekend)} before the Friday close, paused over the weekend; liquidation at ${pct(risk.liqLtvBps)}.`}
      onPointerMove={onMove}
      onPointerLeave={() => setHoverSec(undefined)}
    >
      <defs>
        <pattern id={hatchId} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke="rgb(255 255 255 / 0.045)" strokeWidth="2" />
        </pattern>
        <clipPath id={clipId}>
          <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} />
        </clipPath>
      </defs>

      {/* Grid */}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
          <text x={PAD_L - 7} y={y(t) + 3.5} textAnchor="end" fill="var(--color-fg-3)" fontSize="10.5" fontFamily={MONO}>
            {t / 100}%
          </text>
        </g>
      ))}
      {DAYS.map((d, i) => (
        <g key={d}>
          {i > 0 && <line x1={x(i * 86400)} x2={x(i * 86400)} y1={PAD_T} y2={base} stroke="var(--color-line)" />}
          <text x={x(i * 86400 + 43200)} y={H - 6} textAnchor="middle" fill="var(--color-fg-3)" fontSize="10.5" fontFamily={MONO}>
            {d}
          </text>
        </g>
      ))}

      <g clipPath={`url(#${clipId})`}>
        {/* Liquidation zone: the loss side of the chart */}
        <rect x={PAD_L} y={PAD_T} width={plotW} height={y(risk.liqLtvBps) - PAD_T} fill="var(--color-halt)" fillOpacity="0.07" />
        {/* Weekend lock */}
        <rect x={closeX} y={PAD_T} width={openX - closeX} height={plotH} fill={`url(#${hatchId})`} />
        <rect x={closeX} y={PAD_T} width={openX - closeX} height={plotH} fill="var(--color-ink)" fillOpacity="0.35" />
        {/* What can be borrowed: flat tint under the limit */}
        <path d={`${path} L${x(WEEK)},${base} L${PAD_L},${base} Z`} fill="var(--color-glow)" fillOpacity="0.085" />
      </g>

      {/* Reference levels */}
      <line x1={PAD_L} x2={W - PAD_R} y1={y(risk.liqLtvBps)} y2={y(risk.liqLtvBps)} stroke="var(--color-halt)" strokeOpacity="0.7" strokeDasharray="4 4" />
      <line x1={PAD_L} x2={W - PAD_R} y1={y(weekend)} y2={y(weekend)} stroke="var(--color-glow)" strokeOpacity="0.7" strokeDasharray="4 4" />

      {/* Session markers: the ramp starts, then the close */}
      <line x1={rampX} x2={rampX} y1={PAD_T} y2={base} stroke="var(--color-glow)" strokeOpacity="0.75" strokeDasharray="3 3" />
      <line x1={closeX} x2={closeX} y1={PAD_T} y2={base} stroke="var(--color-halt)" strokeOpacity="0.75" strokeDasharray="3 3" />

      {/* Axes */}
      <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={base} stroke={AXIS} />
      <line x1={PAD_L} x2={W - PAD_R} y1={base} y2={base} stroke={AXIS} />

      {/* Borrow limit */}
      <path d={path} fill="none" stroke="var(--color-fg)" strokeWidth="1.8" strokeLinejoin="round" />

      {!compact && (
        <>
          <Pill x={W - PAD_R - 4} y={y(risk.liqLtvBps)} anchor="end" color="var(--color-halt)" text={`liquidation ${pct(risk.liqLtvBps)}`} />
          <Pill x={W - PAD_R - 4} y={y(weekend)} anchor="end" color="var(--color-glow)" text={`weekend ${pct(weekend)}`} />
          <Pill x={x(2.5 * 86400)} y={y(risk.baseLtvBps)} anchor="middle" color="var(--color-fg)" text={`weekday ${pct(risk.baseLtvBps)}`} />
          <text x={rampX - 5} y={PAD_T + 13} textAnchor="end" fill="var(--color-glow)" fontSize="10" fontFamily={MONO}>
            ramp
          </text>
          <text x={closeX + 5} y={PAD_T + 13} fill="var(--color-halt)" fontSize="10" fontFamily={MONO}>
            close
          </text>
          <text x={(closeX + openX) / 2} y={y(yMax * 0.3)} textAnchor="middle" fill="var(--color-fg-3)" fontSize="11" fontFamily={MONO}>
            closed · no new debt
          </text>
        </>
      )}

      {/* Now */}
      {nowSec !== undefined && <Marker x={x(nowSec)} y={y(limitAt(nowSec))} top={PAD_T} base={base} label={compact ? undefined : `now · ${limitAt(nowSec) ? pct(limitAt(nowSec)) : "paused"}`} solid />}

      {/* Crosshair */}
      {hoverSec !== undefined && (
        <Marker x={x(hoverSec)} y={y(limitAt(hoverSec))} top={PAD_T} base={base} label={`${hhmm(hoverSec)} · ${limitAt(hoverSec) ? pct(limitAt(hoverSec)) : "paused"}`} />
      )}
    </svg>
  );
}

/** A small label on the chart's ink background, like a price tag. */
function Pill({ x, y, text, color, anchor }: { x: number; y: number; text: string; color: string; anchor: "start" | "middle" | "end" }) {
  const w = text.length * 6.3 + 12;
  const left = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
  return (
    <g>
      <rect x={left} y={y - 9} width={w} height={18} rx={4} fill="var(--color-ink-2)" stroke={color} strokeOpacity="0.45" />
      <text x={left + w / 2} y={y + 3.5} textAnchor="middle" fill={color} fontSize="10.5" fontFamily={MONO}>
        {text}
      </text>
    </g>
  );
}

/** Vertical marker from the top of the plot to the axis, with a dot on the limit line and a tag. */
function Marker({ x, y, top, base, label, solid = false }: { x: number; y: number; top: number; base: number; label?: string; solid?: boolean }) {
  const w = label ? label.length * 6.3 + 14 : 0;
  return (
    <g pointerEvents="none">
      <line x1={x} x2={x} y1={top} y2={base} stroke="var(--color-fg)" strokeOpacity={solid ? 0.85 : 0.5} strokeDasharray={solid ? undefined : "2 3"} />
      <circle cx={x} cy={y} r={solid ? 4.5 : 3.5} fill="var(--color-ink)" stroke="var(--color-fg)" strokeWidth="1.8" className={solid ? "animate-pulse-soft" : undefined} />
      {label && (
        <g>
          <rect x={x - w / 2} y={top - 24} width={w} height={18} rx={9} fill="var(--color-fg)" />
          <text x={x} y={top - 11.5} textAnchor="middle" fill="var(--color-ink)" fontSize="10.5" fontWeight="600" fontFamily={MONO}>
            {label}
          </text>
        </g>
      )}
    </g>
  );
}
