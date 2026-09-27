"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AmountCell, Skel, TokenMark } from "@/components/ui/primitives";
import { SessionChip } from "@/components/SessionChip";
import { useMarket } from "@/hooks/useMarket";
import { useLivePrices } from "@/hooks/useLivePrices";
import { MARKETS } from "@/lib/markets";
import { fmt, fmtDate, fmtLtv, fmtPct } from "@/lib/format";
import { compact, maturityLeft } from "./format";

/** Column layout shared by the header and every row. The table shows from `sm` up; phones get stacked cards. */
export const MARKET_GRID =
  "hidden sm:grid grid-cols-[minmax(150px,2fr)_minmax(68px,1fr)_minmax(72px,1fr)_minmax(72px,1fr)_minmax(94px,1fr)_minmax(76px,1fr)_minmax(84px,1fr)_minmax(58px,1fr)_minmax(72px,1fr)_minmax(90px,1fr)_minmax(90px,1fr)] items-center gap-x-3 px-5";

export const MARKET_COLUMNS: { label: string; right?: boolean }[] = [
  { label: "Collateral" },
  { label: "Loan" },
  { label: "Session" },
  { label: "Oracle price", right: true },
  { label: "Borrow limit now", right: true },
  { label: "Weekend LTV", right: true },
  { label: "Liquidation LTV", right: true },
  { label: "Fixed APR", right: true },
  { label: "Maturity", right: true },
  { label: "Liquidity", right: true },
  { label: "Outstanding", right: true },
];

/** One market in the list. Calls useMarket itself; reports its outstanding face for the page total. */
export function MarketRow({
  symbol,
  chainId,
  now,
  hidden,
  onFace,
}: {
  symbol: string;
  chainId: number | undefined;
  now: number | undefined;
  hidden?: boolean;
  onFace: (symbol: string, face: number | undefined) => void;
}) {
  const { data: m } = useMarket(symbol, chainId, now);
  const { data: prices } = useLivePrices();
  const usdgUsd = prices?.USDG?.usd;
  const info = MARKETS[symbol];

  const face = m?.mode === "live" ? m.totalFace : undefined;
  useEffect(() => {
    onFace(symbol, face);
    return () => onFace(symbol, undefined);
  }, [symbol, face, onFace]);

  if (hidden) return null;

  const amount = (n: number | undefined) =>
    n === undefined ? (
      "-"
    ) : (
      <>
        {compact(n)}
        <span className="text-fg-3"> USDG</span>
      </>
    );
  const usd = (n: number | undefined) => (n !== undefined && usdgUsd !== undefined ? `$${compact(n * usdgUsd)}` : undefined);
  const paused = m !== undefined && m.maxLtvBps === 0;
  const limit = m ? (paused ? "Paused" : fmtPct(m.maxLtvBps)) : undefined;

  return (
    <>
    <Link
      href={`/markets/${symbol}`}
      className="block border-t border-line px-4 py-4 transition-colors hover:bg-white/[0.02] sm:hidden"
    >
      <div className="flex items-center gap-2.5">
        <TokenMark symbol={symbol} size={28} />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium text-fg">
            {symbol} <span className="font-normal text-fg-3">/ USDG</span>
          </div>
          <div className="truncate text-[12px] text-fg-3">{info?.name ?? symbol}</div>
        </div>
        {m ? <SessionChip session={m.session} /> : <Skel w={56} h={18} />}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
        <div>
          <dt className="text-fg-3">Oracle price</dt>
          <dd className="num mt-1 text-[13px] text-fg">{m ? fmt(m.price, 2) : <Skel w={50} />}</dd>
        </div>
        <div>
          <dt className="text-fg-3">Borrow limit</dt>
          <dd className={`num mt-1 text-[13px] ${paused ? "text-fg-3" : "text-fg"}`}>{limit ?? <Skel w={40} />}</dd>
        </div>
        <div className="text-right">
          <dt className="text-fg-3">Fixed APR</dt>
          <dd className="num mt-1 text-[13px] text-fg">{m ? `${m.aprPct.toFixed(2)}%` : <Skel w={40} />}</dd>
        </div>
      </dl>
    </Link>
    <Link
      href={`/markets/${symbol}`}
      className={`${MARKET_GRID} border-t border-line py-4 text-[13px] transition-colors hover:bg-white/[0.02]`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <TokenMark symbol={symbol} size={28} />
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium text-fg">{symbol}</div>
          <div className="truncate text-[12px] text-fg-3">{info?.name ?? symbol}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TokenMark symbol="USDG" size={20} />
        <span className="text-fg-2">USDG</span>
      </div>

      <div>{m ? <SessionChip session={m.session} /> : <Skel w={56} h={18} />}</div>

      <div className="num text-right text-fg">{m ? fmt(m.price, 2) : <Skel w={60} />}</div>

      <div className={`num text-right ${paused ? "text-fg-3" : "text-fg"}`}>{limit ?? <Skel w={40} />}</div>

      <div className="num text-right text-glow">{m ? fmtLtv(m.weekendLtvBps) : <Skel w={40} />}</div>

      <div className="num text-right text-halt">{m ? fmtLtv(m.risk.liqLtvBps) : <Skel w={40} />}</div>

      <div className="num text-right text-fg">{m ? `${m.aprPct.toFixed(2)}%` : <Skel w={40} />}</div>

      <div className="num text-right">
        {m ? (
          <>
            <div className="text-fg">{fmtDate(m.maturity)}</div>
            <div className="mt-1 text-[11px] text-fg-3">{maturityLeft(m.maturity, now) ?? ""}</div>
          </>
        ) : (
          <Skel w={64} />
        )}
      </div>

      <div className="flex justify-end text-right">
        {m ? <AmountCell main={amount(m.cash)} sub={usd(m.cash)} /> : <Skel w={64} />}
      </div>

      <div className="flex justify-end text-right">
        {m ? <AmountCell main={amount(m.totalFace)} sub={usd(m.totalFace)} /> : <Skel w={64} />}
      </div>
    </Link>
    </>
  );
}
