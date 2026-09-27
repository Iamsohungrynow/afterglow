"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";

/** Counts from zero up to `to` the first time it scrolls into view. */
export function CountUp({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 2.2,
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [v, setV] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setV(to);
      return;
    }
    const controls = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setV });
    return () => controls.stop();
  }, [inView, reduce, to, duration]);

  const text = `${prefix}${v.toFixed(decimals)}${suffix}`;
  return (
    <span ref={ref}>
      <span className="sr-only">{`${prefix}${to.toFixed(decimals)}${suffix}`}</span>
      <span aria-hidden>{text}</span>
    </span>
  );
}
