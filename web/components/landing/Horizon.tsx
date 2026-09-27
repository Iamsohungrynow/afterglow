"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * The brand moment: a horizon line with the warm light that lingers after the sun (the market)
 * has gone down. Draws in once on load.
 */
export function Horizon() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute left-1/2 top-[68%] h-[46vh] w-[130vw] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(45% 55% at 50% 0%, rgb(233 161 94 / 0.38), rgb(184 115 58 / 0.14) 42%, transparent 76%)",
        }}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
      />
      <div
        className="absolute inset-x-0 top-0 h-[68%]"
        style={{ background: "linear-gradient(to bottom, transparent 40%, rgb(233 161 94 / 0.05) 88%, rgb(233 161 94 / 0.10))" }}
      />
      <motion.div
        className="absolute left-0 right-0 top-[68%] h-px origin-center"
        style={{
          background:
            "linear-gradient(90deg, transparent 4%, rgb(233 161 94 / 0.5) 22%, rgb(255 240 222) 50%, rgb(233 161 94 / 0.5) 78%, transparent 96%)",
          boxShadow: "0 0 28px 3px rgb(233 161 94 / 0.55), 0 0 90px 10px rgb(233 161 94 / 0.18)",
        }}
        initial={reduce ? false : { scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="absolute inset-x-0 top-[68%] bottom-0 bg-gradient-to-b from-transparent via-transparent to-ink" />
    </div>
  );
}
