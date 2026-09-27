import Link from "next/link";
import { ArrowUpRight, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Providers } from "@/components/Providers";
import { Horizon } from "@/components/landing/Horizon";
import { MarketClockCard } from "@/components/landing/MarketClockCard";
import { Reveal } from "@/components/landing/Reveal";
import { LandingWeek, LandingGaps } from "@/components/landing/LandingCharts";
import { Wordmark } from "@/components/Wordmark";

const REPO = "https://github.com/Iamsohungrynow/afterglow";

export default function Landing() {
  return (
    <Providers>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line/60 bg-ink/70 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <Wordmark />
          <div className="flex items-center gap-7 text-[13px] text-fg-2">
            <a href="#mechanism" className="hidden transition-colors hover:text-fg md:inline">
              Mechanism
            </a>
            <a href={REPO} className="hidden items-center gap-1 transition-colors hover:text-fg md:inline-flex">
              Source <ArrowUpRight size={12} />
            </a>
            <LaunchButton />
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate min-h-[92dvh] overflow-hidden">
          <Horizon />
          <div className="relative mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-12 px-6 pt-32 pb-20 lg:grid-cols-12 lg:pt-36">
            <div className="lg:col-span-6">
              <h1 className="font-display text-[44px] font-medium leading-[1.02] tracking-[-0.01em] text-fg md:text-[64px]">
                Borrow against your stocks, <em className="font-display italic text-glow">even after the bell.</em>
              </h1>
              <p className="mt-6 max-w-[46ch] text-[16px] leading-relaxed text-fg-2">
                Fixed-rate USDG credit lines on tokenized stocks. Risk follows the market clock, so weekends never surprise you.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <LaunchButton large />
                <a
                  href={REPO}
                  className="inline-flex h-11 items-center gap-2 rounded-[6px] border border-line-strong px-5 text-[14px] text-fg transition hover:border-fg-3 active:translate-y-px"
                >
                  View source
                </a>
              </div>
            </div>
            <div className="lg:col-span-6 lg:pt-4">
              <MarketClockCard />
            </div>
          </div>
        </section>

        {/* The week, as the protocol sees it */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-[1400px] px-6 py-24">
            <Reveal>
              <h2 className="max-w-[22ch] text-[32px] font-medium leading-[1.1] tracking-[-0.02em] md:text-[44px]">
                Every weekend, stocks go dark for 48 hours. Your loan should know.
              </h2>
              <p className="mt-5 max-w-[62ch] text-[16px] leading-relaxed text-fg-2">
                Price feeds freeze from Friday 20:00 to Sunday 20:00 ET. Afterglow lowers new borrowing before the close, keeps
                repayments open all weekend, and waits for a real price before any liquidation.
              </p>
            </Reveal>
            <Reveal delay={0.1} className="mt-12 border border-line bg-ink-2 px-3 pt-4">
              <LandingWeek />
            </Reveal>
            <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-3">
              {[
                ["Weekdays", "Borrow up to the base LTV while prices are live."],
                ["Final four hours", "The limit glides down to the weekend LTV. Nobody enters the weekend at the edge."],
                ["Weekend", "No new debt and no blind liquidations. Repay or add collateral any time."],
              ].map(([t, b]) => (
                <Reveal key={t}>
                  <div className="text-[15px] text-fg">{t}</div>
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-2">{b}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Mechanism */}
        <section id="mechanism" className="border-t border-line">
          <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-px bg-line px-0 lg:grid-cols-12">
            <Reveal className="bg-ink p-8 md:p-12 lg:col-span-7">
              <h3 className="text-[26px] font-medium tracking-[-0.02em]">A fixed rate to a fixed date</h3>
              <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-fg-2">
                Each market is one stock, one maturity and one rate. Borrow P today and you owe a known amount on the maturity
                date. Repay early and you pay only for the days used.
              </p>
              <div className="mt-10 grid grid-cols-2 gap-px bg-line">
                <div className="bg-ink-2 p-6">
                  <div className="text-[12px] text-fg-3">You owe at maturity</div>
                  <div className="num mt-3 text-[20px] text-fg">P × (1 + r × t)</div>
                </div>
                <div className="bg-ink-2 p-6">
                  <div className="text-[12px] text-fg-3">Lenders earn</div>
                  <div className="num mt-3 text-[20px] text-fg">r × utilisation</div>
                </div>
                <div className="col-span-2 bg-ink-2 p-6">
                  <div className="text-[12px] text-fg-3">Example: 10,000 USDG for 28 days at 8%</div>
                  <div className="num mt-3 text-[20px] text-glow">10,061.37 USDG due on the maturity date</div>
                </div>
              </div>
            </Reveal>
            <div className="grid grid-cols-1 gap-px bg-line lg:col-span-5">
              <Reveal className="bg-ink p-8 md:p-10">
                <h3 className="text-[20px] font-medium tracking-[-0.01em]">Phaselock oracle</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-fg-2">
                  Chainlink prices, priced in USDG and phase-locked to the exchange calendar. Knows Live, Closing, Closed and
                  Halted, including holidays, corporate actions and a USDG depeg.
                </p>
              </Reveal>
              <Reveal className="bg-ink p-8 md:p-10" delay={0.08}>
                <h3 className="text-[20px] font-medium tracking-[-0.01em]">GapGuard, in Rust on Stylus</h3>
                <p className="mt-3 text-[14px] leading-relaxed text-fg-2">
                  Learns how far each stock jumps between Friday and Monday, and tightens the weekend limit when gaps grow.
                  Seeded with real weekends from Robinhood Chain.
                </p>
                <div className="mt-6">
                  <LandingGaps />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Who it is for */}
        <section className="border-t border-line">
          <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-16 px-6 py-24 md:grid-cols-2">
            <Reveal>
              <h3 className="font-display text-[34px] font-medium leading-[1.1]">For holders</h3>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-fg-2">
                Cash against NVDA, SPY or QQQ without selling. No bank minimums, no bank hours, and a rate that does not float.
                Schwab&apos;s pledged-asset lines grew 59% in a year to $33.4B; this is that product, on chain.
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h3 className="font-display text-[34px] font-medium leading-[1.1]">For USDG lenders</h3>
              <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-fg-2">
                A fixed return to a fixed date, secured by over-collateralised blue-chip equity. Built for the $689M of USDG
                already sitting on Robinhood Chain.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-line">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%]"
            style={{ background: "radial-gradient(60% 80% at 50% 100%, rgb(233 161 94 / 0.14), transparent 70%)" }}
          />
          <div className="relative mx-auto flex max-w-[1400px] flex-col items-start gap-8 px-6 py-28 md:flex-row md:items-end md:justify-between">
            <h2 className="font-display max-w-[16ch] text-[40px] font-medium leading-[1.05] md:text-[56px]">
              The market closes. Your credit line doesn&apos;t.
            </h2>
            <LaunchButton large />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-6 py-8 text-[12px] text-fg-3 md:flex-row md:items-center md:justify-between">
          <span>Robinhood Chain, Arbitrum Stylus, Paxos USDG, Chainlink, ZeroDev, OpenZeppelin</span>
          <span>Unaudited hackathon build. Testnet only.</span>
        </div>
      </footer>
    </Providers>
  );
}

function LaunchButton({ large = false }: { large?: boolean }) {
  return (
    <Link
      href="/app"
      className={`group inline-flex items-center gap-2 rounded-[6px] bg-fg font-medium text-ink transition hover:bg-white active:translate-y-px ${
        large ? "h-11 px-5 text-[14px]" : "h-8 px-3.5 text-[13px]"
      }`}
    >
      Launch app
      <ArrowRight size={large ? 14 : 12} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
