"use client";

import { useEffect, useRef } from "react";
import { useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useNow } from "@/hooks/useNow";
import { fmtDuration, nextTransition, scheduleSession } from "@/lib/session";
import { MARKETS } from "@/lib/markets";
import { SessionChip } from "@/components/SessionChip";
import { Horizon, HORIZON_OFFSET, useFadeIn } from "./Horizon";
import { MarketClockCard } from "./MarketClockCard";
import { LaunchButton, SourceButton } from "./LaunchButton";
import { sunElevation } from "./sun";

export function Hero() {
  const reduce = useReducedMotion();
  const now = useNow();
  const ref = useRef<HTMLElement>(null);

  // Sun height follows the real market clock; the spring only smooths the one-second ticks.
  const target = useMotionValue(0.9);
  const elevation = useSpring(target, { stiffness: 40, damping: 20 });
  const primed = useRef(false);
  useEffect(() => {
    if (now === undefined) return;
    const e = sunElevation(now);
    target.set(e);
    if (!primed.current || reduce) {
      elevation.jump(e);
      primed.current = true;
    }
  }, [now, reduce, target, elevation]);
  const visible = useFadeIn(now !== undefined);

  // Pointer glow on the horizon: motion values only, never React state.
  const rawX = useMotionValue(0.5);
  const rawOn = useMotionValue(0);
  const px = useSpring(rawX, { stiffness: 120, damping: 26, mass: 0.6 });
  const pOn = useSpring(rawOn, { stiffness: 80, damping: 20 });
  const onMove = (e: React.PointerEvent) => {
    if (reduce || e.pointerType === "touch" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    rawX.set((e.clientX - r.left) / r.width);
    rawOn.set(1);
  };

  return (
    <section
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={() => rawOn.set(0)}
      className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden"
    >
      <Horizon elevation={elevation} visible={visible} px={px} pOn={pOn} />

      <div className="relative mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 items-center gap-10 px-6 pt-24 pb-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-7">
          <h1 className="font-display text-[clamp(30px,8.4vw,44px)] font-medium leading-[1.02] tracking-[-0.01em] text-fg md:text-[clamp(44px,5vw,74px)]">
            Earn yield,
            <br />
            <em className="font-display italic text-glow">even while Wall Street sleeps.</em>
          </h1>
          <p className="mt-6 max-w-[50ch] text-[16px] leading-relaxed text-fg-2 md:text-[17px]">
            Lend USDG against tokenized stocks at a fixed rate and earn every hour, weekends included. Borrowers keep their
            shares. You choose how much weekend risk you take.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <LaunchButton large />
            <SourceButton />
          </div>
        </div>
        <div className="lg:col-span-5">
          <MarketClockCard now={now} />
        </div>
      </div>

      {/* Caption band: its top edge is the horizon line. */}
      <div className="relative mx-auto w-full max-w-[1400px] px-6" style={{ height: HORIZON_OFFSET }}>
        <HorizonCaption now={now} />
      </div>
    </section>
  );
}

function HorizonCaption({ now }: { now: number | undefined }) {
  if (now === undefined) return <div className="h-[22px] pt-5" />;
  const { session } = scheduleSession(now);
  const next = nextTransition(now);
  const weekend = MARKETS.NVDA.risk.weekendLtvBps / 100;
  const label =
    session === "Closed"
      ? "US equities closed. Reopens in"
      : session === "Closing"
        ? `Closing window. Borrow limit easing to ${weekend}%. Close in`
        : "US equities open. Closing window starts in";
  return (
    <div className="flex flex-col gap-2 pt-5 md:flex-row md:items-center md:justify-between">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-2" aria-live="off">
        <SessionChip session={session} />
        <span>
          {label} <span className="num text-fg">{fmtDuration(next.in)}</span>
        </span>
      </p>
      <p className="hidden text-[12px] text-fg-3 md:block">
        The sun follows the real US market clock. It sets at the Friday close.
      </p>
    </div>
  );
}
