"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { gapModel } from "@/lib/markets";

const MONO = "var(--font-mono)";
const AXIS = "rgb(255 255 255 / 0.28)";
const signed = (bps: number) => `${bps > 0 ? "+" : bps < 0 ? "−" : ""}${Math.abs(bps / 100).toFixed(2)}%`;

/**
 * Weekend gaps (Friday's last print to the first print after the reopen), oldest to newest, from
 * real Chainlink history. Green opened higher, red opened lower; dashed lines mark GapGuard's
 * measured sigma, the typical weekend jump that sets the weekend limit and the premium.
 */
export function GapBars({ gaps, height = 96 }: { gaps: number[]; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [hover, setHover] = useState<number>();
  const clipId = `gb-plot-${useId().replace(/:/g, "")}`;

  const small = height < 140;
  const H = height;
  const PAD_L = 44;
  const PAD_R = small ? 4 : 8;
  const PAD_T = small ? 6 : 24;
  const PAD_B = small ? 6 : 20;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const sigma = gapModel(gaps, 6500).sigma;
  const peak = Math.max(sigma, ...gaps.map((g) => Math.abs(g)));
  const step = peak > 150 ? 100 : 50; // bps between ticks
  const yMax = Math.max(step, Math.ceil((peak * 1.08) / step) * step);
  const ticks = [-yMax, -yMax / 2, 0, yMax / 2, yMax];
  const y = (bps: number) => PAD_T + plotH / 2 - (bps / yMax) * (plotH / 2);
  const slot = plotW / gaps.length;
  const barW = Math.min(28, slot * 0.58);
  const cx = (i: number) => PAD_L + slot * (i + 0.5);
  const zero = y(0);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor((px - PAD_L) / slot);
    setHover(i >= 0 && i < gaps.length ? i : undefined);
  };

  const biggest = gaps.reduce((a, g) => (Math.abs(g) > Math.abs(a) ? g : a), 0);
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full select-none"
      style={{ height: H }}
      role="img"
      aria-label={`Last ${gaps.length} weekend gaps. Typical jump ${signed(sigma).slice(1)}, largest ${signed(biggest)}.`}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(undefined)}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} />
        </clipPath>
      </defs>

      {/* Grid and % axis */}
      {ticks.map((t) => (
        <g key={t}>
          {t !== 0 && <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />}
          <text x={PAD_L - 7} y={y(t) + 3.5} textAnchor="end" fill="var(--color-fg-3)" fontSize="10.5" fontFamily={MONO}>
            {t === 0 ? "0%" : signed(t)}
          </text>
        </g>
      ))}

      {/* The typical jump GapGuard measured */}
      <g clipPath={`url(#${clipId})`}>
        <rect x={PAD_L} y={y(sigma)} width={plotW} height={y(-sigma) - y(sigma)} fill="var(--color-glow)" fillOpacity="0.05" />
      </g>
      {[sigma, -sigma].map((v) => (
        <line key={v} x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--color-glow)" strokeOpacity="0.7" strokeDasharray="4 4" />
      ))}

      {/* Bars */}
      {gaps.map((g, i) => {
        const up = g >= 0;
        const top = up ? y(g) : zero;
        const h = Math.max(1.5, Math.abs(y(g) - zero));
        const on = hover === i;
        return (
          <rect
            key={i}
            x={cx(i) - barW / 2}
            y={top}
            width={barW}
            height={h}
            rx={Math.min(3, barW / 4)}
            fill={up ? "var(--color-live)" : "var(--color-halt)"}
            fillOpacity={hover === undefined ? 0.8 : on ? 1 : 0.35}
          />
        );
      })}

      {/* Axes */}
      <line x1={PAD_L} x2={PAD_L} y1={PAD_T} y2={H - PAD_B} stroke={AXIS} />
      <line x1={PAD_L} x2={W - PAD_R} y1={zero} y2={zero} stroke={AXIS} />

      {!small && (
        <>
          <Tag x={W - PAD_R - 4} y={y(sigma)} text={`σ ${signed(sigma).slice(1)}`} />
          <text x={cx(0)} y={H - 5} textAnchor="middle" fill="var(--color-fg-3)" fontSize="10.5" fontFamily={MONO}>
            {gaps.length}w ago
          </text>
          <text x={cx(gaps.length - 1)} y={H - 5} textAnchor="middle" fill="var(--color-fg-3)" fontSize="10.5" fontFamily={MONO}>
            last
          </text>
        </>
      )}

      {hover !== undefined && (
        <HoverTag
          x={cx(hover)}
          top={PAD_T}
          small={small}
          text={`${gaps.length - hover === 1 ? "last weekend" : `${gaps.length - hover}w ago`} · ${signed(gaps[hover])}`}
          up={gaps[hover] >= 0}
          W={W}
        />
      )}
    </svg>
  );
}

function Tag({ x, y, text }: { x: number; y: number; text: string }) {
  const w = text.length * 6.3 + 12;
  return (
    <g>
      <rect x={x - w} y={y - 9} width={w} height={18} rx={4} fill="var(--color-ink-2)" stroke="var(--color-glow)" strokeOpacity="0.45" />
      <text x={x - w / 2} y={y + 3.5} textAnchor="middle" fill="var(--color-glow)" fontSize="10.5" fontFamily={MONO}>
        {text}
      </text>
    </g>
  );
}

function HoverTag({ x, top, text, up, small, W }: { x: number; top: number; text: string; up: boolean; small: boolean; W: number }) {
  const w = text.length * 6.3 + 14;
  const left = Math.min(Math.max(x - w / 2, 2), W - w - 2);
  const ty = small ? top : top - 22;
  return (
    <g pointerEvents="none">
      <rect x={left} y={ty} width={w} height={18} rx={9} fill="var(--color-fg)" />
      <text x={left + w / 2} y={ty + 12.5} textAnchor="middle" fill={up ? "#1d6b50" : "#9b2c30"} fontSize="10.5" fontWeight="600" fontFamily={MONO}>
        {text}
      </text>
    </g>
  );
}
