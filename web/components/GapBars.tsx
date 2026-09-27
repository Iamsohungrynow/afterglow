"use client";

/** Weekend gaps (bps) as bars around zero, oldest to newest. Real Chainlink history. */
export function GapBars({ gaps, height = 96 }: { gaps: number[]; height?: number }) {
  const max = Math.max(150, ...gaps.map((g) => Math.abs(g)));
  const w = 100 / gaps.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Weekend gaps">
      <line x1="0" x2="100" y1={height / 2} y2={height / 2} stroke="var(--color-line-strong)" vectorEffect="non-scaling-stroke" />
      {gaps.map((g, i) => {
        const h = (Math.abs(g) / max) * (height / 2 - 4);
        const up = g >= 0;
        return (
          <rect
            key={i}
            x={i * w + w * 0.22}
            width={w * 0.56}
            y={up ? height / 2 - h : height / 2}
            height={Math.max(h, 0.8)}
            fill={up ? "var(--color-glow)" : "var(--color-fg-2)"}
            opacity={0.35 + (0.65 * (i + 1)) / gaps.length}
          >
            <title>{`${g > 0 ? "+" : ""}${(g / 100).toFixed(2)}%`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
