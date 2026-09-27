"use client";

import { useBlockNumber } from "wagmi";
import { chains } from "@/lib/chains";
import type { MarketView } from "@/hooks/useMarket";
import { useAfterglowAccount } from "./AccountProvider";

export function StatusBar({ m }: { m?: MarketView }) {
  const { chainId, gasless } = useAfterglowAccount();
  const { data: block } = useBlockNumber({ watch: true, chainId });
  const chain = chains.find((c) => c.id === chainId);
  return (
    <footer className="flex h-8 items-center justify-between border-t border-line px-4 text-[11px] text-fg-3">
      <div className="flex items-center gap-5">
        <span>
          Phaselock <span className="text-fg-2">{m?.session ?? "-"}</span>
        </span>
        {m?.mode === "preview" && <span className="text-glow">Preview: live Chainlink prices from Robinhood Chain mainnet</span>}
        {gasless && <span>Gas sponsored by ZeroDev</span>}
      </div>
      <div className="num flex items-center gap-5">
        <span>{chain?.name ?? "Not connected"}</span>
        {block !== undefined && <span>#{block.toString()}</span>}
      </div>
    </footer>
  );
}
