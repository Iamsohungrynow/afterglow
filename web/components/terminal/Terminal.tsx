"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useNow } from "@/hooks/useNow";
import { useMarket } from "@/hooks/useMarket";
import { usePosition } from "@/hooks/usePosition";
import { useLivePrices } from "@/hooks/useLivePrices";
import { marketsFor } from "@/lib/markets";
import { useAfterglowAccount } from "./AccountProvider";
import { TopBar } from "./TopBar";
import { MarketBar } from "./MarketBar";
import { ClockPanel, GapPanel } from "./RiskPanels";
import { ActionPanel } from "./ActionPanel";
import { BottomPanel } from "./BottomPanel";
import { StatusBar } from "./StatusBar";

export function Terminal() {
  const now = useNow();
  const { isConnected } = useAccount();
  const { chainId, owner } = useAfterglowAccount();
  const symbols = marketsFor(isConnected ? chainId : undefined);
  const [symbol, setSymbol] = useState(symbols[0]);
  useEffect(() => {
    if (!symbols.includes(symbol)) setSymbol(symbols[0]);
  }, [symbols, symbol]);

  const { data: m } = useMarket(symbol, isConnected ? chainId : undefined, now);
  const { data: pos } = usePosition(m, chainId, owner);
  const { data: prices } = useLivePrices();

  return (
    <div className="flex min-h-[100dvh] flex-col lg:h-[100dvh]">
      <TopBar />
      <MarketBar symbols={symbols} symbol={symbol} onSelect={setSymbol} m={m} now={now} usdgUsd={prices?.USDG?.usd} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_380px]">
        <div className="flex min-h-0 flex-col lg:overflow-y-auto">
          <ClockPanel m={m} now={now} />
          <div className="border-b border-line">
            <GapPanel symbol={symbol} m={m} />
          </div>
          <BottomPanel m={m} pos={pos} connected={isConnected} />
        </div>
        <div className="border-t border-line lg:border-l lg:border-t-0">
          <ActionPanel m={m} pos={pos} now={now} />
        </div>
      </div>
      <StatusBar m={m} />
    </div>
  );
}
