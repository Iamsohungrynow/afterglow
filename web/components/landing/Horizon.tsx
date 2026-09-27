"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";

/** Distance of the horizon line from the bottom of the hero, in px. Shared with the caption band. */
export const HORIZON_OFFSET = 132;

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The brand moment: a luminous horizon with a sun whose height is set by the real market clock.
 * `elevation` is a spring-smoothed value in [-0.45, 1]; `px` (0..1) and `pOn` (0..1) come from the
 * pointer and light up the stretch of horizon under the cursor. Everything here is decorative.
 */
export function Horizon({
  elevation,
  visible,
  px,
  pOn,
}: {
  elevation: MotionValue<number>;
  visible: MotionValue<number>;
  px: MotionValue<number>;
  pOn: MotionValue<number>;
}) {
  const reduce = useReducedMotion();

  // How far the sun can rise above the horizon, measured from the sky's real height.
  const skyRef = useRef<HTMLDivElement>(null);
  const rise = useMotionValue(300);
  useEffect(() => {
    const el = skyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => rise.set(Math.max(140, Math.min(420, e.contentRect.height - 190))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [rise]);

  // Sun disc: rises and pales during the week, sinks, deepens and swells toward the close.
  const sunY = useTransform([elevation, rise], ([e, r]: number[]) => -e * r);
  const sunX = useTransform(px, [0, 1], [-18, 18]);
  const sunScale = useTransform(elevation, [0, 1], [1.12, 0.92]);
  const core = useTransform(elevation, [-0.2, 0.15, 1], ["#e58f4a", "#f4ae68", "#fff0dc"]);
  const rim = useTransform(elevation, [-0.2, 0.15, 1], ["#a85a26", "#d9863f", "#f1c089"]);
  const sunAlpha = useTransform(elevation, [-0.3, 0, 0.5, 1], [0, 1, 0.88, 0.8]);
  const sunOpacity = useTransform([sunAlpha, visible], ([a, v]: number[]) => a * v);
  const coronaBg = useMotionTemplate`radial-gradient(circle closest-side, ${rim} 0%, transparent 100%)`;
  const sunBg = useMotionTemplate`radial-gradient(circle closest-side, ${core} 0%, ${core} 52%, ${rim} 90%, transparent 100%)`;
  const reflect = useTransform([elevation, visible], ([e, v]: number[]) => v * (e < -0.25 ? 0 : e < 0 ? (e + 0.25) * 3.6 : 0.9 - 0.6 * Math.min(1, e)));

  // Golden hour: the sky warms as the sun gets low, and the afterglow is strongest just after the close.
  const skyWarm = useTransform(elevation, [-0.45, -0.1, 0.2, 0.7, 1], [0.14, 0.18, 0.2, 0.08, 0.05]);
  const skyMid = useTransform(skyWarm, (v) => v * 0.45);
  const skyBg = useMotionTemplate`linear-gradient(to bottom, transparent 25%, rgb(233 161 94 / ${skyMid}) 75%, rgb(233 161 94 / ${skyWarm}))`;
  const glowA = useTransform(elevation, [-0.45, 0, 0.6, 1], [0.52, 0.55, 0.3, 0.26]);
  const glowMid = useTransform(glowA, (v) => v * 0.36);
  const belowBg = useMotionTemplate`radial-gradient(48% 60% at 50% 0%, rgb(233 161 94 / ${glowA}), rgb(184 115 58 / ${glowMid}) 44%, transparent 78%)`;

  // Pointer hotspot on the horizon.
  const hotLeft = useTransform(px, (v) => `${v * 100}%`);
  const hotOpacity = useTransform(pOn, [0, 1], [0, 1]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Sky */}
      <div ref={skyRef} className="absolute inset-x-0 top-0" style={{ bottom: HORIZON_OFFSET }}>
        <motion.div className="absolute inset-0" style={{ background: skyBg }} />
        {/* Sun, clipped at the horizon */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div className="absolute bottom-0 left-1/2 lg:left-[52%]" style={{ x: sunX, y: sunY, opacity: sunOpacity }}>
            <motion.div
              className="relative -ml-[80px] mb-[-80px] size-[160px] md:-ml-[105px] md:mb-[-105px] md:size-[210px]"
              style={{ scale: sunScale }}
            >
              {/* Wide halo, then a tight corona, then the disc */}
              <motion.div className="absolute -inset-[140%] rounded-full" style={{ background: coronaBg, opacity: 0.22 }} />
              <motion.div className="absolute -inset-[35%] rounded-full blur-xl" style={{ background: coronaBg, opacity: 0.55 }} />
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: sunBg, boxShadow: "0 0 60px 8px rgb(233 161 94 / 0.25)" }}
              />
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* The sun's reflection under the horizon, strongest at sunset */}
      <motion.div
        className="absolute left-1/2 h-[120px] w-[180px] lg:left-[52%]"
        style={{
          x: sunX,
          top: `calc(100% - ${HORIZON_OFFSET}px)`,
          opacity: reflect,
          marginLeft: -90,
          background: "radial-gradient(50% 100% at 50% 0%, rgb(255 214 170 / 0.55), rgb(233 161 94 / 0.18) 45%, transparent 75%)",
          filter: "blur(6px)",
        }}
      />

      {/* Afterglow below the horizon */}
      <motion.div
        className="absolute left-1/2 h-[46vh] w-[130vw] -translate-x-1/2"
        style={{ top: `calc(100% - ${HORIZON_OFFSET}px)`, background: belowBg }}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2.4, ease: EASE, delay: 0.3 }}
      />

      {/* Horizon line */}
      <motion.div
        className="absolute inset-x-0 h-px origin-center"
        style={{
          bottom: HORIZON_OFFSET,
          background:
            "linear-gradient(90deg, transparent 3%, rgb(233 161 94 / 0.45) 22%, rgb(255 240 222) 55%, rgb(233 161 94 / 0.45) 82%, transparent 97%)",
          boxShadow: "0 0 26px 3px rgb(233 161 94 / 0.5), 0 0 90px 10px rgb(233 161 94 / 0.16)",
        }}
        initial={reduce ? false : { scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: EASE }}
      />

      {/* Pointer hotspot */}
      <motion.div className="absolute" style={{ left: hotLeft, bottom: HORIZON_OFFSET, opacity: hotOpacity }}>
        <div
          className="absolute h-[220px] w-[560px] -translate-x-1/2 translate-y-1/2"
          style={{ bottom: 0, background: "radial-gradient(50% 50% at 50% 50%, rgb(233 161 94 / 0.22), transparent 70%)" }}
        />
        <div
          className="absolute h-[2px] w-[320px] -translate-x-1/2 translate-y-1/2"
          style={{
            bottom: 0,
            background: "linear-gradient(90deg, transparent, rgb(255 244 230), transparent)",
            boxShadow: "0 0 18px 2px rgb(233 161 94 / 0.7)",
          }}
        />
      </motion.div>

      {/* Fade into the page */}
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-transparent to-ink"
        style={{ top: `calc(100% - ${HORIZON_OFFSET / 2}px)` }}
      />
    </div>
  );
}

/** Fade the sun in once the real clock is known (it is undefined during SSR). */
export function useFadeIn(ready: boolean) {
  const reduce = useReducedMotion();
  const v = useMotionValue(0);
  useEffect(() => {
    if (!ready) return;
    if (reduce) v.set(1);
    else {
      const c = animate(v, 1, { duration: 1.6, ease: EASE, delay: 0.5 });
      return () => c.stop();
    }
  }, [ready, reduce, v]);
  return v;
}
