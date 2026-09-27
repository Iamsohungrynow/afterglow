"use client";

import { useState } from "react";
import { fmt, fmtDate, fmtPct } from "@/lib/format";
import type { MarketView } from "@/hooks/useMarket";
import type { PositionView } from "@/hooks/usePosition";

type Tab = "Borrowing" | "Lending";

export function BottomPanel({ m, pos, connected }: { m?: MarketView; pos?: PositionView; connected: boolean }) {
  const [tab, setTab] = useState<Tab>("Borrowing");
  const hasBorrow = pos && (pos.collateral > 0 || pos.face > 0);
  const hasLend = pos && (pos.lent > 0 || pos.protectedValue > 0 || pos.boostValue > 0);
  const ltv = pos && m && pos.collateral > 0 ? (pos.debtNow / (pos.collateral * m.price)) * 10_000 : undefined;

  const empty = !connected
    ? "Connect a wallet to see your positions."
    : m?.mode === "preview"
      ? "No Afterglow market on this network yet."
      : tab === "Borrowing"
        ? "No open credit line. Add collateral and borrow from the panel on the right."
        : "No deposits. Lend USDG from the Lend tab.";

  return (
    <section className="flex min-h-[180px] flex-col">
      <div className="flex h-10 items-center gap-6 border-b border-line px-4">
        {(["Borrowing", "Lending"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`relative h-10 text-[12.5px] ${tab === t ? "text-fg" : "text-fg-3 hover:text-fg-2"}`}>
            {t}
            {tab === t && <span className="absolute inset-x-0 bottom-0 h-px bg-glow" />}
          </button>
        ))}
      </div>

      {tab === "Borrowing" && hasBorrow && m ? (
        <Table
          head={["Market", "Collateral", "Value", "Debt today", "Owed at maturity", "LTV", "Liq. price", "Maturity"]}
          rows={[[
            `${m.symbol} / USDG`,
            `${fmt(pos!.collateral, 4)} ${m.symbol}`,
            `${fmt(pos!.collateral * m.price)}`,
            `${fmt(pos!.debtNow)}`,
            `${fmt(pos!.face)}`,
            fmtPct(ltv),
            pos!.collateral > 0 ? fmt(pos!.debtNow / (pos!.collateral * (m.risk.liqLtvBps / 10_000))) : "-",
            fmtDate(m.maturity),
          ]]}
        />
      ) : tab === "Lending" && hasLend && m ? (
        <Table
          head={["Market", "Tranche", "Value", "Target / role", "Maturity"]}
          rows={[
            pos!.protectedValue > 0 && [`${m.symbol} / USDG`, "Protected", `${fmt(pos!.protectedValue)} USDG`, `${m.tranches.seniorAprPct.toFixed(2)}%, paid first`, fmtDate(m.maturity)],
            pos!.boostValue > 0 && [`${m.symbol} / USDG`, "Boost", `${fmt(pos!.boostValue)} USDG`, "Residual, first loss", fmtDate(m.maturity)],
            pos!.lent > 0 && [`${m.symbol} / USDG`, "Pool", `${fmt(pos!.lent)} USDG`, `${m.aprPct.toFixed(2)}% x utilisation`, fmtDate(m.maturity)],
          ].filter((r): r is string[] => Array.isArray(r))}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 py-8 text-[12.5px] text-fg-3">{empty}</div>
      )}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[12.5px]">
        <thead>
          <tr className="text-[11px] text-fg-3">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-line">
              {row.map((c, i) => (
                <td key={i} className={`px-4 py-3 ${i > 1 ? "num" : ""} text-fg`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
