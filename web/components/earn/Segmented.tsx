"use client";

/** Small segmented toggle; controls use the 8px radius. */
export function Segmented<T extends string>({ items, value, onChange }: { items: T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-[8px] border border-line bg-ink p-0.5" role="tablist">
      {items.map((it) => (
        <button
          key={it}
          role="tab"
          aria-selected={value === it}
          onClick={() => onChange(it)}
          className={`rounded-[6px] px-3 py-1.5 text-[12.5px] transition ${value === it ? "bg-white/[0.08] text-fg" : "text-fg-3 hover:text-fg-2"}`}
        >
          {it}
        </button>
      ))}
    </div>
  );
}
