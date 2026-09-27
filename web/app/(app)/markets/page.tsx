"use client";

import { useCallback, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Card, PageHeader } from "@/components/ui/primitives";
import { MARKET_COLUMNS, MARKET_GRID, MarketRow } from "@/components/markets/MarketRow";
import { compact } from "@/components/markets/format";
import { useNow } from "@/hooks/useNow";
import { useReadChain } from "@/hooks/useReadChain";
import { MARKETS, marketsFor } from "@/lib/markets";
import { NO_SCROLLBAR } from "@/lib/format";

export default function MarketsPage() {
  const chainId = useReadChain();
  const now = useNow();
  const symbols = useMemo(() => marketsFor(chainId), [chainId]);
  const [query, setQuery] = useState("");
  const [faces, setFaces] = useState<Record<string, number | undefined>>({});

  const onFace = useCallback((symbol: string, face: number | undefined) => {
    setFaces((prev) => (prev[symbol] === face ? prev : { ...prev, [symbol]: face }));
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q) || (MARKETS[s]?.name ?? "").toLowerCase().includes(q);
  const visible = symbols.filter(matches);

  const liveFaces = symbols.map((s) => faces[s]).filter((f): f is number => f !== undefined);
  const pill = liveFaces.length
    ? { label: "Outstanding loans", value: `${compact(liveFaces.reduce((a, b) => a + b, 0))} USDG` }
    : { label: "Markets", value: String(symbols.length) };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <PageHeader title="Markets" subtitle="Borrow USDG at a fixed rate against tokenized stocks." pill={pill} />

      <Card className="mt-8 overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <label className="relative block w-full max-w-[280px]">
            <span className="sr-only">Filter markets</span>
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by symbol or name"
              className="h-9 w-full rounded-[8px] border border-line bg-ink pl-9 pr-3 text-[13px] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-line-strong"
            />
          </label>
          <span className="num shrink-0 text-[12px] text-fg-3">
            {visible.length} {visible.length === 1 ? "market" : "markets"}
          </span>
        </div>

        <div className={`overflow-x-auto ${NO_SCROLLBAR}`}>
          <div className="sm:min-w-[1090px]">
            <div className={`${MARKET_GRID} border-t border-line py-3 text-[12px] whitespace-nowrap text-fg-3`}>
              {MARKET_COLUMNS.map((c) => (
                <div key={c.label} className={c.right ? "text-right" : ""}>
                  {c.label}
                </div>
              ))}
            </div>

            {symbols.map((s) => (
              <MarketRow key={`${chainId}-${s}`} symbol={s} chainId={chainId} now={now} hidden={!matches(s)} onFace={onFace} />
            ))}

            {visible.length === 0 && (
              <div className="border-t border-line px-5 py-14 text-center text-[13px] text-fg-3">
                {symbols.length === 0 ? "No markets on this network yet." : `No markets match "${query.trim()}".`}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
