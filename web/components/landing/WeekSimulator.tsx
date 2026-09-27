"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import {
  ArrowCounterClockwise,
  HandCoins,
  Pause,
  Play,
  Plus,
  Scales,
  type Icon,
} from "@phosphor-icons/react";
import { useNow } from "@/hooks/useNow";
import { DEFAULT_SCHEDULE, WEEK, intoWeek, maxBorrowLtv, scheduleSession, weekStart, type Session } from "@/lib/session";
import { MARKETS } from "@/lib/markets";
import { SessionChip } from "@/components/SessionChip";
import { WeekClock } from "@/components/WeekClock";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MAX = WEEK - 60;
const risk = MARKETS.NVDA.risk;
const S = DEFAULT_SCHEDULE;
// The schedule is set for US daylight time: New York is UTC minus 4 hours.
const NY_OFFSET = 4 * 3600;
// The limit meter spans 30% to 70% LTV so the three reference levels are readable.
const meterPos = (bps: number) => Math.min(100, Math.max(0, ((bps - 3000) / 4000) * 100));

const PRESETS: { label: string; at: number }[] = [
  { label: "Midweek", at: 2 * 86400 + 15 * 3600 },
  { label: "Closing window", at: S.weeklyCloseOffset - 2 * 3600 },
  { label: "Weekend", at: 5 * 86400 + 12 * 3600 },
  { label: "Reopen", at: 15 * 60 },
];

function clock(offset: number) {
  const o = ((offset % WEEK) + WEEK) % WEEK;
  const d = Math.floor(o / 86400);
  const h = Math.floor((o % 86400) / 3600);
  const m = Math.floor((o % 3600) / 60);
  return { day: DAY_NAMES[d], short: DAY_NAMES[d].slice(0, 3), hm: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` };
}

const PHASE: Record<Session, string> = {
  Live: `Prices are live. Borrow up to ${risk.baseLtvBps / 100}% of your collateral value.`,
  Closing: `The final 4 hours before the weekly close. The borrow limit glides from ${risk.baseLtvBps / 100}% to ${
    risk.weekendLtvBps / 100
  }%, so nobody enters the weekend at the edge.`,
  Closed: "Price feeds are frozen until Sunday 20:00 New York. No new debt and no liquidations. Repay and add collateral any time.",
  Halted: "Trading is halted.",
};

export function WeekSimulator() {
  const reduce = useReducedMotion();
  const now = useNow();
  const [offset, setOffset] = useState<number>();
  const [playing, setPlaying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // Start at the real current time, once the clock is known.
  const nowOffset = now !== undefined ? intoWeek(now) : undefined;
  useEffect(() => {
    if (offset === undefined && nowOffset !== undefined) setOffset(nowOffset);
  }, [offset, nowOffset]);

  const o = offset ?? 2 * 86400 + 15 * 3600;
  const base = now !== undefined ? weekStart(now) : 4 * 86400; // unix 4 days = a Monday 00:00 UTC
  const t = base + o;
  const { session, rampBps } = scheduleSession(t);
  const limit = maxBorrowLtv(session, rampBps, risk.baseLtvBps, risk.weekendLtvBps);
  const utc = clock(o);
  const ny = clock(o - NY_OFFSET);
  const open = session === "Live" || session === "Closing";

  // Big animated number. While closed, keep the spring at the weekend level so reopening animates up.
  const target = useMotionValue(limit || risk.weekendLtvBps);
  const spring = useSpring(target, { stiffness: 160, damping: 26 });
  useEffect(() => {
    const v = limit || risk.weekendLtvBps;
    target.set(v);
    if (reduce) spring.jump(v);
  }, [limit, reduce, target, spring]);
  const limitText = useTransform(spring, (v) => (v / 100).toFixed(2));
  const meterW = useTransform(spring, (v) => `${meterPos(v)}%`);

  // Play: sweep the week in about 7 seconds.
  const oRef = useRef(o);
  oRef.current = o;
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let pos = oRef.current;
    const step = (ts: number) => {
      pos = Math.min(MAX, pos + ((ts - last) / 1000) * (WEEK / 7));
      last = ts;
      setOffset(pos);
      if (pos >= MAX) setPlaying(false);
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const setFromPointer = (clientX: number) => {
    const el = areaRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setOffset(Math.round((f * MAX) / 300) * 300);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const hour = e.shiftKey ? 900 : 3600;
    const map: Record<string, number | "home" | "end"> = {
      ArrowRight: hour,
      ArrowUp: hour,
      ArrowLeft: -hour,
      ArrowDown: -hour,
      PageUp: 86400,
      PageDown: -86400,
      Home: "home",
      End: "end",
    };
    const k = map[e.key];
    if (k === undefined) return;
    e.preventDefault();
    setPlaying(false);
    setOffset((p) => {
      const v = p ?? 0;
      if (k === "home") return 0;
      if (k === "end") return MAX;
      return Math.min(MAX, Math.max(0, v + k));
    });
  };

  const frac = o / MAX;
  const valueText = `${utc.day} ${utc.hm} UTC, ${session}, ${limit ? `borrow limit ${(limit / 100).toFixed(2)}%` : "new borrowing paused"}`;

  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-ink-2 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]">
      {/* Readout */}
      <div className="grid grid-cols-1 gap-px bg-line md:grid-cols-12">
        <div className="bg-ink-2 p-6 md:col-span-7 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <SessionChip session={session} />
            <span className="num text-[13px] text-fg-3">
              {ny.short} {ny.hm} New York
            </span>
          </div>
          <div className="num mt-4 text-[28px] leading-none text-fg md:text-[34px]">
            {utc.day} {utc.hm} <span className="text-fg-3">UTC</span>
          </div>
          <p className="mt-4 max-w-[52ch] text-[14.5px] leading-relaxed text-fg-2">{PHASE[session]}</p>
        </div>
        <div className="bg-ink-2 p-6 md:col-span-5 md:p-8">
          <div className="text-[12px] text-fg-3">NVDA borrow limit at this moment</div>
          <div className="num mt-3 h-[52px] text-[52px] leading-none text-fg">
            {limit ? (
              <>
                <motion.span>{limitText}</motion.span>
                <span className="text-fg-3">%</span>
              </>
            ) : (
              <span className="text-fg-2">Paused</span>
            )}
          </div>
          {/* Limit against the reference levels */}
          <div className="relative mt-6 h-1.5 rounded-full bg-white/[0.06]">
            <motion.div
              className={`absolute inset-y-0 left-0 rounded-full ${limit ? "bg-glow" : "bg-fg-3/40"}`}
              style={{ width: meterW, boxShadow: limit ? "0 0 14px rgb(233 161 94 / 0.5)" : undefined }}
            />
            {[
              { v: risk.weekendLtvBps, l: "weekend" },
              { v: risk.baseLtvBps, l: "weekday" },
              { v: risk.liqLtvBps, l: "liquidation" },
            ].map(({ v, l }) => (
              <div key={l} className="absolute -top-1 h-3.5 w-px bg-fg-3" style={{ left: `${meterPos(v)}%` }}>
                <span className="num absolute top-5 -translate-x-1/2 whitespace-nowrap text-[10.5px] text-fg-3">
                  <span className="hidden xl:inline">{l} </span>
                  {v / 100}%
                </span>
              </div>
            ))}
          </div>
          <div className="h-8" />
          <p className="text-[12px] text-fg-3 xl:hidden">
            Marks: weekend {risk.weekendLtvBps / 100}%, weekday {risk.baseLtvBps / 100}%, liquidation {risk.liqLtvBps / 100}%.
          </p>
        </div>
      </div>

      {/* Scrubber */}
      <div className="border-t border-line px-3 pt-6 md:px-5">
        <input
          ref={inputRef}
          type="range"
          min={0}
          max={MAX}
          step={900}
          value={Math.round(o)}
          onChange={(e) => setOffset(Number(e.target.value))}
          onKeyDown={onKeyDown}
          aria-label="Time in the trading week"
          aria-valuetext={valueText}
          className="peer sr-only"
        />
        <div
          ref={areaRef}
          className="relative cursor-ew-resize select-none rounded-[8px] outline-offset-2 peer-focus-visible:outline-2 peer-focus-visible:outline-glow"
          style={{ touchAction: "pan-y" }}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            dragging.current = true;
            setPlaying(false);
            e.currentTarget.setPointerCapture(e.pointerId);
            setFromPointer(e.clientX);
            inputRef.current?.focus({ preventScroll: true });
          }}
          onPointerMove={(e) => dragging.current && setFromPointer(e.clientX)}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          {/* Track and thumb */}
          <div className="relative h-10">
            <div className="absolute inset-x-0 top-[30px] h-px bg-line-strong" />
            <div className="absolute left-0 top-[30px] h-px bg-glow/70" style={{ width: `${frac * 100}%` }} />
            <div className="absolute top-0" style={{ left: `${frac * 100}%` }}>
              <div
                className="num absolute top-0 whitespace-nowrap rounded-full border border-line-strong bg-ink-3 px-2 py-0.5 text-[11px] text-fg"
                style={{ transform: `translateX(-${frac * 100}%)` }}
              >
                {utc.short} {utc.hm}
              </div>
              <div className="absolute top-[24px] size-3 -translate-x-1/2 rounded-full border-2 border-ink bg-fg shadow-[0_0_0_4px_rgb(233_161_94/0.25),0_0_16px_rgb(233_161_94/0.6)]" />
            </div>
          </div>
          <div aria-hidden>
            <WeekClock now={t} risk={risk} hover={false} />
          </div>
        </div>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap items-center gap-2 px-5 pb-5 pt-1 md:px-6">
        {!reduce && (
          <button
            type="button"
            onClick={() => {
              if (!playing && o >= MAX - 600) setOffset(0);
              setPlaying((p) => !p);
            }}
            className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[6px] bg-fg px-3 text-[12.5px] font-medium text-ink transition hover:bg-white active:translate-y-px"
          >
            {playing ? <Pause size={13} weight="fill" /> : <Play size={13} weight="fill" />}
            {playing ? "Pause" : "Play the week"}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            if (nowOffset !== undefined) setOffset(nowOffset);
          }}
          className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[6px] border border-line-strong px-3 text-[12.5px] text-fg transition hover:border-fg-3 active:translate-y-px"
        >
          <ArrowCounterClockwise size={13} />
          Now
        </button>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => {
              setPlaying(false);
              setOffset(p.at);
            }}
            className="inline-flex h-8 items-center whitespace-nowrap rounded-[6px] border border-line px-3 text-[12.5px] text-fg-2 transition hover:border-line-strong hover:text-fg active:translate-y-px"
          >
            {p.label}
          </button>
        ))}
        <span className="ml-auto hidden text-[12px] text-fg-3 lg:inline">Drag the chart or use the arrow keys. Shift for 15 minutes.</span>
      </div>

      {/* What you can do right now */}
      <div className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
        <Action
          icon={HandCoins}
          name="Borrow"
          on={open}
          state={
            session === "Live"
              ? `Up to ${(limit / 100).toFixed(0)}%`
              : session === "Closing"
                ? `Up to ${(limit / 100).toFixed(2)}%, easing`
                : "Paused for the weekend"
          }
        />
        <Action icon={ArrowCounterClockwise} name="Repay" on state="Always open" />
        <Action icon={Plus} name="Add collateral" on state="Always open" />
        <Action
          icon={Scales}
          name="Liquidations"
          on={open}
          state={open ? `Above ${risk.liqLtvBps / 100}% LTV` : "Paused until a real price"}
        />
      </div>
    </div>
  );
}

function Action({ icon: I, name, on, state }: { icon: Icon; name: string; on: boolean; state: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative bg-ink-2 p-5 md:p-6">
      <div
        className={`absolute inset-x-0 top-0 h-px transition-opacity duration-500 ${on ? "opacity-100" : "opacity-0"}`}
        style={{ background: "linear-gradient(90deg, transparent, rgb(233 161 94 / 0.8), transparent)" }}
      />
      <motion.div animate={{ opacity: on ? 1 : 0.45 }} transition={{ duration: reduce ? 0 : 0.35 }}>
        <div className="flex items-center gap-2.5">
          <span
            className={`inline-flex size-8 shrink-0 items-center justify-center rounded-[8px] border transition-colors duration-300 ${
              on ? "border-glow/30 bg-glow/10 text-glow" : "border-line-strong bg-white/[0.02] text-fg-3"
            }`}
          >
            <I size={16} weight={on ? "fill" : "regular"} />
          </span>
          <span className="text-[14.5px] text-fg">{name}</span>
        </div>
        <div className={`mt-3 text-[13px] ${on ? "text-fg-2" : "text-fg-3"}`}>{state}</div>
      </motion.div>
    </div>
  );
}
