"use client";

import { useState } from "react";
import { NO_SCROLLBAR, fmt, fmtDate, fmtPct } from "@/lib/format";
import { TokenMark } from "@/components/ui/primitives";
import type { MarketView } from "@/hooks/useMarket";
import type { PositionView } from "@/hooks/usePosition";

type Tab = "Positions" | "Lending" | "History";

interface Col {
  h: string;
  num?: boolean;
}

export function BottomPanel({
  m,
  pos,
  connected,
  loading,
}: {
  m?: MarketView;
  pos?: PositionView;
  connected: boolean;
  loading?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Positions");
  const hasBorrow = Boolean(pos && (pos.collateral > 0 || pos.face > 0));
  const ltv = pos && m && pos.collateral > 0 ? (pos.debtNow / (pos.collateral * m.price)) * 10_000 : undefined;
  const pair = m ? <Pair symbol={m.symbol} /> : null;

  const lendRows: React.ReactNode[][] =
    pos && m
      ? ([
          pos.protectedValue > 0 && [pair, "Protected", `${fmt(pos.protectedValue)} USDG`, <span key="t"><span className="num">{m.tranches.seniorAprPct.toFixed(2)}%</span>, paid first</span>, fmtDate(m.maturity)],
          pos.boostValue > 0 && [pair, "Boost", `${fmt(pos.boostValue)} USDG`, "Earns the rest, first loss", fmtDate(m.maturity)],
          pos.lent > 0 && [pair, "Pool", `${fmt(pos.lent)} USDG`, <span key="t"><span className="num">{m.aprPct.toFixed(2)}%</span> x utilisation</span>, fmtDate(m.maturity)],
        ] as (React.ReactNode[] | false)[]).filter((r): r is React.ReactNode[] => Array.isArray(r))
      : [];

  const counts: Record<Tab, number | undefined> = {
    Positions: pos ? (hasBorrow ? 1 : 0) : undefined,
    Lending: pos ? lendRows.length : undefined,
    History: undefined,
  };

  const empty = !connected
    ? "Connect a wallet to see your positions."
    : m?.mode === "preview"
      ? "No Afterglow market on this network yet."
      : tab === "Positions"
        ? "No open credit line. Add collateral and borrow from the order panel."
        : tab === "Lending"
          ? "No deposits. Lend USDG from the Lend tab."
          : "Activity appears here after your first transaction.";

  const borrowCols: Col[] = [
    { h: "Market" },
    { h: "Collateral", num: true },
    { h: "Value (USDG)", num: true },
    { h: "Debt today", num: true },
    { h: "Owed at maturity", num: true },
    { h: "LTV", num: true },
    { h: "Liq. price", num: true },
    { h: "Maturity", num: true },
  ];
  const lendCols: Col[] = [{ h: "Market" }, { h: "Tranche" }, { h: "Value", num: true }, { h: "Target / role" }, { h: "Maturity", num: true }];

  let body: React.ReactNode;
  if (connected && loading && tab !== "History") {
    body = <SkeletonTable cols={tab === "Positions" ? borrowCols : lendCols} />;
  } else if (tab === "Positions" && hasBorrow && m && pos) {
    body = (
      <Table
        cols={borrowCols}
        rows={[
          [
            pair,
            `${fmt(pos.collateral, 4)} ${m.symbol}`,
            fmt(pos.collateral * m.price),
            fmt(pos.debtNow),
            fmt(pos.face),
            <span key="ltv" className={ltv !== undefined && ltv > m.maxLtvBps ? "text-glow" : ""}>
              {fmtPct(ltv)}
            </span>,
            pos.collateral > 0 ? fmt(pos.debtNow / (pos.collateral * (m.risk.liqLtvBps / 10_000))) : "-",
            fmtDate(m.maturity),
          ],
        ]}
      />
    );
  } else if (tab === "Lending" && lendRows.length > 0) {
    body = <Table cols={lendCols} rows={lendRows} />;
  } else {
    body = <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-[12.5px] text-fg-3">{empty}</div>;
  }

  return (
    <section className="flex min-h-[200px] flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-5 border-b border-line px-4">
        {(["Positions", "Lending", "History"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative h-9 whitespace-nowrap text-[12.5px] transition-colors ${tab === t ? "text-fg" : "text-fg-3 hover:text-fg-2"}`}
          >
            {t}
            {counts[t] !== undefined && <span className="num"> ({counts[t]})</span>}
            {tab === t && <span className="absolute inset-x-0 bottom-0 h-px bg-glow" />}
          </button>
        ))}
      </div>
      {body}
    </section>
  );
}

function Pair({ symbol }: { symbol: string }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      <TokenMark symbol={symbol} size={18} />
      {symbol} / USDG
    </span>
  );
}

function Table({ cols, rows }: { cols: Col[]; rows: React.ReactNode[][] }) {
  return (
    <div className={`overflow-x-auto ${NO_SCROLLBAR}`}>
      <table className="w-full min-w-[760px] text-[12.5px]">
        <thead>
          <tr className="text-[11px] text-fg-3">
            {cols.map((c) => (
              <th key={c.h} className={`whitespace-nowrap px-4 py-2 font-normal ${c.num ? "text-right" : "text-left"}`}>
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-line transition-colors hover:bg-white/[0.02]">
              {row.map((cell, i) => (
                <td key={i} className={`whitespace-nowrap px-4 py-2.5 text-fg ${cols[i]?.num ? "num text-right" : "text-left"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SkeletonTable({ cols }: { cols: Col[] }) {
  return (
    <Table
      cols={cols}
      rows={[
        cols.map((c, i) => (
          <span key={i} className={`inline-block h-3 animate-pulse bg-white/[0.06] align-middle ${c.num ? "w-16" : "w-24"}`} />
        )),
      ]}
    />
  );
}
