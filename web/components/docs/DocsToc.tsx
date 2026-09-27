"use client";

import { useEffect, useState } from "react";

export interface TocItem {
  id: string;
  label: string;
}

/** Tracks which docs section is on screen. */
function useActive(items: TocItem[]) {
  const [active, setActive] = useState(items[0]?.id);
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return active;
}

/** Sticky table of contents on desktop. */
export function DocsToc({ items }: { items: TocItem[] }) {
  const active = useActive(items);
  return (
    <nav aria-label="On this page" className="sticky top-24">
      <p className="text-[12px] text-fg-3">On this page</p>
      <ol className="mt-4 border-l border-line">
        {items.map((i, n) => {
          const on = i.id === active;
          return (
            <li key={i.id}>
              <a
                href={`#${i.id}`}
                aria-current={on ? "location" : undefined}
                className={`-ml-px flex gap-3 border-l py-1.5 pl-4 text-[13px] transition-colors ${
                  on ? "border-glow text-fg" : "border-transparent text-fg-3 hover:text-fg-2"
                }`}
              >
                <span className="num w-4 shrink-0 text-[11px] leading-[20px] text-fg-3">{String(n + 1).padStart(2, "0")}</span>
                {i.label}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Collapsed table of contents for small screens. */
export function DocsTocMobile({ items }: { items: TocItem[] }) {
  return (
    <details className="group rounded-[10px] border border-line bg-ink-2 lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[13.5px] text-fg [&::-webkit-details-marker]:hidden">
        On this page
        <span aria-hidden className="text-fg-3 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <ol className="grid grid-cols-1 gap-px border-t border-line px-2 py-2 sm:grid-cols-2">
        {items.map((i, n) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className="flex gap-3 rounded-[6px] px-2 py-2 text-[13.5px] text-fg-2 hover:bg-white/[0.03] hover:text-fg">
              <span className="num w-4 shrink-0 text-[11px] leading-[20px] text-fg-3">{String(n + 1).padStart(2, "0")}</span>
              {i.label}
            </a>
          </li>
        ))}
      </ol>
    </details>
  );
}
