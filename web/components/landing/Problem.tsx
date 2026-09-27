import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { Reveal } from "./Reveal";
import { CountUp } from "./CountUp";

const APPROACHES: { name: string; body: string; verdict: string; ok: boolean }[] = [
  {
    name: "Lend on Friday's price",
    body: "Loans open against a stale price. A Monday gap becomes the lenders' bad debt.",
    verdict: "Hidden risk for lenders",
    ok: false,
  },
  {
    name: "Freeze everything",
    body: "Safe for lenders, but borrowers cannot even repay until Monday.",
    verdict: "Stuck borrowers",
    ok: false,
  },
  {
    name: "Afterglow: follow the market clock",
    body: "Limits tighten before the close, repaying always works, and the weekend risk is paid to the lenders who choose to take it.",
    verdict: "Open all weekend, risk priced",
    ok: true,
  },
];

// docs/DESIGN.md, "Evidence" (retrieved 27 Sep 2026).
const EVIDENCE: [{ to: number; decimals: number; suffix: string }, string, string][] = [
  [{ to: 3.14, decimals: 2, suffix: "B" }, "tokenized stocks, 4.0M holders", "rwa.xyz"],
  [{ to: 689, decimals: 0, suffix: "M" }, "USDG on Robinhood Chain", "totalSupply()"],
  [{ to: 33.4, decimals: 1, suffix: "B" }, "borrowed against stock at Schwab, +59% a year", "Schwab 2Q26 8-K"],
];

export function Problem() {
  return (
    <section id="problem" className="scroll-mt-16 border-t border-line">
      <div className="mx-auto max-w-[1400px] px-6 py-24 md:py-28">
        <Reveal className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end">
          <h2 className="text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-fg md:col-span-7 md:text-[48px]">
            Tokenized stocks trade around the clock. Their prices don&apos;t.
          </h2>
          <p className="max-w-[46ch] text-[15.5px] leading-relaxed text-fg-2 md:col-span-5 md:justify-self-end">
            Stock prices freeze from Friday&apos;s close to Sunday night. Lenders handle that gap one of three ways.
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-line bg-line lg:grid-cols-3">
          {APPROACHES.map((a, i) => (
            <Reveal key={a.name} delay={i * 0.06} className={a.ok ? "relative bg-ink-3" : "bg-ink-2"}>
              {a.ok && <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-glow" />}
              <div className="flex h-full flex-col p-6 md:p-8">
                <h3 className={`text-[19px] font-medium tracking-[-0.01em] ${a.ok ? "text-glow" : "text-fg"}`}>{a.name}</h3>
                <p className="mt-3 flex-1 text-[14.5px] leading-relaxed text-fg-2">{a.body}</p>
                <p className={`mt-6 flex items-center gap-2 text-[13px] ${a.ok ? "text-fg" : "text-fg-3"}`}>
                  {a.ok ? <Check size={14} className="text-glow" /> : <X size={14} />}
                  {a.verdict}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-14">
          <p className="text-[13px] text-fg-3">Who needs it</p>
          <dl className="mt-5 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {EVIDENCE.map(([n, k, src]) => (
              <div key={k} className="border-l border-line-strong pl-5">
                <dt className="num text-[32px] leading-none text-fg md:text-[40px]">
                  <CountUp to={n.to} decimals={n.decimals} prefix="$" suffix={n.suffix} />
                </dt>
                <dd className="mt-3 text-[14px] leading-snug text-fg-2">{k}</dd>
                <dd className="mt-1 text-[11.5px] text-fg-3">{src}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
