"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ShieldCheck, TrendUp } from "@phosphor-icons/react";
import { POOL_APR, TARGET as TARGET_PCT } from "./example";

// Sample vault. Boost must be at least 20% of the vault; here it is 25%.
const BOOST = 25_000;
const PROTECTED = 75_000;
const TOTAL = BOOST + PROTECTED;
const MAX_LOSS = 40_000;
const RATE = POOL_APR / 100; // base rate plus the weekend premium
const TARGET = TARGET_PCT / 100;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const SPRING = { type: "spring", stiffness: 260, damping: 32 } as const;
const INSTANT = { duration: 0 } as const;

export function Waterfall() {
  const [loss, setLoss] = useState(12_000);
  const spring = useReducedMotion() ? INSTANT : SPRING;
  const areaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  const boostLoss = Math.min(loss, BOOST);
  const protLoss = Math.max(0, loss - BOOST);
  const boostLeft = BOOST - boostLoss;
  const protLeft = PROTECTED - protLoss;
  const lossPct = (loss / TOTAL) * 100;

  const boostLabel = loss === 0 ? "Boost untouched" : boostLeft > 0 ? "Boost absorbs" : "Boost wiped out";
  const protLabel = protLoss > 0 ? "Protected impaired" : "Protected untouched";

  // Yield side of the same example: whole vault lent (base rate plus weekend premium), Protected paid its target first.
  const boostYield = (TOTAL * RATE - PROTECTED * TARGET) / BOOST;

  const setFromPointer = (clientX: number) => {
    const el = areaRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setLoss(Math.round((f * MAX_LOSS) / 500) * 500);
  };

  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-line bg-line md:grid-cols-12">
      {/* Controls and numbers */}
      <div className="bg-ink-2 p-6 md:col-span-7 md:p-8">
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="gap-loss" className="text-[14px] text-fg">
            Monday gap loss
          </label>
          <span className="num text-[13px] text-fg-3">{lossPct.toFixed(1)}% of the vault</span>
        </div>
        <div className="num mt-3 text-[44px] leading-none text-fg md:text-[52px]">
          {fmt(loss)} <span className="text-[0.45em] text-fg-3">USDG</span>
        </div>

        <input
          ref={inputRef}
          id="gap-loss"
          type="range"
          min={0}
          max={MAX_LOSS}
          step={500}
          value={loss}
          onChange={(e) => setLoss(Number(e.target.value))}
          aria-valuetext={`${fmt(loss)} USDG loss. ${boostLabel}, ${protLabel}.`}
          className="peer sr-only"
        />
        <div
          ref={areaRef}
          className="relative mt-7 h-10 cursor-ew-resize select-none rounded-[6px] outline-offset-4 peer-focus-visible:outline-2 peer-focus-visible:outline-glow"
          style={{ touchAction: "pan-y" }}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setFromPointer(e.clientX);
            inputRef.current?.focus({ preventScroll: true });
          }}
          onPointerMove={(e) => dragging.current && setFromPointer(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/[0.07]" />
          {/* Where Boost runs out */}
          <div className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-fg-3" style={{ left: `${(BOOST / MAX_LOSS) * 100}%` }} />
          <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-glow" style={{ width: `${(loss / MAX_LOSS) * 100}%` }} />
          <div
            className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-fg shadow-[0_0_0_4px_rgb(233_161_94/0.25),0_0_16px_rgb(233_161_94/0.6)]"
            style={{ left: `${(loss / MAX_LOSS) * 100}%` }}
          />
        </div>
        <div className="num mt-1 flex justify-between text-[11px] text-fg-3">
          <span>0</span>
          <span>Boost gone at {fmt(BOOST)}</span>
          <span>{fmt(MAX_LOSS)}</span>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2">
          <Tranche
            icon={TrendUp}
            name="Boost"
            label={boostLabel}
            left={boostLeft}
            size={BOOST}
            hot={loss > 0}
          />
          <Tranche icon={ShieldCheck} name="Protected" label={protLabel} left={protLeft} size={PROTECTED} hot={protLoss > 0} />
        </div>

        <p className="mt-6 text-[13px] leading-relaxed text-fg-3">
          Example vault of {fmt(TOTAL)} USDG, {fmt(BOOST)} in Boost earning{" "}
          <span className="num text-fg-2">{(boostYield * 100).toFixed(0)}%</span> before losses.
        </p>
      </div>

      {/* The stack */}
      <div className="relative bg-ink-2 p-6 md:col-span-5 md:p-8">
        <div className="flex h-[340px] gap-5 md:h-full md:min-h-[420px]">
          <div className="relative flex w-[46%] max-w-[180px] flex-col overflow-hidden rounded-[10px] border border-line-strong">
            {/* Loss eats from the top */}
            <motion.div
              className="relative shrink-0 overflow-hidden"
              style={{
                background:
                  "repeating-linear-gradient(135deg, rgb(255 255 255 / 0.05) 0 2px, transparent 2px 8px)",
              }}
              animate={{ height: `${lossPct}%` }}
              transition={spring}
            />
            <motion.div
              className="relative shrink-0"
              style={{
                background: "linear-gradient(180deg, rgb(243 184 120), rgb(233 161 94) 40%, rgb(184 115 58))",
                boxShadow: boostLeft > 0 ? "0 -1px 24px rgb(233 161 94 / 0.5)" : "none",
              }}
              animate={{ height: `${(boostLeft / TOTAL) * 100}%` }}
              transition={spring}
            />
            <motion.div
              className="relative flex-1 border-t border-ink"
              style={{ background: "linear-gradient(180deg, rgb(236 235 232 / 0.2), rgb(236 235 232 / 0.08))" }}
              animate={{ opacity: protLoss > 0 ? 0.75 : 1 }}
            />
          </div>

          {/* Labels beside the stack */}
          <div className="relative flex flex-1 flex-col text-[12.5px]">
            <motion.div className="shrink-0 overflow-hidden" animate={{ height: `${lossPct}%` }} transition={spring}>
              {loss > 0 && (
                <div className="pt-1">
                  <div className="text-fg-3">Loss</div>
                  <div className="num text-fg-2">{fmt(loss)}</div>
                </div>
              )}
            </motion.div>
            <motion.div className="shrink-0 overflow-hidden" animate={{ height: `${(boostLeft / TOTAL) * 100}%` }} transition={spring}>
              <div className="pt-1">
                <div className="text-glow">Boost</div>
                <div className="num text-fg-2">{fmt(boostLeft)}</div>
              </div>
            </motion.div>
            <div className="flex-1 pt-1">
              <div className="text-fg">Protected</div>
              <div className="num text-fg-2">{fmt(protLeft)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tranche({
  icon: I,
  name,
  label,
  left,
  size,
  hot,
}: {
  icon: typeof ShieldCheck;
  name: string;
  label: string;
  left: number;
  size: number;
  hot: boolean;
}) {
  const pct = (left / size) * 100;
  const spring = useReducedMotion() ? INSTANT : SPRING;
  return (
    <div className="bg-ink-2 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[14px] text-fg">
          <I size={16} className={name === "Boost" ? "text-glow" : "text-fg-2"} />
          {name}
        </span>
        <span className={`whitespace-nowrap text-[12px] ${hot ? (name === "Boost" ? "text-glow" : "text-fg") : "text-fg-3"}`}>{label}</span>
      </div>
      <div className="num mt-3 text-[22px] leading-none text-fg">
        {fmt(left)}
        <span className="text-fg-3"> / {fmt(size)}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className={`h-full rounded-full ${name === "Boost" ? "bg-glow" : "bg-fg-2"}`}
          animate={{ width: `${pct}%` }}
          transition={spring}
        />
      </div>
      <div className="num mt-2 text-[11.5px] text-fg-3">{pct.toFixed(1)}% of principal left</div>
    </div>
  );
}
