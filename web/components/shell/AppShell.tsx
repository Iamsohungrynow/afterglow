"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBlockNumber } from "wagmi";
import { Wordmark } from "@/components/Wordmark";
import { SessionChip } from "@/components/SessionChip";
import { useNow } from "@/hooks/useNow";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useReadChain } from "@/hooks/useReadChain";
import { chains } from "@/lib/chains";
import { MARKETS } from "@/lib/markets";
import { fmtDuration, nextTransition, scheduleSession } from "@/lib/session";
import { useAfterglowAccount } from "@/components/terminal/AccountProvider";
import { ConnectButton, NetworkSelect } from "./WalletControls";

const NAV = [
  { href: "/app", label: "Borrow" },
  { href: "/earn", label: "Earn" },
  { href: "/markets", label: "Markets" },
  { href: "/portfolio", label: "Portfolio" },
];

/** Frame for every app route: nav, live ticker strip, content, status footer. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <TopNav />
      <TickerStrip />
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      <StatusFooter />
    </div>
  );
}

function TopNav() {
  const path = usePathname();
  return (
    <header className="relative flex h-14 items-center justify-between border-b border-line px-4 md:px-5">
      <Wordmark />
      <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-ink-2 p-1 md:flex">
        {NAV.map((n) => {
          const on = path === n.href || path.startsWith(`${n.href}/`);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-full px-4 py-1.5 text-[12.5px] transition ${on ? "bg-white/[0.08] text-fg" : "text-fg-3 hover:text-fg-2"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2">
        <NetworkSelect />
        <ConnectButton />
      </div>
      <nav className="absolute inset-x-0 top-14 z-30 flex justify-center gap-1 border-b border-line bg-ink/95 py-1.5 backdrop-blur md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`rounded-full px-3 py-1 text-[12px] ${path.startsWith(n.href) ? "bg-white/[0.08] text-fg" : "text-fg-3"}`}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

/** Live Chainlink prices from Robinhood Chain mainnet plus the market clock. */
function TickerStrip() {
  const now = useNow();
  const { data: prices } = useLivePrices();
  const state = now ? scheduleSession(now) : undefined;
  const next = now ? nextTransition(now) : undefined;
  return (
    <div className="mt-10 flex h-8 items-center gap-6 overflow-x-auto border-b border-line px-4 text-[11.5px] md:mt-0 md:px-5">
      <div className="flex shrink-0 items-center gap-2">
        {state && <SessionChip session={state.session} />}
        {next && (
          <span className="num text-fg-3">
            {next.to} in <span className="text-fg-2">{fmtDuration(next.in)}</span>
          </span>
        )}
      </div>
      <span className="h-3 w-px shrink-0 bg-line-strong" />
      {Object.keys(MARKETS).map((s) => (
        <span key={s} className="num flex shrink-0 items-center gap-1.5">
          <span className="text-fg-2">{s}</span>
          <span className="text-fg">{prices?.[s] ? prices[s].usd.toFixed(2) : "-"}</span>
        </span>
      ))}
      <span className="num flex shrink-0 items-center gap-1.5">
        <span className="text-fg-2">USDG</span>
        <span className="text-fg">{prices?.USDG ? prices.USDG.usd.toFixed(4) : "-"}</span>
      </span>
    </div>
  );
}

function StatusFooter() {
  const now = useNow();
  const readChain = useReadChain();
  const { gasless } = useAfterglowAccount();
  const { data: block } = useBlockNumber({ watch: true, chainId: readChain });
  const chain = chains.find((c) => c.id === readChain);
  const utc = now ? new Date(now * 1000).toISOString().slice(11, 19) : "--:--:--";
  return (
    <footer className="flex h-8 items-center justify-between gap-4 overflow-x-auto border-t border-line px-4 text-[11px] text-fg-3 md:px-5">
      <div className="flex shrink-0 items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-live" />
          {chain?.name ?? "No network"}
        </span>
        <span className="num">UTC {utc}</span>
        {block !== undefined && <span className="num">#{block.toString()}</span>}
        {gasless && <span className="text-glow">Gas sponsored by ZeroDev</span>}
      </div>
      <span className="shrink-0">Unaudited. Testnet.</span>
    </footer>
  );
}
