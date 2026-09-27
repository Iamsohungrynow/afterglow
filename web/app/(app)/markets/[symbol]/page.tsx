"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { BackLink, BigStat, Card, Chip, Skel, TokenMark, Tabs } from "@/components/ui/primitives";
import { ActionPanel } from "@/components/terminal/ActionPanel";
import { useAfterglowAccount } from "@/components/terminal/AccountProvider";
import { CopyAddress } from "@/components/markets/CopyAddress";
import { MarketTab, RiskTab, WeekendTab } from "@/components/markets/MarketTabs";
import { splitCompact } from "@/components/markets/format";
import { useMarket } from "@/hooks/useMarket";
import { usePosition } from "@/hooks/usePosition";
import { useNow } from "@/hooks/useNow";
import { useReadChain } from "@/hooks/useReadChain";
import { chains } from "@/lib/chains";
import { MARKETS, marketsFor } from "@/lib/markets";
import { fmtDate, fmtLtv, fmtPct } from "@/lib/format";

type Tab = "Market" | "Risk" | "Weekend";

export default function MarketPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(String(params?.symbol ?? "")).toUpperCase();
  const chainId = useReadChain();
  const now = useNow();
  const { owner } = useAfterglowAccount();
  const known = marketsFor(chainId).includes(symbol);
  const { data: m } = useMarket(symbol, chainId, now);
  const { data: pos } = usePosition(m, chainId, owner);
  const [tab, setTab] = useState<Tab>("Market");

  const chain = chains.find((c) => c.id === chainId);
  const info = MARKETS[symbol];

  if (!known || !info) {
    return (
      <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
        <BackLink href="/markets">Markets</BackLink>
        <Card className="mt-6 px-6 py-14 text-center">
          <h1 className="text-[20px] font-medium text-fg">No {symbol || "such"} market here</h1>
          <p className="mx-auto mt-2 max-w-[48ch] text-[13.5px] text-fg-2">
            {chain ? `There is no ${symbol} market on ${chain.name}.` : `There is no ${symbol} market on this network.`} Pick one from
            the list of markets.
          </p>
        </Card>
      </div>
    );
  }

  const outstanding = splitCompact(m?.totalFace);
  const liquidity = splitCompact(m?.cash);
  const explorer = chain && m?.market ? `${chain.blockExplorers.default.url}/address/${m.market}` : undefined;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <BackLink href="/markets">Markets</BackLink>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex items-center gap-3">
              <TokenMark symbol={symbol} size={44} />
              <h1 className="text-[28px] font-medium tracking-[-0.02em] text-fg md:text-[32px]">{symbol}</h1>
            </div>
            <span className="h-8 w-px bg-line-strong" aria-hidden />
            <div className="flex items-center gap-3">
              <TokenMark symbol="USDG" size={44} />
              <span className="text-[28px] font-medium tracking-[-0.02em] text-fg-2 md:text-[32px]">USDG</span>
            </div>
            <Chip>
              <span className="num">
                Liquidation LTV <span className="text-halt">{fmtLtv(m ? m.risk.liqLtvBps : info.risk.liqLtvBps)}</span>
              </span>
            </Chip>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-fg-3">
            <span>{info.name}</span>
            <span className="hidden h-3 w-px bg-line-strong sm:block" aria-hidden />
            {m?.market ? (
              <span className="inline-flex items-center gap-1">
                <CopyAddress address={m.market} />
                {explorer && (
                  <a
                    href={explorer}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View market contract on the explorer"
                    className="inline-flex size-6 items-center justify-center rounded-[6px] text-fg-3 transition-colors hover:bg-white/[0.05] hover:text-fg-2"
                  >
                    <ArrowSquareOut size={13} />
                  </a>
                )}
              </span>
            ) : m?.mode === "preview" ? (
              <span>Preview, priced from Robinhood Chain mainnet feeds</span>
            ) : (
              <Skel w={110} />
            )}
            <span className="hidden h-3 w-px bg-line-strong sm:block" aria-hidden />
            <span>{chain?.name ?? "No network"}</span>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 [&>div>div:nth-child(2)]:text-[24px]">
            <BigStat
              label="Outstanding loans"
              value={m ? outstanding.value : <Skel w={90} h={28} />}
              unit={m && m.totalFace !== undefined ? `${outstanding.suffix} USDG` : undefined}
              sub={m ? `Due ${fmtDate(m.maturity)}` : undefined}
            />
            <BigStat
              label="Liquidity"
              value={m ? liquidity.value : <Skel w={90} h={28} />}
              unit={m && m.cash !== undefined ? `${liquidity.suffix} USDG` : undefined}
              sub={m?.supplyCap !== undefined ? `Cap ${splitCompact(m.supplyCap).value}${splitCompact(m.supplyCap).suffix} USDG` : undefined}
            />
            <BigStat label="Fixed APR" value={m ? m.aprPct.toFixed(2) : <Skel w={70} h={28} />} unit={m ? "%" : undefined} />
            <BigStat
              label="Borrow limit now"
              value={!m ? <Skel w={70} h={28} /> : m.maxLtvBps > 0 ? (m.maxLtvBps / 100).toFixed(1) : <span className="text-fg-3">Paused</span>}
              unit={m && m.maxLtvBps > 0 ? "%" : undefined}
              sub={m ? `${m.session} session` : undefined}
            />
          </div>

          <div className="mt-10">
            <Tabs<Tab> items={["Market", "Risk", "Weekend"]} value={tab} onChange={setTab} />
            <div className="mt-6">
              {tab === "Market" && <MarketTab m={m} now={now} />}
              {tab === "Risk" && <RiskTab m={m} chainId={chainId} now={now} />}
              {tab === "Weekend" && <WeekendTab m={m} symbol={symbol} />}
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden">
            <ActionPanel key={`${chainId}-${symbol}`} symbol={symbol} m={m} pos={pos} now={now} />
          </Card>
        </div>
      </div>
    </div>
  );
}
