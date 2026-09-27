import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { Providers } from "@/components/Providers";
import { Wordmark } from "@/components/Wordmark";
import { Hero } from "@/components/landing/Hero";
import { WeekSimulator } from "@/components/landing/WeekSimulator";
import { Mechanism } from "@/components/landing/Mechanism";
import { Problem } from "@/components/landing/Problem";
import { Strategies } from "@/components/landing/Strategies";
import { Reveal } from "@/components/landing/Reveal";
import { BuiltOn } from "@/components/landing/BuiltOn";
import { LaunchButton, SourceButton, REPO } from "@/components/landing/LaunchButton";
import { MARKETS } from "@/lib/markets";

// Borrow limits for single stocks, from the TSLA market's risk params.
const WEEKDAY_LTV = MARKETS.TSLA.risk.baseLtvBps / 100;
const WEEKEND_LTV = MARKETS.TSLA.risk.weekendLtvBps / 100;

const SAFETY = [
  "Repay can never be paused",
  "No liquidation on a frozen price",
  "USDG depeg circuit breaker (±2%)",
  "97 tests + 5 mainnet fork tests",
];

/** Small, quiet link into the docs where the landing page stops explaining. */
function DocsLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-[13px] text-fg-3 transition-colors hover:text-glow">
      {children} →
    </Link>
  );
}

export default function Landing() {
  return (
    <Providers>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line/60 bg-ink/70 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <Wordmark />
          <div className="flex items-center gap-7 text-[13px] text-fg-2">
            <a href="#problem" className="hidden transition-colors hover:text-fg md:inline">
              Why
            </a>
            <a href="#week" className="hidden transition-colors hover:text-fg md:inline">
              Borrow
            </a>
            <a href="#lenders" className="hidden transition-colors hover:text-fg md:inline">
              Lend
            </a>
            <a href="#mechanism" className="hidden transition-colors hover:text-fg md:inline">
              Mechanism
            </a>
            <Link href="/docs" className="transition-colors hover:text-fg">
              Docs
            </Link>
            <a href={REPO} className="hidden items-center gap-1 transition-colors hover:text-fg md:inline-flex">
              Source <ArrowUpRight size={12} />
            </a>
            <LaunchButton />
          </div>
        </nav>
      </header>

      <main>
        <Hero />

        <Problem />

        {/* Drag through the week */}
        <section id="week" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-[1400px] px-6 py-24 md:py-28">
            <Reveal className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end">
              <h2 className="text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-fg md:col-span-7 md:text-[48px]">
                <span className="num">{WEEKDAY_LTV}%</span> on weekdays. <span className="num">{WEEKEND_LTV}%</span> into the weekend.
              </h2>
              <div className="md:col-span-5 md:justify-self-end">
                <p className="max-w-[46ch] text-[15.5px] leading-relaxed text-fg-2">
                  Borrowing pauses until prices return. Repaying never does.
                </p>
                <div className="mt-3">
                  <DocsLink href="/docs#borrowing">How borrowing works</DocsLink>
                </div>
              </div>
            </Reveal>
            <div className="mt-12">
              <WeekSimulator />
            </div>
          </div>
        </section>

        {/* Lend */}
        <section id="lenders" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-6 py-24 md:py-28 lg:grid-cols-12 lg:items-center">
            <Reveal className="lg:col-span-5">
              <h2 className="max-w-[14ch] text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-fg md:text-[48px]">
                Lenders pick a side of the weekend.
              </h2>
            </Reveal>
            <div className="lg:col-span-7">
              <Strategies />
            </div>
          </div>
        </section>

        {/* Mechanism */}
        <section id="mechanism" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-[1400px] px-6 py-24 md:py-28">
            <Reveal className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end">
              <h2 className="font-display text-[38px] font-medium leading-[1.02] text-fg md:col-span-8 md:text-[58px]">
                Wall Street&apos;s pledged-asset lines, <em className="italic text-glow">onchain.</em>
              </h2>
              <p className="max-w-[44ch] text-[15.5px] leading-relaxed text-fg-2 md:col-span-4 md:justify-self-end">
                A fixed-rate market, a market-hours oracle and a Rust gap model.
              </p>
            </Reveal>
            <div className="mt-12">
              <Mechanism />
            </div>
            <Reveal className="mt-14">
              <p className="text-[13px] text-fg-3">Built to be audited</p>
              <ul className="mt-5 grid grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                {SAFETY.map((k) => (
                  <li key={k} className="border-l border-line-strong pl-4 text-[14.5px] text-fg">
                    {k}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <DocsLink href="/docs#safety">Safety and testing</DocsLink>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Built on */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-[1400px] px-6 py-14">
            <BuiltOn />
          </div>
        </section>

        {/* Closing CTA */}
        <section className="relative isolate overflow-hidden border-t border-line">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[75%]"
            style={{ background: "radial-gradient(55% 90% at 50% 100%, rgb(233 161 94 / 0.16), transparent 72%)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px"
            style={{
              background: "linear-gradient(90deg, transparent 8%, rgb(233 161 94 / 0.6) 35%, rgb(255 240 222) 50%, rgb(233 161 94 / 0.6) 65%, transparent 92%)",
              boxShadow: "0 0 30px 3px rgb(233 161 94 / 0.45)",
            }}
          />
          <div className="mx-auto flex max-w-[1400px] flex-col items-start gap-10 px-6 py-28 md:flex-row md:items-end md:justify-between md:py-36">
            <h2 className="max-w-[18ch] font-display text-[40px] font-medium leading-[1.03] text-fg md:text-[64px]">
              The fixed-rate credit layer for tokenized stocks.
            </h2>
            <div className="flex flex-wrap gap-3">
              <LaunchButton large />
              <SourceButton />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-6 py-8 text-[12px] text-fg-3 md:flex-row md:items-center md:justify-between">
          <Wordmark />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/docs" className="transition-colors hover:text-fg-2">
              Docs
            </Link>
            <a href={REPO} className="transition-colors hover:text-fg-2">
              Source
            </a>
            <span>Unaudited hackathon build. Testnet only.</span>
          </div>
        </div>
      </footer>
    </Providers>
  );
}
