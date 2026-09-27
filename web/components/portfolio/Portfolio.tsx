"use client";

import { ConnectWalletButton } from "@/components/shell/WalletControls";
import { useCallback, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { Check, Copy, Wallet } from "@phosphor-icons/react";
import { useReadChain } from "@/hooks/useReadChain";
import { useNow } from "@/hooks/useNow";
import { marketsFor } from "@/lib/markets";
import { fmt, short } from "@/lib/format";
import { useAfterglowAccount } from "@/components/terminal/AccountProvider";
import { BigStat, Card, PageHeader, Skel } from "@/components/ui/primitives";
import { MarketProbe, type MarketSummary } from "./MarketProbe";
import { CreditLines, Deposits } from "./PortfolioTables";

export function Portfolio() {
  const { isConnected } = useAccount();
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <PageHeader title="Portfolio" subtitle="Your credit lines and deposits across every Afterglow market, valued at the oracle price." />
      {isConnected ? <Connected /> : <ConnectPrompt />}
    </div>
  );
}

function ConnectPrompt() {
  const { connect, connectors, isPending } = useConnect();
  return (
    <div className="mt-16 flex justify-center">
      <Card className="flex w-full max-w-[420px] flex-col items-center px-8 py-10 text-center">
        <span className="flex size-11 items-center justify-center rounded-full border border-line-strong bg-ink-3 text-fg-2">
          <Wallet size={20} />
        </span>
        <p className="mt-5 text-[14px] leading-relaxed text-fg-2">Connect a wallet to see your collateral, loans and deposits in one place.</p>
        <div className="mt-6 w-full">
          <ConnectWalletButton variant="block" />
        </div>
      </Card>
    </div>
  );
}

function Connected() {
  const now = useNow();
  const readChain = useReadChain();
  const { owner, gasless } = useAfterglowAccount();
  const symbols = marketsFor(readChain);
  const [data, setData] = useState<Record<string, MarketSummary>>({});
  const onData = useCallback((s: MarketSummary) => setData((d) => ({ ...d, [s.symbol]: s })), []);

  const rows = symbols.map((s) => data[s]).filter((r): r is MarketSummary => Boolean(r));
  const loading = !owner || rows.length < symbols.length || rows.some((r) => r.loading);
  const totals = rows.reduce(
    (t, r) => {
      t.collateral += r.collateral * r.price;
      t.debt += r.debtNow;
      t.lent += r.lent + r.protectedValue + r.boostValue;
      return t;
    },
    { collateral: 0, debt: 0, lent: 0 },
  );
  const net = totals.collateral + totals.lent - totals.debt;
  const stat = (v: number) => (loading ? <Skel w={120} h={28} /> : fmt(v));

  return (
    <>
      {symbols.map((s) => (
        <MarketProbe key={`${readChain}-${s}`} symbol={s} chainId={readChain} owner={owner} now={now} onData={onData} />
      ))}

      <OwnerRow owner={owner} gasless={gasless} />

      <div className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
        <BigStat label="Total collateral value" value={stat(totals.collateral)} unit={loading ? undefined : " USDG"} />
        <BigStat label="Total debt today" value={stat(totals.debt)} unit={loading ? undefined : " USDG"} />
        <BigStat label="Total lent" value={stat(totals.lent)} unit={loading ? undefined : " USDG"} />
        <BigStat label="Net value" value={stat(net)} unit={loading ? undefined : " USDG"} />
      </div>

      <div className="mt-10 grid gap-6">
        <CreditLines rows={rows} loading={loading} now={now} />
        <Deposits rows={rows} loading={loading} />
      </div>
    </>
  );
}

function OwnerRow({ owner, gasless }: { owner?: `0x${string}`; gasless: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!owner) return;
    try {
      await navigator.clipboard.writeText(owner);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the address is still visible.
    }
  };
  return (
    <div className="mt-6 flex flex-col gap-2 text-[12.5px] md:flex-row md:items-center md:gap-4">
      <div className="inline-flex items-center gap-2 self-start rounded-full border border-line-strong bg-ink-2 py-1 pl-3.5 pr-1">
        <span className="text-fg-3">{gasless ? "Smart account" : "Wallet"}</span>
        {owner ? <span className="num text-fg">{short(owner)}</span> : <Skel w={96} h={12} />}
        <button
          onClick={copy}
          disabled={!owner}
          aria-label="Copy address"
          className="flex size-7 items-center justify-center rounded-full text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-fg"
        >
          {copied ? <Check size={13} className="text-glow" /> : <Copy size={13} />}
        </button>
      </div>
      <span className="text-fg-3">
        {gasless
          ? "Gasless mode acts through this smart account, so your positions live at this address."
          : "Gasless mode is off, so positions shown are held by your wallet directly."}
      </span>
    </div>
  );
}
