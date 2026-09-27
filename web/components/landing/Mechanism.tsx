"use client";

import { useState } from "react";
import Link from "next/link";
import { MARKETS, gapModel } from "@/lib/markets";
import type { Session } from "@/lib/session";
import { GapBars } from "@/components/GapBars";
import { SessionChip } from "@/components/SessionChip";
import { Reveal } from "./Reveal";
import { BASE, PREMIUM_BP } from "./example";

// Worked example: 10,000 USDG for 28 days at the 6% base rate is 10,046.03 due (the weekend premium is kept upfront).
const P = 10_000;
const R = BASE / 100;
const TERM = 28;
const owed = (d: number) => P * (1 + (R * d) / 365);
const usd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Mechanism() {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-line bg-line lg:grid-cols-12">
      <Reveal className="bg-ink-2 lg:col-span-7 lg:row-span-2">
        <FixedRate />
      </Reveal>
      <Reveal className="bg-ink-2 lg:col-span-5" delay={0.06}>
        <GapGuardCell />
      </Reveal>
      <Reveal className="bg-ink lg:col-span-5" delay={0.12}>
        <PhaselockCell />
      </Reveal>
    </div>
  );
}

function FixedRate() {
  const [day, setDay] = useState(TERM);
  const interest = owed(day) - P;
  const W = 600;
  const H = 120;
  const xd = (d: number) => (d / TERM) * W;
  const yd = (d: number) => H - 8 - ((owed(d) - P) / (owed(TERM) - P)) * (H - 24);

  return (
    <div className="flex h-full flex-col p-6 md:p-10">
      <h3 className="text-[26px] font-medium tracking-[-0.02em] text-fg md:text-[30px]">A fixed rate to a fixed date</h3>
      <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-fg-2">
        Know what you owe from day one. Repaying early costs only the days used.
      </p>

      <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12px] text-fg-3">You owe</div>
          <div className="num mt-2 text-[30px] text-fg md:text-[36px]">
            P × (1 + r × t)
          </div>
        </div>
        <div className="num text-[12.5px] leading-relaxed text-fg-3 sm:text-right">
          <div>P = {P.toLocaleString("en-US")} USDG</div>
          <div>r = {BASE}% a year, t = days / 365</div>
        </div>
      </div>

      <div className="mt-8 flex flex-1 flex-col rounded-[10px] border border-line bg-ink p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <label htmlFor="repay-day" className="text-[13px] text-fg-2">
            Example: repay on day <span className="num text-fg">{day}</span> of {TERM}
          </label>
          <span className="num text-[12px] text-fg-3">interest {usd(interest)}</span>
        </div>
        <div className="num mt-3 text-[28px] leading-none text-glow md:text-[34px]">
          {usd(owed(day))} <span className="text-[0.5em] text-fg-3">USDG due</span>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} className="mt-5 min-h-[96px] w-full flex-1" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="fr-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--color-glow)" stopOpacity="0.22" />
              <stop offset="1" stopColor="var(--color-glow)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={0} x2={W} y1={H - 8} y2={H - 8} stroke="var(--color-line-strong)" vectorEffect="non-scaling-stroke" />
          <line x1={0} x2={W} y1={yd(0)} y2={yd(TERM)} stroke="var(--color-line-strong)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
          <path d={`M0,${yd(0)} L${xd(day)},${yd(day)} L${xd(day)},${H - 8} L0,${H - 8} Z`} fill="url(#fr-area)" />
          <line x1={0} y1={yd(0)} x2={xd(day)} y2={yd(day)} stroke="var(--color-glow)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <line x1={xd(day)} x2={xd(day)} y1={4} y2={H - 8} stroke="var(--color-fg)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        </svg>
        <input
          id="repay-day"
          type="range"
          min={1}
          max={TERM}
          step={1}
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          aria-valuetext={`Day ${day}: ${usd(owed(day))} USDG due`}
          className="mt-2 h-5 w-full cursor-ew-resize accent-[#e9a15e]"
        />
        <div className="num mt-1 flex justify-between text-[11px] text-fg-3">
          <span>day 1</span>
          <span>maturity, day {TERM}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-2">
        <div className="bg-ink-2 p-5">
          <div className="text-[12px] text-fg-3">Borrowers</div>
          <div className="mt-2 text-[14px] text-fg">Cash against your stock without selling. The rate never floats.</div>
        </div>
        <div className="bg-ink-2 p-5">
          <div className="text-[12px] text-fg-3">Lenders</div>
          <div className="mt-2 text-[14px] text-fg">A fixed return to a fixed date, secured by overcollateralized stock.</div>
        </div>
      </div>
    </div>
  );
}

function GapGuardCell() {
  const m = MARKETS.NVDA;
  const model = gapModel(m.gaps, m.risk.liqLtvBps);
  const configured = m.risk.weekendLtvBps;
  const enforced = Math.min(configured, model.weekendLtv);
  return (
    <div className="p-6 md:p-10">
      <h3 className="text-[20px] font-medium tracking-[-0.01em] text-fg">GapGuard, in Rust on Arbitrum Stylus</h3>
      <p className="mt-3 max-w-[48ch] text-[14px] leading-relaxed text-fg-2">
        Learns each stock&apos;s weekend jumps. Sets the weekend limit and the premium.
      </p>
      <div className="mt-7">
        <GapBars gaps={m.gaps} height={160} />
        <div className="mt-2 flex justify-between text-[12px] text-fg-3">
          <span>NVDA, last {m.gaps.length} weekends</span>
          <span>real Chainlink prints</span>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
        {[
          ["Gap volatility", `${(model.sigma / 100).toFixed(2)}%`],
          ["Model limit", `${(model.weekendLtv / 100).toFixed(2)}%`],
          ["Enforced", `${(enforced / 100).toFixed(0)}%`],
          ["Premium", `${PREMIUM_BP.toFixed(1)} bp/wk`],
        ].map(([k, v], i) => (
          <div key={k} className="bg-ink p-3.5">
            <dt className="text-[11.5px] text-fg-3">{k}</dt>
            <dd className={`num mt-1.5 text-[16px] ${i >= 2 ? "text-glow" : "text-fg"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <Link href="/docs#gapguard" className="mt-4 inline-block text-[13px] text-fg-3 transition-colors hover:text-glow">
        How GapGuard works →
      </Link>
    </div>
  );
}

const SESSION_ROWS: [Session, string][] = [
  ["Live", "Fresh prices. The full weekday limit applies."],
  ["Closing", "The final 4 hours. The limit glides to the weekend level."],
  ["Closed", "Feeds frozen. Repay and add collateral only."],
  ["Halted", "Corporate action, outage or USDG depeg. No new debt, no liquidations."],
];

function PhaselockCell() {
  return (
    <div className="p-6 md:p-10">
      <h3 className="text-[20px] font-medium tracking-[-0.01em] text-fg">Phaselock oracle</h3>
      <p className="mt-3 max-w-[48ch] text-[14px] leading-relaxed text-fg-2">
        Chainlink prices, locked to the US market calendar.
      </p>
      <ul className="mt-6 divide-y divide-line border-y border-line">
        {SESSION_ROWS.map(([s, d]) => (
          <li key={s} className="grid grid-cols-[84px_1fr] items-start gap-4 py-3">
            <span>
              <SessionChip session={s} />
            </span>
            <span className="text-[13px] leading-relaxed text-fg-2">{d}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
