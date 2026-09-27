"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useReadChain } from "@/hooks/useReadChain";
import { useNow } from "@/hooks/useNow";
import { useMarket } from "@/hooks/useMarket";
import { usePosition } from "@/hooks/usePosition";
import { useLivePrices } from "@/hooks/useLivePrices";
import { marketsFor } from "@/lib/markets";
import { useAfterglowAccount } from "./AccountProvider";
import { MarketBar } from "./MarketBar";
import { MarketChartPanel } from "./RiskPanels";
import { ActionPanel } from "./ActionPanel";
import { BottomPanel } from "./BottomPanel";

/**
 * Borrow terminal. Market header on top; chart-style market clock and positions in the center;
 * order panel on the right. Fills the height left by the app shell on desktop, stacks on mobile.
 */
export function Terminal() {
  const now = useNow();
  const { isConnected } = useAccount();
  const { owner } = useAfterglowAccount();
  const readChain = useReadChain();
  const symbols = marketsFor(readChain);
  const [symbol, setSymbol] = useState(symbols[0]);
  useEffect(() => {
    if (!symbols.includes(symbol)) setSymbol(symbols[0]);
  }, [symbols, symbol]);

  const { data: m } = useMarket(symbol, readChain, now);
  const { data: pos, isLoading: posLoading } = usePosition(m, readChain, owner);
  const { data: prices } = useLivePrices();

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-8rem)]">
      <MarketBar symbols={symbols} symbol={symbol} onSelect={setSymbol} m={m} now={now} usdgUsd={prices?.USDG?.usd} />
      {/* Phones stack clock, order panel, then positions; the left column only exists from lg up. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="contents lg:flex lg:min-h-0 lg:min-w-0 lg:flex-col lg:overflow-y-auto">
          <div className="order-1 min-w-0 lg:order-none lg:shrink-0">
            <MarketChartPanel symbol={symbol} m={m} now={now} />
          </div>
          <div className="order-3 flex min-w-0 flex-col border-t border-line lg:order-none lg:flex-1 lg:border-t-0">
            <BottomPanel m={m} pos={pos} connected={isConnected} loading={Boolean(owner) && posLoading} />
          </div>
        </div>
        <div className="order-2 min-h-0 border-line lg:order-none lg:overflow-y-auto lg:border-l">
          <ActionPanel m={m} pos={pos} now={now} symbol={symbol} />
        </div>
      </div>
    </div>
  );
}
