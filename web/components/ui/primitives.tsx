/**
 * Shared UI primitives for the app routes. Shape rule: cards 14px radius, controls 8px,
 * chips and pills fully rounded. One accent (glow). Numbers always use `.num`.
 */
import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  pill,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  pill?: { label: string; value: React.ReactNode };
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-[30px] font-medium tracking-[-0.02em] text-fg md:text-[36px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-[60ch] text-[14px] text-fg-2">{subtitle}</p>}
      </div>
      {pill && (
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-line-strong bg-ink-2 px-3.5 py-1.5 text-[12.5px] md:self-auto">
          <span className="text-fg-3">{pill.label}</span>
          <span className="num text-fg">{pill.value}</span>
        </div>
      )}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[14px] border border-line bg-ink-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)] ${className}`}>
      {children}
    </div>
  );
}

/** Large number with the unit dimmed, Morpho-style: "$1.48" + "B". */
export function BigStat({ label, value, unit, sub }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] text-fg-3">{label}</div>
      <div className="num mt-2 text-[28px] leading-none text-fg md:text-[32px]">
        {value}
        {unit && <span className="text-fg-3">{unit}</span>}
      </div>
      {sub && <div className="num mt-2 text-[12px] text-fg-3">{sub}</div>}
    </div>
  );
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "glow" | "live" | "halt" }) {
  const t = {
    neutral: "border-line-strong text-fg-2 bg-white/[0.03]",
    glow: "border-glow/30 text-glow bg-glow/10",
    live: "border-live/30 text-live bg-live/10",
    halt: "border-halt/30 text-halt bg-halt/10",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${t}`}>{children}</span>;
}

/** Circular monogram for a token (no third-party logos). */
export function TokenMark({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const isStable = symbol === "USDG";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full border font-semibold ${
        isStable ? "border-glow/40 bg-glow/10 text-glow" : "border-line-strong bg-ink-3 text-fg-2"
      }`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {symbol.slice(0, isStable ? 1 : 2)}
    </span>
  );
}

/** Two-part value used in tables: primary amount plus a small secondary pill. */
export function AmountCell({ main, sub }: { main: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="num">
      <div className="text-[13px] text-fg">{main}</div>
      {sub !== undefined && (
        <span className="mt-1 inline-block rounded-[6px] bg-white/[0.05] px-1.5 py-0.5 text-[10.5px] text-fg-3">{sub}</span>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ items, value, onChange }: { items: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-6 border-b border-line">
      {items.map((t) => (
        <button key={t} onClick={() => onChange(t)} className={`relative h-10 text-[13px] ${value === t ? "text-fg" : "text-fg-3 hover:text-fg-2"}`}>
          {t}
          {value === t && <span className="absolute inset-x-0 bottom-0 h-px bg-glow" />}
        </button>
      ))}
    </div>
  );
}

export function Skel({ w = 56, h = 14 }: { w?: number; h?: number }) {
  return <span className="inline-block animate-pulse rounded-[4px] bg-white/[0.06] align-middle" style={{ width: w, height: h }} />;
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[12.5px] text-fg-3 transition-colors hover:text-fg-2">
      ← {children}
    </Link>
  );
}
