"use client";

import { Suspense, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Copy } from "@phosphor-icons/react";
import { BackLink, BigStat, Card, Chip, Skel, Tabs, TokenMark } from "@/components/ui/primitives";
import { Segmented } from "@/components/earn/Segmented";
import { TrancheActionCard } from "@/components/earn/TrancheActionCard";
import { useReadChain } from "@/hooks/useReadChain";
import { useNow } from "@/hooks/useNow";
import { boostAprPct, useMarket, type MarketView } from "@/hooks/useMarket";
import { MARKETS, deploymentFor, gapModel } from "@/lib/markets";
import { chains } from "@/lib/chains";
import { daysLeft, fmt, fmtDate, fmtPct, short } from "@/lib/format";

type Tranche = "protected" | "boost";
const CONTAINER = "mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6";

export default function VaultPage() {
  return (
    <Suspense
      fallback={
        <div className={CONTAINER}>
          <Skel w={80} h={12} />
          <div className="mt-6">
            <Skel w={320} h={36} />
          </div>
        </div>
      }
    >
      <VaultDetail />
    </Suspense>
  );
}

function VaultDetail() {
  const params = useParams<{ symbol: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const symbol = decodeURIComponent(params.symbol ?? "").toUpperCase();
  const tranche: Tranche = search.get("t") === "boost" ? "boost" : "protected";
  const chainId = useReadChain();
  const now = useNow();
  const { data: m } = useMarket(symbol, chainId, now);
  const [tab, setTab] = useState<"Overview" | "Risk">("Overview");

  if (!MARKETS[symbol]) {
    return (
      <div className={CONTAINER}>
        <BackLink href="/earn">Earn</BackLink>
        <h1 className="mt-6 text-[28px] font-medium text-fg">No vault for {symbol || "this market"}</h1>
        <p className="mt-2 text-[14px] text-fg-2">Pick a vault from the Earn list.</p>
      </div>
    );
  }

  const isP = tranche === "protected";
  const name = isP ? "Protected" : "Boost";
  const dep = chainId ? deploymentFor(chainId) : undefined;
  const entry = dep?.markets[symbol];
  const vaultAddr = (isP ? entry?.protectedToken : entry?.boostToken) ?? m?.tranches.address;
  const chain = chains.find((c) => c.id === chainId);
  const t = m?.tranches;
  const value = isP ? t?.seniorValue : t?.juniorValue;
  const boost = m ? boostAprPct(m) : undefined;
  const apy = isP ? t?.seniorAprPct : boost;
  const util = m?.totalAssets ? (m.totalAssets - (m.cash ?? 0)) / m.totalAssets : undefined;

  const setTranche = (v: Tranche) => router.replace(`/earn/${symbol}?t=${v}`, { scroll: false });

  return (
    <div className={CONTAINER}>
      <div className="grid gap-10 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0">
          <BackLink href="/earn">Earn</BackLink>

          <div className="mt-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <TokenMark symbol="USDG" size={44} />
              <h1 className="text-[26px] font-medium tracking-[-0.02em] text-fg md:text-[30px]">
                Afterglow {name} {symbol}
              </h1>
            </div>
            <Segmented
              items={["Protected", "Boost"]}
              value={name}
              onChange={(v) => setTranche(v === "Boost" ? "boost" : "protected")}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-fg-3">
            <Chip tone={isP ? "neutral" : "glow"}>{isP ? "Paid first" : "First loss"}</Chip>
            {vaultAddr ? <CopyAddress address={vaultAddr} /> : <span>{m?.mode === "preview" ? "Not deployed on this network" : "Vault address unavailable"}</span>}
            <span>{chain?.name ?? "No network"}</span>
            {m?.mode === "preview" && <span>Preview with live mainnet prices</span>}
          </div>

          <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
            <BigStat
              label="Tranche deposits"
              value={value === undefined ? (m ? "-" : <Skel w={90} h={26} />) : fmt(value)}
              sub="USDG"
            />
            <BigStat
              label={isP ? "APY, target" : "APY, estimated"}
              value={apy === undefined ? (m ? (isP ? "-" : "residual") : <Skel w={70} h={26} />) : apy.toFixed(2)}
              unit={apy === undefined ? undefined : "%"}
              sub={isP ? "Paid before Boost" : "What is left after Protected"}
            />
            <BigStat
              label="Vault cover"
              value={t?.coverBps === undefined ? (m ? "-" : <Skel w={70} h={26} />) : (t.coverBps / 100).toFixed(1)}
              unit={t?.coverBps === undefined ? undefined : "%"}
              sub={t ? `Boost share, min ${fmtPct(t.minJuniorBps, 0)}` : undefined}
            />
            <BigStat
              label="Pool utilisation"
              value={util === undefined ? (m ? "-" : <Skel w={70} h={26} />) : (util * 100).toFixed(1)}
              unit={util === undefined ? undefined : "%"}
              sub={m?.totalAssets !== undefined ? `${fmt(m.totalAssets - (m.cash ?? 0), 0)} of ${fmt(m.totalAssets, 0)} lent` : undefined}
            />
          </div>

          {m ? <Waterfall m={m} tranche={tranche} util={util} /> : <Card className="mt-10 h-[220px] animate-pulse">{null}</Card>}

          <div className="mt-10">
            <Tabs items={["Overview", "Risk"]} value={tab} onChange={setTab} />
            <div className="pt-6">{m ? tab === "Overview" ? <Overview m={m} tranche={tranche} now={now} /> : <Risk m={m} /> : <Skel w={240} />}</div>
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <TrancheActionCard m={m} tranche={tranche} chainId={chainId} />
        </div>
      </div>
    </div>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-fg-3">Vault</span>
      <span className="num text-fg-2">{short(address)}</span>
      <button
        type="button"
        aria-label="Copy vault address"
        onClick={() => {
          navigator.clipboard?.writeText(address).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1400);
          });
        }}
        className="rounded-[6px] p-1 text-fg-3 transition hover:bg-white/[0.05] hover:text-fg-2"
      >
        {done ? <Check size={13} className="text-live" /> : <Copy size={13} />}
      </button>
    </span>
  );
}

/** Borrowers pay a fixed rate; Protected takes its target first; Boost keeps the remainder. */
function Waterfall({ m, tranche, util }: { m: MarketView; tranche: Tranche; util: number | undefined }) {
  const t = m.tranches;
  const hasVals = t.seniorValue !== undefined && t.juniorValue !== undefined;
  const total = hasVals ? t.seniorValue! + t.juniorValue! : undefined;
  const lent = total !== undefined && util !== undefined ? total * util : undefined;
  const income = lent !== undefined ? lent * (m.aprPct / 100) : undefined;
  const seniorDue = t.seniorValue !== undefined ? t.seniorValue * (t.seniorAprPct / 100) : undefined;
  const seniorPaid = income !== undefined && seniorDue !== undefined ? Math.min(income, seniorDue) : undefined;
  const boostIncome = income !== undefined && seniorDue !== undefined ? income - seniorDue : undefined;
  const boost = boostAprPct(m);
  const pShare = income && seniorPaid !== undefined ? Math.max(0, Math.min(1, seniorPaid / income)) : undefined;

  const step = (active: boolean) =>
    `flex-1 rounded-[10px] border p-4 ${active ? "border-glow/35 bg-glow/[0.04]" : "border-line bg-ink"}`;
  const arrow = <ArrowRight size={16} className="mx-auto shrink-0 rotate-90 text-fg-3 md:rotate-0" aria-hidden />;

  return (
    <Card className="mt-10 p-5 md:p-6">
      <h2 className="text-[15px] text-fg">Where the yield comes from</h2>
      <p className="mt-1 text-[13px] text-fg-2">
        Yearly figures at today&apos;s utilisation. Borrowers pay a fixed rate, and the vault splits it in order.
      </p>

      <div className="mt-5 flex flex-col items-stretch gap-2 md:flex-row md:items-center">
        <div className={step(false)}>
          <div className="text-[12px] text-fg-3">Borrowers pay</div>
          <div className="num mt-1.5 text-[22px] text-fg">{m.aprPct.toFixed(2)}%</div>
          <div className="num mt-1.5 text-[12px] leading-snug text-fg-2">
            fixed on {lent === undefined ? "lent USDG" : `${fmt(lent, 0)} USDG lent`}
            {income !== undefined && <span className="block text-fg-3">{fmt(income, 0)} USDG a year</span>}
          </div>
        </div>
        {arrow}
        <div className={step(tranche === "protected")}>
          <div className="text-[12px] text-fg-3">Protected, paid first</div>
          <div className="num mt-1.5 text-[22px] text-fg">{t.seniorAprPct.toFixed(2)}%</div>
          <div className="num mt-1.5 text-[12px] leading-snug text-fg-2">
            target on {t.seniorValue === undefined ? "Protected deposits" : `${fmt(t.seniorValue, 0)} USDG`}
            {seniorDue !== undefined && <span className="block text-fg-3">{fmt(seniorDue, 0)} USDG a year</span>}
          </div>
        </div>
        {arrow}
        <div className={step(tranche === "boost")}>
          <div className="text-[12px] text-fg-3">Boost keeps the rest</div>
          <div className="num mt-1.5 text-[22px] text-glow">{boost === undefined ? "residual" : `${boost.toFixed(2)}%`}</div>
          <div className="num mt-1.5 text-[12px] leading-snug text-fg-2">
            on {t.juniorValue === undefined ? "Boost deposits" : `${fmt(t.juniorValue, 0)} USDG`}, takes losses first
            {boostIncome !== undefined && <span className="block text-fg-3">{fmt(boostIncome, 0)} USDG a year</span>}
          </div>
        </div>
      </div>

      {pShare !== undefined && (
        <div className="mt-5">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full bg-fg-2" style={{ width: `${pShare * 100}%` }} />
            <div className="h-full bg-glow" style={{ width: `${(1 - pShare) * 100}%` }} />
          </div>
          <div className="num mt-2 flex justify-between text-[12px] text-fg-3">
            <span>Protected {(pShare * 100).toFixed(0)}% of income</span>
            <span className="text-glow">Boost {((1 - pShare) * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
      {boostIncome !== undefined && boostIncome < 0 && (
        <p className="mt-3 text-[12.5px] leading-snug text-fg-2">
          Pool income is below the Protected target right now, so the gap of {fmt(-boostIncome, 0)} USDG a year comes out of Boost.
        </p>
      )}
      {!hasVals && (
        <p className="mt-4 text-[12.5px] text-fg-3">Deposit figures appear once the vault is live on this network. Rates shown are the configured ones.</p>
      )}
    </Card>
  );
}

function Group({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <Card className="p-4">
      <h3 className="text-[13px] text-fg">{title}</h3>
      <dl className="mt-3 grid gap-2.5 text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-fg-3">{k}</dt>
            <dd className="num text-right text-fg-2">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Overview({ m, tranche, now }: { m: MarketView; tranche: Tranche; now: number | undefined }) {
  const t = m.tranches;
  const info = MARKETS[m.symbol];
  return (
    <div>
      <p className="max-w-[68ch] text-[14px] leading-relaxed text-fg-2">
        {tranche === "protected"
          ? `Protected earns a fixed target of ${t.seniorAprPct.toFixed(2)}% a year and is paid before Boost. It only loses money if losses in the pool are larger than the whole Boost tranche.`
          : `Boost earns whatever the pool makes above the Protected target, which can be well above the borrower rate when the pool is busy. In exchange it takes any loss first. It must stay at least ${fmtPct(t.minJuniorBps, 0)} of the vault, so withdrawals that would push it lower wait for new Boost money or for Protected to leave.`}{" "}
        All USDG is lent to {info?.name ?? m.symbol} borrowers in the {m.symbol} market. Withdrawals are paid from idle USDG in the pool; money out on loan returns at maturity.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Group
          title="Loan terms"
          rows={[
            ["Fixed borrower APR", `${m.aprPct.toFixed(2)}%`],
            ["Maturity", now === undefined ? fmtDate(m.maturity) : `${fmtDate(m.maturity)}, ${daysLeft(m.maturity, now).toFixed(0)} days`],
            ["Collateral", `${m.symbol}, ${info?.name ?? ""}`],
            ["Collateral price", `${fmt(m.price)} USDG`],
          ]}
        />
        <Group
          title="Limits"
          rows={[
            ["Max borrow LTV, weekdays", fmtPct(m.risk.baseLtvBps, 0)],
            ["Max borrow LTV, weekends", fmtPct(m.risk.weekendLtvBps, 0)],
            ["Liquidation LTV", fmtPct(m.risk.liqLtvBps, 0)],
            ["Minimum Boost cover", fmtPct(t.minJuniorBps, 0)],
          ]}
        />
      </div>
    </div>
  );
}

function Risk({ m }: { m: MarketView }) {
  const t = m.tranches;
  const info = MARKETS[m.symbol];
  const { buffer } = gapModel(info?.gaps ?? [], m.risk.liqLtvBps);
  const worst = info?.gaps.length ? Math.min(...info.gaps) : undefined;
  const dropToLiq = (1 - m.weekendLtvBps / m.risk.liqLtvBps) * 10_000;
  const dropToLoss = (1 - m.weekendLtvBps / 10_000) * 10_000;
  const bonus = m.risk.liqBonusBps;
  const shortfallLtv = (10_000 / (10_000 + bonus)) * 10_000;
  const absorbs =
    t.juniorValue !== undefined ? `Boost currently absorbs the first ${fmt(t.juniorValue, 0)} USDG of any loss.` : `Boost absorbs losses up to its share of the vault.`;

  const items: { title: string; body: string; who: string }[] = [
    {
      title: "Weekend gaps beyond the buffer",
      body: `Stocks do not trade over the weekend, so the price can jump at the Monday open with no chance to liquidate. Before the close, borrowing is capped at ${fmtPct(m.weekendLtvBps, 0)} LTV, which leaves room for a ${fmtPct(dropToLiq)} drop before liquidation (${fmtPct(m.risk.liqLtvBps, 0)}) and a ${fmtPct(dropToLoss)} drop before a loan is worth less than its debt. The gap model buffer for ${m.symbol} is ${fmtPct(buffer)}${worst !== undefined ? `, and the largest weekend drop in the sample was ${fmtPct(Math.abs(Math.min(worst, 0)))}` : ""}.`,
      who: "Boost first, then Protected",
    },
    {
      title: "Liquidation shortfall",
      body: `Liquidators repay debt and take collateral at a ${fmtPct(bonus, 0)} discount. That covers the debt while a loan is below about ${fmtPct(shortfallLtv, 0)} LTV. If the price falls fast enough that a loan passes that point before anyone liquidates it, the difference is a loss to the pool.`,
      who: "Boost first, then Protected",
    },
    {
      title: "USDG depeg halts the market",
      body: `If USDG trades more than 2% away from $1, or a price feed goes stale, the oracle halts the market. No new loans and no liquidations happen until it recovers, so a price move during a halt can grow losses, and lent USDG stays out until trading resumes.`,
      who: "Both tranches; losses land on Boost first",
    },
  ];

  return (
    <div>
      <ul className="grid gap-3">
        {items.map((it) => (
          <li key={it.title} className="rounded-[10px] border border-line bg-ink-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[14px] text-fg">{it.title}</h3>
              <span className="text-[12px] text-fg-3">Who pays: {it.who}</span>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-fg-2">{it.body}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] text-fg-2">
        {absorbs} Protected loses money only after that is used up. The contracts are unaudited and run on testnet.
      </p>
    </div>
  );
}
