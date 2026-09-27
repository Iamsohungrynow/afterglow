import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { Providers } from "@/components/Providers";
import { Wordmark } from "@/components/Wordmark";
import { Hero } from "@/components/landing/Hero";
import { WeekSimulator } from "@/components/landing/WeekSimulator";
import { Waterfall } from "@/components/landing/Waterfall";
import { Mechanism } from "@/components/landing/Mechanism";
import { Reveal } from "@/components/landing/Reveal";
import { LaunchButton, SourceButton, REPO } from "@/components/landing/LaunchButton";

const BUILT_ON: [string, string][] = [
  ["Robinhood Chain", "settlement and stock tokens"],
  ["Arbitrum Stylus", "GapGuard, written in Rust"],
  ["Paxos USDG", "the asset you borrow and lend"],
  ["Chainlink", "stock and USDG prices"],
  ["ZeroDev", "smart accounts, sponsored gas"],
  ["OpenZeppelin", "contract libraries"],
];

export default function Landing() {
  return (
    <Providers>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-line/60 bg-ink/70 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <Wordmark />
          <div className="flex items-center gap-7 text-[13px] text-fg-2">
            <a href="#week" className="hidden transition-colors hover:text-fg md:inline">
              The week
            </a>
            <a href="#lenders" className="hidden transition-colors hover:text-fg md:inline">
              Lenders
            </a>
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
        <Hero />

        {/* Drag through the week */}
        <section id="week" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-[1400px] px-6 py-24 md:py-28">
            <Reveal className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-end">
              <h2 className="text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-fg md:col-span-7 md:text-[48px]">
                Stocks go dark for 48 hours every weekend. Drag through the week.
              </h2>
              <p className="max-w-[46ch] text-[15.5px] leading-relaxed text-fg-2 md:col-span-5 md:justify-self-end">
                Price feeds freeze from Friday 20:00 to Sunday 20:00 New York time. Pick any moment to see the session, the
                borrow limit and what you can do. NVDA limits shown.
              </p>
            </Reveal>
            <div className="mt-12">
              <WeekSimulator />
            </div>
          </div>
        </section>

        {/* Who takes the loss */}
        <section id="lenders" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-[1400px] px-6 py-24 md:py-28">
            <Reveal className="max-w-[760px]">
              <h2 className="text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-fg md:text-[48px]">
                Lenders choose who takes the loss.
              </h2>
              <p className="mt-5 max-w-[62ch] text-[15.5px] leading-relaxed text-fg-2">
                Protected is paid first and targets a fixed 5%. Boost keeps the rest of the 8% borrower rate and absorbs any
                loss first. Boost must be at least 20% of the vault. Drag the loss to see the order.
              </p>
            </Reveal>
            <div className="mt-12">
              <Waterfall />
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
                Three parts: a fixed-rate market, an oracle that knows the market calendar, and a model that learns weekend
                gaps.
              </p>
            </Reveal>
            <div className="mt-12">
              <Mechanism />
            </div>
          </div>
        </section>

        {/* Built on */}
        <section className="border-t border-line">
          <div className="mx-auto max-w-[1400px] px-6 py-14">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
              <p className="text-[14px] text-fg-3 lg:col-span-2">Built on</p>
              <ul className="grid grid-cols-2 gap-y-6 sm:grid-cols-3 lg:col-span-10 lg:grid-cols-6">
                {BUILT_ON.map(([name, role]) => (
                  <li key={name} className="border-l border-line-strong pl-4 transition-colors hover:border-glow">
                    <div className="whitespace-nowrap text-[15px] text-fg">{name}</div>
                    <div className="mt-1 text-[12px] leading-snug text-fg-3">{role}</div>
                  </li>
                ))}
              </ul>
            </div>
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
          <span>Unaudited hackathon build. Testnet only.</span>
        </div>
      </footer>
    </Providers>
  );
}
