"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Horizontal scroller for wide docs tables. On narrow screens a soft fade on the right edge hints
 * that there is more to the right; it disappears once the reader has scrolled to the end.
 */
export function ScrollX({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div ref={ref} className="overflow-x-auto overscroll-x-contain">
        {children}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-ink to-transparent transition-opacity duration-300 ${
          more ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
