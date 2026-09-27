import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, GithubLogo } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "@/components/Wordmark";
import { LaunchButton, REPO } from "@/components/landing/LaunchButton";
import { DocsToc, DocsTocMobile, type TocItem } from "@/components/docs/DocsToc";
import { ContractTables, DocSection, Figure, Formula, H3, Q, Stat, Table } from "@/components/docs/DocsBits";
import { Waterfall } from "@/components/docs/Waterfall";
import { deploymentFor } from "@/lib/markets";

export const metadata: Metadata = {
  title: "Docs · Afterglow",
  description: "How Afterglow works: fixed-rate USDG loans on tokenized stocks that stay open over the weekend.",
};

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "weekend-problem", label: "The weekend problem" },
  { id: "borrowing", label: "Borrowing" },
  { id: "gapguard", label: "GapGuard" },
  { id: "weekend-premium", label: "The weekend premium" },
  { id: "lender-vaults", label: "Lender vaults" },
  { id: "weekend-sweep", label: "Weekend sweep" },
  { id: "oracle", label: "Oracle and USDG" },
  { id: "safety", label: "Safety and testing" },
  { id: "contracts", label: "Contracts" },
  { id: "faq", label: "FAQ" },
];

const maturity = deploymentFor(46630)?.maturity;
const maturityText = maturity
  ? new Date(maturity * 1000).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"
  : undefined;

const ok = <span className="text-live">Yes</span>;
const no = <span className="text-halt">No</span>;

export default function Docs() {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-[1400px] items-center justify-between px-6">
          <Wordmark />
          <div className="flex items-center gap-7 text-[13px] text-fg-2">
            <Link href="/docs" aria-current="page" className="text-fg">
              Docs
            </Link>
            <a href={REPO} className="hidden items-center gap-1 transition-colors hover:text-fg sm:inline-flex">
              Source <ArrowUpRight size={12} />
            </a>
            <LaunchButton />
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 pb-28 pt-14 md:pt-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-20">
          <aside className="hidden lg:block">
            <DocsToc items={TOC} />
          </aside>

          <div className="min-w-0">
            <div className="max-w-[68ch]">
              <p className="text-[13px] text-fg-3">Docs</p>
              <h1 className="mt-3 font-display text-[40px] font-medium leading-[1.04] text-fg md:text-[56px]">
                How Afterglow <em className="italic text-glow">works.</em>
              </h1>
              <p className="mt-5 text-[16px] leading-relaxed text-fg-2">
                The mechanism, the numbers and the reasoning behind them. Testnet build, unaudited.
              </p>
              <a
                href={REPO}
                target="_blank"
                rel="noreferrer"
                className="mt-6 inline-flex items-center gap-2 text-[13.5px] text-fg-2 transition-colors hover:text-fg"
              >
                <GithubLogo size={15} /> View source on GitHub <ArrowUpRight size={12} />
              </a>
            </div>

            <div className="mt-10">
              <DocsTocMobile items={TOC} />
            </div>

            <div className="mt-14 space-y-16 md:mt-16 md:space-y-20">
              <DocSection id="overview" n={1} title="Overview">
                <p>
                  Afterglow is a fixed-rate USDG lending market for tokenized stocks on Robinhood Chain, an Arbitrum chain.
                  Borrowers pledge stock tokens such as NVDA and borrow USDG at a fixed rate until a fixed maturity.
                </p>
                <p>
                  Lenders deposit USDG and pick a side: <strong>Protected</strong>, paid first, or <strong>Boost</strong>,
                  which takes losses first and earns the rest. A market-hours oracle and a gap-risk model keep loans open
                  and safe while stock prices are frozen over the weekend.
                </p>
              </DocSection>

              <DocSection id="weekend-problem" n={2} title="The weekend problem">
                <p>
                  Stock tokens move on-chain around the clock, but their price feeds follow the US market. Chainlink stops
                  printing at the Friday close, <strong>20:00 New York</strong>, and resumes after{" "}
                  <strong>Sunday 20:00 New York</strong>. For about two days every lender is looking at a stale price.
                </p>
                <p>On-chain stock lenders handle that gap in one of two ways today:</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-fg-3">
                  <li>
                    <strong>Keep lending on Friday&apos;s price.</strong> Loans open against a number that may be wrong by
                    Monday. A gap down becomes the lenders&apos; bad debt.
                  </li>
                  <li>
                    <strong>Freeze everything.</strong> Safe for lenders, but borrowers cannot repay or add collateral until
                    the feed returns.
                  </li>
                </ul>
                <p>
                  Afterglow does neither. New borrowing stops, exits stay open, and the weekend risk is priced and paid to the
                  lenders who choose to carry it.
                </p>
                <H3>Why it matters</H3>
                <div className="grid grid-cols-1 gap-6 pt-1 sm:grid-cols-2">
                  <Stat value="$3.14B" label="tokenized stocks across chains, 4.0M holders" source="rwa.xyz" />
                  <Stat value="$689M" label="USDG on Robinhood Chain" source="USDG totalSupply()" />
                  <Stat value="$33.4B" label="Schwab pledged-asset line balances, +59% a year" source="Schwab 2Q26 8-K" />
                </div>
                <p>
                  Borrowing against a stock portfolio is a large and growing product in traditional finance. On-chain, the
                  collateral and the cash already exist; what is missing is a loan that survives the weekend.
                </p>
              </DocSection>

              <DocSection id="borrowing" n={3} title="Borrowing">
                <p>
                  Each market has one collateral token, one maturity and one fixed rate. If you borrow <span className="num">P</span>{" "}
                  USDG with <span className="num">t</span> years left to maturity at rate <span className="num">r</span>, you owe a
                  fixed face value at maturity:
                </p>
                <Formula>face = P × (1 + r × t)</Formula>
                <p>
                  Repaying early costs the face value discounted to today, so you pay interest only for the time used. Any
                  position still unpaid after maturity plus a grace period is in default and can be liquidated in full.
                </p>
                <H3>Sessions</H3>
                <p>The oracle tags every price read with a session. What you can do depends on it:</p>
                <Table
                  head={["Session", "When", "Borrow", "Withdraw collateral", "Liquidate"]}
                  rows={[
                    ["Live", "Market open and the feed has printed", "Up to base LTV", "If LTV stays under the limit", ok],
                    ["Closing", "Final 4 hours before the weekly close", "Limit ramps down", "If LTV stays under the ramped limit", ok],
                    ["Closed", "Weekend, holiday, or reopened with no new print", no, "Only under the weekend LTV", no],
                    ["Halted", "Corporate action, sequencer outage, bad or stale price, USDG depeg", no, no, no],
                  ]}
                />
                <p>
                  <strong>Repay and add collateral work in every session.</strong> Repay can never be paused, not even by the
                  guardian.
                </p>
                <H3>The pre-close ramp</H3>
                <p>
                  In the four hours before the Friday close the borrow limit glides in a straight line from the weekday level to
                  the weekend level, so nobody can open a maximum loan minutes before a two-day freeze. The ramp limits new
                  risk only; it never liquidates an existing position.
                </p>
                <Table
                  head={["Collateral", "Weekday LTV", "Weekend LTV", "Liquidation LTV", "Liquidator bonus"]}
                  numCols={[1, 2, 3, 4]}
                  rows={[
                    ["Stocks (NVDA, TSLA, AMZN)", "55%", "45%", "65%", "7%"],
                    ["ETFs (SPY, QQQ)", "70%", "60%", "77%", "5%"],
                  ]}
                />
                <p>
                  Liquidations wait for a fresh price. Selling collateral against a frozen number is unfair to the borrower and
                  there is no market to sell into until Monday anyway.
                </p>
              </DocSection>

              <DocSection id="gapguard" n={4} title="GapGuard">
                <p>
                  GapGuard is a small risk model written in Rust and deployed on <strong>Arbitrum Stylus</strong>. For each
                  stock it records the weekend gap: Monday&apos;s first price against Friday&apos;s last, taken from Chainlink.
                </p>
                <p>
                  It keeps an exponentially weighted variance of those gaps with <span className="num text-fg">λ = 0.90</span>, so
                  recent weekends count most. From that it sets a buffer and a safe weekend limit:
                </p>
                <Formula>
                  buffer = 3 × σ, clamped to 5%–50%
                  <br />
                  weekend LTV = liquidation LTV × (1 − buffer)
                </Formula>
                <p>
                  A position that enters the weekend at that LTV survives a three-sigma gap without becoming liquidatable. Until
                  a stock has eight recorded weekends, the model answers with the maximum 50% buffer.
                </p>
                <p>
                  The market uses the <strong>lower</strong> of its configured weekend LTV and GapGuard&apos;s, so the model can
                  only tighten the limit. If GapGuard fails or is unset, the configured value applies. NVDA&apos;s recent gaps
                  are calm, so today its configured 45% holds.
                </p>
              </DocSection>

              <DocSection id="weekend-premium" n={5} title="The weekend premium">
                <p>
                  The fixed rate pays for the money. The weekend premium pays for the weekend. Every loan pays it once, upfront,
                  for each weekly close before maturity:
                </p>
                <Formula>
                  per weekend = 10% of GapGuard σ, clamped to 2–50 bp
                  <br />
                  premium = amount × per weekend × weekends to maturity
                </Formula>
                <p>
                  Choppier stocks and longer loans pay more. The premium is kept from the amount sent to the borrower, then
                  earned by lenders evenly until maturity. A deposit made just before a borrow therefore captures none of it.
                  Because Protected&apos;s target is fixed, all of the premium ends up with Boost.
                </p>
                <Table
                  head={["NVDA example", "Value"]}
                  numCols={[1]}
                  rows={[
                    ["Weekend gap σ", "0.78%"],
                    ["Premium per weekend", "7.8 bp"],
                    ["As a yearly rate", "≈ 4.1%"],
                    ["28-day loan (4 weekends)", "0.31% of the amount"],
                  ]}
                />
              </DocSection>

              <DocSection id="lender-vaults" n={6} title="Lender vaults">
                <p>
                  Every market splits its lenders into two tranches that share the same borrowers and the same fixed rate. What
                  differs is the order of payment:
                </p>
                <Table
                  head={["", "Protected", "Boost"]}
                  rows={[
                    ["Paid", "First, up to a 5% target", "Everything left, incl. all premiums"],
                    ["Losses", "Only after Boost is gone", "First"],
                    ["Size", "Up to 80% of the vault", "At least 20% of the vault"],
                  ]}
                />
                <p>
                  Example: a fully lent vault with 25% in Boost earns the 6% base rate plus NVDA&apos;s premium, about 10% in
                  total. Protected takes its <span className="num text-fg">5%</span>. Boost earns about{" "}
                  <span className="num text-glow">25%</span>, of which about 16 points are weekend premium.
                </p>
                <p>
                  The honest caveat: those figures assume the vault is fully lent. When little is lent, interest is thin, and
                  Boost tops up Protected&apos;s target from its own share. Boost&apos;s yield moves with utilisation; Protected&apos;s
                  does not, until Boost runs out.
                </p>
                <H3>Who pays for a Monday gap</H3>
                <p>
                  Say a stock gaps down on Monday so hard that a loan&apos;s collateral no longer covers it. Drag the size of that
                  loss: Boost absorbs it first, and Protected is only touched once Boost is gone.
                </p>
                <Figure>
                  <Waterfall />
                </Figure>
              </DocSection>

              <DocSection id="weekend-sweep" n={7} title="Weekend sweep">
                <p>
                  USDG that is not lent does not sit idle. Each market can park it in an ERC-4626 USDG savings vault, and the cash
                  it keeps on hand follows the same market clock:
                </p>
                <Table
                  head={["Session", "Kept as cash", "Why"]}
                  numCols={[1]}
                  rows={[
                    ["Live / Closing", "20%", "Borrowers can draw at any moment"],
                    ["Closed", "5%", "No borrowing until the reopen"],
                    ["Halted, paused, matured", "100%", "Everything comes back"],
                  ]}
                />
                <p>
                  Anyone can call <span className="num text-fg">rebalance()</span>; the target comes from the oracle, not the caller.
                  Borrows and withdrawals pull any shortfall from the vault in the same transaction, so nobody waits on a keeper.
                  On testnet the vault is a demo that pays a fixed 3.6%.
                </p>
              </DocSection>

              <DocSection id="oracle" n={8} title="Oracle and USDG">
                <p>
                  The Phaselock oracle reads Chainlink stock feeds and quotes them in USDG through Chainlink&apos;s USDG/USD feed. It
                  takes the session from the market calendar, because feed freshness alone cannot tell an open market from a
                  closed one.
                </p>
                <p>
                  If USDG moves more than <strong>±2%</strong> from $1, every market halts: no new loans and no liquidations through
                  a depeg.
                </p>
                <p>
                  Chainlink publishes equity feeds on Robinhood Chain mainnet only. On testnet, a keeper copies every new mainnet
                  Chainlink print for TSLA, AMZN and USDG into Chainlink-compatible feeds every 30 minutes, so the demo trades on
                  real prices and freezes when mainnet does.
                </p>
              </DocSection>

              <DocSection id="safety" n={9} title="Safety and testing">
                <ul className="list-disc space-y-2 pl-5 marker:text-fg-3">
                  <li>Repay can never be paused.</li>
                  <li>No liquidation on a frozen price.</li>
                  <li>ERC-4626 virtual shares against inflation attacks, and internal cash accounting so donations cannot move the share price.</li>
                  <li>OpenZeppelin contracts in Solidity and in Stylus; reentrancy guards on every state change.</li>
                  <li>
                    <span className="num text-fg">97</span> unit and fuzz tests, plus <span className="num text-fg">5</span> fork
                    tests against Robinhood Chain mainnet state.
                  </li>
                </ul>
                <p>
                  <strong>Afterglow is unaudited and runs on testnet only.</strong> Do not use it with real funds.
                </p>
              </DocSection>

              <DocSection id="contracts" n={10} title="Contracts">
                <p>
                  Robinhood Chain testnet (chain 46630).
                  {maturityText && (
                    <>
                      {" "}Current maturity: <span className="num text-fg">{maturityText}</span>.
                    </>
                  )}{" "}
                  Hover an address to see it in full.
                </p>
                <ContractTables />
              </DocSection>

              <DocSection id="faq" n={11} title="FAQ">
                <Q q="Why a fixed rate?">
                  <p>
                    Borrowers know the exact cost on day one, and lenders know their return for the term. Every loan in a market
                    shares one rate and one maturity, which keeps the accounting simple and cheap.
                  </p>
                </Q>
                <Q q="Why 6% plus a premium?">
                  <p>
                    The 6% pays for the money. The premium pays for the weekend gap risk, which differs by stock, so it is priced
                    per stock from measured gaps and paid to the tranche that carries it.
                  </p>
                </Q>
                <Q q="Who buys liquidated stock?">
                  <p>
                    Liquidators repay the debt and receive the collateral plus a bonus (7% for stocks), then sell during market
                    hours. On-chain liquidity for stock tokens is still thin, so liquidators need their own route to sell. This
                    is a known limit.
                  </p>
                </Q>
                <Q q="What happens if nobody borrows?">
                  <p>
                    Unlent USDG earns the savings-vault yield through the sweep. Protected still gets topped up from Boost, so Boost
                    may earn less than the headline example.
                  </p>
                </Q>
                <Q q="Is it audited?">
                  <p>No. It is a hackathon build on testnet.</p>
                </Q>
              </DocSection>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-6 py-8 text-[12px] text-fg-3 md:flex-row md:items-center md:justify-between">
          <Wordmark />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <a href={REPO} className="transition-colors hover:text-fg-2">
              Source
            </a>
            <span>Unaudited hackathon build. Testnet only.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
