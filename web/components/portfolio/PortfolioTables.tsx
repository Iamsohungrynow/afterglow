"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { MARKETS } from "@/lib/markets";
import { NO_SCROLLBAR, fmt, fmtDate, fmtDays, fmtPct } from "@/lib/format";
import { Card, TokenMark } from "@/components/ui/primitives";
import type { MarketSummary } from "./MarketProbe";

interface Col {
  h: string;
  num?: boolean;
}

export function CreditLines({ rows, loading, now }: { rows: MarketSummary[]; loading: boolean; now?: number }) {
  const lines = rows.filter((r) => r.collateral > 0 || r.face > 0);
  const cols: Col[] = [
    { h: "Market" },
    { h: "Collateral", num: true },
    { h: "Value (USDG)", num: true },
    { h: "Debt today", num: true },
    { h: "Owed at maturity", num: true },
    { h: "LTV", num: true },
    { h: "Liq. price", num: true },
    { h: "Maturity", num: true },
    { h: "" },
  ];
  return (
    <Section title="Credit lines" count={loading ? undefined : lines.length}>
      {loading && lines.length === 0 ? (
        <SkeletonRows cols={cols} />
      ) : lines.length === 0 ? (
        <Empty text="No open credit lines." href="/app" cta="Borrow against a stock token" />
      ) : (
        <Table cols={cols}>
          {lines.map((r) => {
            const value = r.collateral * r.price;
            const ltv = value > 0 ? (r.debtNow / value) * 10_000 : undefined;
            const liq = r.collateral > 0 && r.liqLtvBps > 0 ? r.debtNow / (r.collateral * (r.liqLtvBps / 10_000)) : undefined;
            return (
              <tr key={r.symbol} className="border-t border-line transition-colors hover:bg-white/[0.02]">
                <Td>
                  <Market symbol={r.symbol} />
                </Td>
                <Td num>
                  {fmt(r.collateral, 4)} <span className="text-fg-3">{r.symbol}</span>
                </Td>
                <Td num>{fmt(value)}</Td>
                <Td num>{fmt(r.debtNow)}</Td>
                <Td num>{fmt(r.face)}</Td>
                <Td num>{fmtPct(ltv)}</Td>
                <Td num>{liq !== undefined ? fmt(liq) : "-"}</Td>
                <Td num>
                  {r.maturity ? fmtDate(r.maturity) : "-"}
                  {r.maturity && now ? <span className="ml-1.5 text-fg-3">{fmtDays(r.maturity, now)}</span> : null}
                </Td>
                <Td num>
                  <Manage href="/app" />
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </Section>
  );
}

export function Deposits({ rows, loading }: { rows: MarketSummary[]; loading: boolean }) {
  const deposits = rows.flatMap((r) =>
    [
      r.protectedValue > 0 && {
        key: `${r.symbol}-p`,
        r,
        name: "Protected",
        value: r.protectedValue,
        role: <><span className="num text-fg">{r.seniorAprPct.toFixed(2)}%</span> target, paid first</>,
        href: `/earn/${r.symbol}?t=protected`,
      },
      r.boostValue > 0 && {
        key: `${r.symbol}-b`,
        r,
        name: "Boost",
        value: r.boostValue,
        role: <>Earns the rest, first loss</>,
        href: `/earn/${r.symbol}?t=boost`,
      },
      r.lent > 0 && {
        key: `${r.symbol}-l`,
        r,
        name: "Pool",
        value: r.lent,
        role: <><span className="num text-fg">{r.aprPct.toFixed(2)}%</span> x utilisation</>,
        href: `/earn/${r.symbol}`,
      },
    ].filter((d): d is Exclude<typeof d, false> => Boolean(d)),
  );
  const cols: Col[] = [{ h: "Market" }, { h: "Tranche" }, { h: "Value (USDG)", num: true }, { h: "Target or role" }, { h: "Maturity", num: true }, { h: "" }];

  return (
    <Section title="Deposits" count={loading ? undefined : deposits.length}>
      {loading && deposits.length === 0 ? (
        <SkeletonRows cols={cols} />
      ) : deposits.length === 0 ? (
        <Empty text="No deposits yet." href="/earn" cta="Earn a fixed yield on USDG" />
      ) : (
        <Table cols={cols}>
          {deposits.map((d) => (
            <tr key={d.key} className="border-t border-line transition-colors hover:bg-white/[0.02]">
              <Td>
                <Market symbol={d.r.symbol} />
              </Td>
              <Td>
                <span className={d.name === "Boost" ? "text-glow" : "text-fg"}>{d.name}</span>
              </Td>
              <Td num>{fmt(d.value)}</Td>
              <Td>
                <span className="text-fg-2">{d.role}</span>
              </Td>
              <Td num>{d.r.maturity ? fmtDate(d.r.maturity) : "-"}</Td>
              <Td num>
                <Manage href={d.href} />
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex h-12 items-center gap-2 border-b border-line px-5">
        <h2 className="text-[14px] font-medium text-fg">{title}</h2>
        {count !== undefined && <span className="num rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-fg-3">{count}</span>}
      </div>
      {children}
    </Card>
  );
}

function Table({ cols, children }: { cols: Col[]; children: React.ReactNode }) {
  return (
    <div className={`overflow-x-auto ${NO_SCROLLBAR}`}>
      <table className="w-full min-w-[860px] text-[13px]">
        <thead>
          <tr className="text-[11.5px] text-fg-3">
            {cols.map((c, i) => (
              <th key={i} className={`whitespace-nowrap px-5 py-3 font-normal ${c.num ? "text-right" : "text-left"}`}>
                {c.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ num, children }: { num?: boolean; children: React.ReactNode }) {
  return <td className={`whitespace-nowrap px-5 py-3.5 text-fg ${num ? "num text-right" : "text-left"}`}>{children}</td>;
}

function Market({ symbol }: { symbol: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <TokenMark symbol={symbol} size={24} />
      <span>
        <span className="block leading-tight">{symbol} / USDG</span>
        <span className="block text-[11.5px] leading-tight text-fg-3">{MARKETS[symbol]?.name}</span>
      </span>
    </span>
  );
}

function Manage({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-line-strong px-3 font-sans text-[12.5px] text-fg-2 transition-colors hover:border-white/25 hover:text-fg"
    >
      Manage <ArrowRight size={12} />
    </Link>
  );
}

function Empty({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-[13px] text-fg-2">{text}</p>
      <Link href={href} className="inline-flex items-center gap-1.5 text-[12.5px] text-glow transition-colors hover:text-fg">
        {cta} <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function SkeletonRows({ cols }: { cols: Col[] }) {
  return (
    <Table cols={cols}>
      {[0, 1].map((r) => (
        <tr key={r} className="border-t border-line">
          {cols.map((c, i) => (
            <Td key={i} num={c.num}>
              {c.h ? <span className={`inline-block h-3.5 animate-pulse rounded-[4px] bg-white/[0.06] align-middle ${c.num ? "w-16" : "w-28"}`} /> : null}
            </Td>
          ))}
        </tr>
      ))}
    </Table>
  );
}
