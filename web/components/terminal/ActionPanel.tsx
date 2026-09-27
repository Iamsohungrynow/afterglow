"use client";

import { useMemo, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData, maxUint256, parseUnits } from "viem";
import { ArrowSquareOut, Lightning } from "@phosphor-icons/react";
import { erc20Abi, marketAbi } from "@/lib/abi";
import { explorerTx } from "@/lib/chains";
import { fmt, fmtPct } from "@/lib/format";
import { fmtDuration, nextTransition } from "@/lib/session";
import type { MarketView } from "@/hooks/useMarket";
import type { PositionView } from "@/hooks/usePosition";
import { useAfterglowAccount, type Call } from "./AccountProvider";

type Tab = "Borrow" | "Repay" | "Lend";

export function ActionPanel({ m, pos, now }: { m?: MarketView; pos?: PositionView; now?: number }) {
  const [tab, setTab] = useState<Tab>("Borrow");
  return (
    <aside className="flex min-h-0 flex-col">
      <div className="grid grid-cols-3 border-b border-line">
        {(["Borrow", "Repay", "Lend"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative h-11 text-[13px] transition-colors ${tab === t ? "text-fg" : "text-fg-3 hover:text-fg-2"}`}
          >
            {t}
            {tab === t && <span className="absolute inset-x-6 bottom-0 h-px bg-glow" />}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto p-4">
        {tab === "Borrow" && <BorrowForm m={m} pos={pos} now={now} />}
        {tab === "Repay" && <RepayForm m={m} pos={pos} />}
        {tab === "Lend" && <LendForm m={m} pos={pos} />}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------

function BorrowForm({ m, pos, now }: { m?: MarketView; pos?: PositionView; now?: number }) {
  const [coll, setColl] = useState("");
  const [amount, setAmount] = useState("");
  const addColl = Number(coll) || 0;
  const add = Number(amount) || 0;

  const calc = useMemo(() => {
    if (!m) return undefined;
    const collateral = (pos?.collateral ?? 0) + addColl;
    const value = collateral * m.price;
    const debt = (pos?.debtNow ?? 0) + add;
    const ltv = value > 0 ? (debt / value) * 10_000 : debt > 0 ? Infinity : 0;
    const maxBorrow = Math.max(0, (value * m.maxLtvBps) / 10_000 - (pos?.debtNow ?? 0));
    const owed = (pos?.face ?? 0) + add / m.discount;
    const liqPrice = collateral > 0 ? debt / (collateral * (m.risk.liqLtvBps / 10_000)) : undefined;
    return { collateral, value, debt, ltv, maxBorrow, owed, liqPrice };
  }, [m, pos, addColl, add]);

  const open = m?.session === "Live" || m?.session === "Closing";
  const over = calc ? calc.ltv > (m?.maxLtvBps ?? 0) : false;
  const overWeekend = calc && m ? calc.ltv > m.weekendLtvBps && add > 0 : false;
  const next = now ? nextTransition(now) : undefined;

  const calls = (owner: `0x${string}`): Call[] => {
    const out: Call[] = [];
    if (addColl > 0) {
      const amt = parseUnits(coll, 18);
      out.push({ to: m!.token!, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [m!.market!, amt] }) });
      out.push({ to: m!.market!, data: encodeFunctionData({ abi: marketAbi, functionName: "depositCollateral", args: [amt, owner] }) });
    }
    if (add > 0) {
      out.push({ to: m!.market!, data: encodeFunctionData({ abi: marketAbi, functionName: "borrow", args: [parseUnits(amount, 6), owner] }) });
    }
    return out;
  };

  let blocked: string | undefined;
  if (!open && add > 0) blocked = next ? `Borrowing opens in ${fmtDuration(next.in)}` : "Market closed";
  else if (over) blocked = "Above borrow limit";
  else if (addColl <= 0 && add <= 0) blocked = "Enter an amount";
  else if (pos && addColl > pos.wallet.token) blocked = `Not enough ${m?.symbol}`;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Field
        label={`Add collateral (${m?.symbol ?? ""})`}
        value={coll}
        onChange={setColl}
        hint={pos ? `Wallet ${fmt(pos.wallet.token, 4)}` : undefined}
        onMax={pos ? () => setColl(String(pos.wallet.token)) : undefined}
      />
      <Field
        label="Borrow (USDG)"
        value={amount}
        onChange={setAmount}
        hint={calc ? `Up to ${fmt(calc.maxBorrow)}` : undefined}
        onMax={calc ? () => setAmount(calc.maxBorrow.toFixed(2)) : undefined}
      />

      {m && calc && <LtvGauge m={m} ltv={calc.ltv} />}

      <dl className="grid gap-2 border-t border-line pt-4 text-[12.5px]">
        <Row k="Collateral value" v={calc ? `${fmt(calc.value)} USDG` : "-"} />
        <Row k="Owed at maturity" v={calc ? `${fmt(calc.owed)} USDG` : "-"} strong />
        <Row k="Fixed APR" v={m ? `${m.aprPct.toFixed(2)}%` : "-"} />
        <Row k="Liquidation price" v={calc?.liqPrice ? `${fmt(calc.liqPrice)} USDG` : "-"} />
      </dl>

      {overWeekend && (
        <p className="border-l border-glow/60 pl-3 text-[12px] leading-relaxed text-fg-2">
          This loan sits above the {fmtPct(m?.weekendLtvBps)} weekend limit. It stays safe, but collateral can only be withdrawn over
          the weekend once you are back under it.
        </p>
      )}

      <Submit m={m} blocked={blocked} label={addColl > 0 && add > 0 ? "Deposit and borrow" : addColl > 0 ? "Deposit collateral" : "Borrow"} build={calls} onDone={() => (setColl(""), setAmount(""))} />
      {m && <SessionNote m={m} now={now} />}
    </div>
  );
}

/** What the current market session means for a borrower, in plain words. */
function SessionNote({ m, now }: { m: MarketView; now?: number }) {
  const next = now ? nextTransition(now) : undefined;
  const text: Record<MarketView["session"], string> = {
    Live: `Market open. In the final four hours before Friday's close the borrow limit glides from ${fmtPct(m.risk.baseLtvBps, 0)} to ${fmtPct(m.weekendLtvBps)}.`,
    Closing: `The weekly close is near. The borrow limit is gliding down to ${fmtPct(m.weekendLtvBps)} so nobody enters the weekend at the edge.`,
    Closed: "Market closed. Repaying and adding collateral still work. Borrowing and liquidations resume after the first new price.",
    Halted: "Pricing is paused (corporate action, sequencer or USDG peg). Only repaying and adding collateral are available.",
  };
  return (
    <div className="mt-2 border-t border-line pt-4">
      <div className="flex items-center justify-between text-[11px] text-fg-3">
        <span>This weekend</span>
        {next && <span className="num">{next.to} in {fmtDuration(next.in)}</span>}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-fg-2">{text[m.session]}</p>
    </div>
  );
}

function RepayForm({ m, pos }: { m?: MarketView; pos?: PositionView }) {
  const [amount, setAmount] = useState("");
  const [withdraw, setWithdraw] = useState("");
  const pay = Number(amount) || 0;
  const w = Number(withdraw) || 0;
  const full = pos ? pay >= pos.debtNow - 1e-6 && pos.debtNow > 0 : false;

  const calls = (owner: `0x${string}`): Call[] => {
    const out: Call[] = [];
    if (pay > 0 && m && pos) {
      // Debt accrues between quote and inclusion, so allow 0.1% headroom; the market only pulls
      // what the retired face value is worth at that moment.
      const assets = parseUnits(amount, 6);
      const face = full ? maxUint256 : parseUnits((pay / m.discount).toFixed(6), 6);
      out.push({ to: m.usdg!, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [m.market!, assets + assets / 1000n + 10n] }) });
      out.push({ to: m.market!, data: encodeFunctionData({ abi: marketAbi, functionName: "repay", args: [owner, face] }) });
    }
    if (w > 0 && m) {
      out.push({ to: m.market!, data: encodeFunctionData({ abi: marketAbi, functionName: "withdrawCollateral", args: [parseUnits(withdraw, 18), owner] }) });
    }
    return out;
  };

  let blocked: string | undefined;
  if (pay <= 0 && w <= 0) blocked = "Enter an amount";
  else if (m?.session === "Halted" && w > 0) blocked = "Withdrawals paused while halted";
  else if (pos && w > pos.collateral) blocked = "More than your collateral";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <dl className="grid gap-2 text-[12.5px]">
        <Row k="Debt today" v={pos ? `${fmt(pos.debtNow)} USDG` : "-"} strong />
        <Row k="Owed at maturity" v={pos ? `${fmt(pos.face)} USDG` : "-"} />
        <Row k="Collateral" v={pos ? `${fmt(pos.collateral, 4)} ${m?.symbol ?? ""}` : "-"} />
      </dl>
      <Field label="Repay (USDG)" value={amount} onChange={setAmount} hint={pos ? `Wallet ${fmt(pos.wallet.usdg)}` : undefined} onMax={pos ? () => setAmount(pos.debtNow.toFixed(6)) : undefined} />
      <p className="text-[12px] text-fg-3">Repaying early costs today&apos;s discounted value. Repay is never paused, even on weekends.</p>
      <Field label={`Withdraw collateral (${m?.symbol ?? ""})`} value={withdraw} onChange={setWithdraw} onMax={pos ? () => setWithdraw(String(pos.collateral)) : undefined} />
      <div className="mt-auto">
        <Submit m={m} blocked={blocked} label={pay > 0 && w > 0 ? "Repay and withdraw" : pay > 0 ? "Repay" : "Withdraw"} build={calls} onDone={() => (setAmount(""), setWithdraw(""))} />
      </div>
    </div>
  );
}

function LendForm({ m, pos }: { m?: MarketView; pos?: PositionView }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"Deposit" | "Withdraw">("Deposit");
  const v = Number(amount) || 0;
  const util = m?.totalAssets ? (m.totalAssets - (m.cash ?? 0)) / m.totalAssets : 0;

  const calls = (owner: `0x${string}`): Call[] => {
    const amt = parseUnits(amount, 6);
    return mode === "Deposit"
      ? [
          { to: m!.usdg!, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [m!.market!, amt] }) },
          { to: m!.market!, data: encodeFunctionData({ abi: marketAbi, functionName: "deposit", args: [amt, owner] }) },
        ]
      : [{ to: m!.market!, data: encodeFunctionData({ abi: marketAbi, functionName: "withdraw", args: [amt, owner, owner] }) }];
  };

  let blocked: string | undefined;
  if (v <= 0) blocked = "Enter an amount";
  else if (mode === "Withdraw" && pos && v > pos.withdrawable) blocked = "More than available to withdraw";

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-[6px] border border-line p-1">
        {(["Deposit", "Withdraw"] as const).map((x) => (
          <button key={x} onClick={() => setMode(x)} className={`h-8 rounded-[4px] text-[12.5px] ${mode === x ? "bg-white/[0.07] text-fg" : "text-fg-3"}`}>
            {x}
          </button>
        ))}
      </div>
      <Field
        label="Amount (USDG)"
        value={amount}
        onChange={setAmount}
        hint={pos ? (mode === "Deposit" ? `Wallet ${fmt(pos.wallet.usdg)}` : `Available ${fmt(pos.withdrawable)}`) : undefined}
        onMax={pos ? () => setAmount(String(mode === "Deposit" ? pos.wallet.usdg : pos.withdrawable)) : undefined}
      />
      <dl className="grid gap-2 border-t border-line pt-4 text-[12.5px]">
        <Row k="Fixed rate on lent USDG" v={m ? `${m.aprPct.toFixed(2)}%` : "-"} />
        <Row k="Your yield today" v={m ? `${(m.aprPct * util).toFixed(2)}%` : "-"} strong />
        <Row k="Your deposit" v={pos ? `${fmt(pos.lent)} USDG` : "-"} />
      </dl>
      <p className="text-[12px] leading-relaxed text-fg-3">
        Lenders earn the fixed rate on the share of the pool that is lent. Shares accrete to par at maturity; only unlent USDG can be withdrawn early.
      </p>
      <div className="mt-auto">
        <Submit m={m} blocked={blocked} label={mode} build={calls} onDone={() => setAmount("")} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LtvGauge({ m, ltv }: { m: MarketView; ltv: number }) {
  const scale = (bps: number) => `${Math.min(100, (bps / 8500) * 100)}%`;
  const color = ltv > m.risk.liqLtvBps ? "bg-halt" : ltv > m.maxLtvBps ? "bg-glow" : "bg-fg";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-fg-3">Loan to value</span>
        <span className="num text-fg">
          {Number.isFinite(ltv) ? fmtPct(ltv) : "-"} <span className="text-fg-3">/ {fmtPct(m.maxLtvBps)} now</span>
        </span>
      </div>
      <div className="relative mt-2.5 h-1.5">
        <div className="absolute inset-y-0 left-0 bg-white/[0.06]" style={{ width: scale(m.risk.liqLtvBps) }} />
        <div className={`absolute inset-y-0 left-0 transition-[width] duration-300 ${color}`} style={{ width: scale(Number.isFinite(ltv) ? ltv : 0) }} />
        {[
          { v: m.weekendLtvBps, c: "bg-glow" },
          { v: m.maxLtvBps, c: "bg-fg-2" },
          { v: m.risk.liqLtvBps, c: "bg-halt" },
        ].map((t, i) => (
          <span key={i} className={`absolute -top-1 h-3.5 w-px ${t.c}`} style={{ left: scale(t.v) }} />
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-fg-3">
        <span><span className="mr-1 inline-block h-2 w-px bg-glow align-middle" />weekend</span>
        <span><span className="mr-1 inline-block h-2 w-px bg-fg-2 align-middle" />limit now</span>
        <span><span className="mr-1 inline-block h-2 w-px bg-halt align-middle" />liquidation</span>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, hint, onMax }: { label: string; value: string; onChange: (v: string) => void; hint?: string; onMax?: () => void }) {
  return (
    <label className="grid gap-2">
      <span className="flex justify-between text-[12px]">
        <span className="text-fg-2">{label}</span>
        {hint && <span className="num text-fg-3">{hint}</span>}
      </span>
      <span className="flex h-11 items-center rounded-[6px] border border-line-strong bg-ink-2 px-3 focus-within:border-fg-3">
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onChange(e.target.value)}
          className="num w-full bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
        />
        {onMax && (
          <button type="button" onClick={onMax} className="ml-2 text-[11px] font-medium text-glow hover:text-fg">
            MAX
          </button>
        )}
      </span>
    </label>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-fg-3">{k}</dt>
      <dd className={`num ${strong ? "text-fg" : "text-fg-2"}`}>{v}</dd>
    </div>
  );
}

function Submit({ m, blocked, label, build, onDone }: { m?: MarketView; blocked?: string; label: string; build: (owner: `0x${string}`) => Call[]; onDone: () => void }) {
  const { isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const acct = useAfterglowAccount();
  const qc = useQueryClient();
  const [state, setState] = useState<{ busy?: boolean; hash?: string; error?: string }>({});

  const gasRow = acct.gaslessAvailable && (
    <button
      type="button"
      onClick={() => acct.setGasless(!acct.gasless)}
      className="mb-3 flex w-full items-center justify-between rounded-[6px] border border-line px-3 py-2 text-left"
    >
      <span className="flex items-center gap-2 text-[12px]">
        <Lightning size={13} weight="fill" className={acct.gasless ? "text-glow" : "text-fg-3"} />
        <span className={acct.gasless ? "text-fg" : "text-fg-2"}>Gasless, one transaction</span>
      </span>
      <span className="text-[11px] text-fg-3">{acct.gasless ? "ZeroDev on" : "off"}</span>
    </button>
  );

  const btn = "h-11 w-full rounded-[6px] text-[14px] font-medium transition active:translate-y-px";
  if (!isConnected) {
    return (
      <button className={`${btn} bg-fg text-ink hover:bg-white`} onClick={() => connectors[0] && connect({ connector: connectors[0] })}>
        Connect wallet
      </button>
    );
  }
  if (m?.mode === "preview") {
    return (
      <div className="grid gap-2">
        <button disabled className={`${btn} cursor-not-allowed bg-white/[0.06] text-fg-3`}>
          No market on this network
        </button>
        <p className="text-center text-[11.5px] text-fg-3">Switch to Robinhood Chain Testnet once contracts are deployed.</p>
      </div>
    );
  }

  const run = async () => {
    if (!acct.owner) return;
    setState({ busy: true });
    try {
      const hash = await acct.execute(build(acct.owner));
      setState({ hash });
      onDone();
      qc.invalidateQueries();
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      setState({ error: msg.length > 140 ? `${msg.slice(0, 140)}…` : msg });
    }
  };

  const disabled = Boolean(blocked) || state.busy || (acct.gasless && !acct.owner);
  return (
    <div>
      {gasRow}
      <button disabled={disabled} onClick={run} className={`${btn} ${disabled ? "cursor-not-allowed bg-white/[0.06] text-fg-3" : "bg-glow text-ink hover:bg-[#f0b173]"}`}>
        {state.busy ? "Confirm in wallet" : acct.gasless && !acct.owner ? (acct.preparing ? "Preparing smart account" : "Smart account unavailable") : blocked ?? label}
      </button>
      {state.hash && (
        <a href={explorerTx(acct.chainId, state.hash)} target="_blank" rel="noreferrer" className="mt-2 flex items-center justify-center gap-1 text-[12px] text-live">
          Confirmed <ArrowSquareOut size={12} />
        </a>
      )}
      {state.error && <p className="mt-2 text-center text-[12px] leading-snug text-halt">{state.error}</p>}
    </div>
  );
}
