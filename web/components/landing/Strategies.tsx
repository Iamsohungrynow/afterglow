import { ShieldCheck, TrendUp } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { Reveal } from "./Reveal";

// Same example vault as the Waterfall: 100k USDG, 25% Boost, lent at 8%, Protected targets 5%.
const RATE = 8;
const TARGET = 5;
const BOOST_SHARE = 0.25;
const BOOST_APY = (RATE - (1 - BOOST_SHARE) * TARGET) / BOOST_SHARE;

interface Strategy {
  icon: Icon;
  name: string;
  yield: string;
  yieldNote: string;
  pitch: string;
  rows: [string, string][];
  hot?: boolean;
}

const STRATEGIES: Strategy[] = [
  {
    icon: ShieldCheck,
    name: "Protected",
    yield: `${TARGET}%`,
    yieldNote: "fixed target, paid first",
    pitch: "Be shielded from the weekend.",
    rows: [
      ["Earns", "Borrower interest, paid before Boost"],
      ["Risk", "Only after Boost is wiped out"],
    ],
  },
  {
    icon: TrendUp,
    name: "Boost",
    yield: `~${BOOST_APY.toFixed(0)}%`,
    yieldNote: "fully lent, 25% Boost mix",
    pitch: "Get paid to cover the weekend.",
    rows: [
      ["Earns", `Everything above Protected's ${TARGET}%`],
      ["Risk", "Takes weekend gap losses first"],
    ],
    hot: true,
  },
];

export function Strategies() {
  return (
    <div>
      {/* Where the money goes */}
      <Reveal className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-fg-2">
        <span className="rounded-[6px] border border-line-strong px-3 py-1.5 text-fg">
          Borrowers pay <span className="num">{RATE}%</span> fixed
        </span>
        <span aria-hidden className="text-fg-3">→</span>
        <span className="rounded-[6px] border border-line-strong px-3 py-1.5">
          Protected takes <span className="num text-fg">{TARGET}%</span> first
        </span>
        <span aria-hidden className="text-fg-3">→</span>
        <span className="rounded-[6px] border border-glow/50 px-3 py-1.5">
          Boost keeps <span className="text-glow">the rest</span>
        </span>
      </Reveal>
      <p className="mt-4 text-[14px] text-fg-2">
        Unlent USDG earns too: it sweeps into a savings vault, and on weekends almost all of it does.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-line bg-line md:grid-cols-2">
        {STRATEGIES.map((s, i) => (
          <Reveal key={s.name} delay={i * 0.06} className="bg-ink-2">
            <div className="flex h-full flex-col p-6 md:p-8">
              <div className="flex items-center gap-2 text-[15px] text-fg">
                <s.icon size={17} className={s.hot ? "text-glow" : "text-fg-2"} />
                {s.name}
              </div>
              <p className="mt-2 text-[22px] font-medium tracking-[-0.015em] text-fg md:text-[26px]">{s.pitch}</p>
              <div className="mt-6 flex items-baseline gap-3">
                <span className={`num text-[44px] leading-none md:text-[52px] ${s.hot ? "text-glow" : "text-fg"}`}>{s.yield}</span>
                <span className="text-[13px] text-fg-3">{s.yieldNote}</span>
              </div>
              <dl className="mt-7 divide-y divide-line border-y border-line">
                {s.rows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[72px_1fr] gap-4 py-3">
                    <dt className="text-[12.5px] text-fg-3">{k}</dt>
                    <dd className="text-[13.5px] leading-relaxed text-fg-2">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">
        Example yields, fully lent. Boost must stay at least 20% of the vault.
      </p>
    </div>
  );
}
