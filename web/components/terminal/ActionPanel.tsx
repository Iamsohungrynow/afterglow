"use client";

import { ConnectWalletButton } from "@/components/shell/WalletControls";
import { useMemo, useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData, maxUint256, parseUnits } from "viem";
import { ArrowSquareOut, CheckSquare, Lightning, Square } from "@phosphor-icons/react";
import { erc20Abi, marketAbi, tranchesAbi } from "@/lib/abi";
import { explorerTx } from "@/lib/chains";
import { fmt, fmtDays, fmtLtv, fmtPct, fmtPremium } from "@/lib/format";
import { fmtDuration, nextTransition } from "@/lib/session";
import { INDICATIVE_NOTE, boostDisplay, premiumFor, vaultCoverBps, type MarketView } from "@/hooks/useMarket";
import type { PositionView } from "@/hooks/usePosition";
import { useAfterglowAccount, type Call } from "./AccountProvider";

type Tab = "Borrow" | "Repay" | "Lend";

/** Order panel: rate and term chips, Borrow / Repay / Lend, then the form for the chosen tab. */
export function ActionPanel({ m, pos, now, symbol }: { m?: MarketView; pos?: PositionView; now?: number; symbol?: string }) {
  const [tab, setTab] = useState<Tab>("Borrow");
  const term = m && now ? fmtDays(m.maturity, now) : undefined;
  // Label collateral fields before market data arrives, so they never read "Add collateral ()".
  const sym = m?.symbol ?? symbol ?? "stock";
  return (
    <aside className="flex flex-col gap-3 p-3">
      <div className="grid grid-cols-2 gap-2">
        <InfoChip label="Fixed" value={m ? `${m.aprPct.toFixed(2)}%` : undefined} />
        <InfoChip label="Term" value={term} />
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-[8px] border border-line bg-ink-2 p-1">
        {(["Borrow", "Repay", "Lend"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`h-8 rounded-[6px] text-[13px] transition-colors ${
              tab === t ? "bg-white/[0.08] text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]" : "text-fg-3 hover:text-fg-2"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-col pt-1">
        {tab === "Borrow" && <BorrowForm m={m} pos={pos} now={now} sym={sym} />}
        {tab === "Repay" && <RepayForm m={m} pos={pos} sym={sym} />}
        {tab === "Lend" && <LendForm m={m} pos={pos} />}
      </div>
    </aside>
  );
}

function InfoChip({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-line-strong bg-white/[0.03] text-[12px]">
      <span className="text-fg-3">{label}</span>
      {value ? <span className="num text-fg">{value}</span> : <span className="inline-block h-3 w-10 animate-pulse bg-white/[0.06]" />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function BorrowForm({ m, pos, now, sym }: { m?: MarketView; pos?: PositionView; now?: number; sym: string }) {
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
    const premium = premiumFor(m, add);
    return { collateral, value, debt, ltv, maxBorrow, owed, liqPrice, premium };
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
  else if (pos && addColl > pos.wallet.token) blocked = `Not enough ${sym}`;

  // Slider: target loan-to-value on the (existing + added) collateral, capped at today's limit.
  const setLtv = (bps: number) => {
    if (!m || !calc || calc.value <= 0) return;
    const target = (calc.value * bps) / 10_000 - (pos?.debtNow ?? 0);
    const v = Math.floor(Math.max(0, target) * 100) / 100;
    setAmount(v > 0 ? v.toFixed(2) : "");
  };

  return (
    <div className="flex flex-col gap-4">
      <Field
        label={`Add collateral (${sym})`}
        value={coll}
        onChange={setColl}
        hint={pos ? `Wallet ${fmt(pos.wallet.token, 4)}` : undefined}
        onMax={pos ? () => setColl(String(pos.wallet.token)) : undefined}
      />
      <div className="grid gap-3">
        <Field
          label="Borrow (USDG)"
          value={amount}
          onChange={setAmount}
          hint={calc ? `Up to ${fmt(calc.maxBorrow)}` : undefined}
          onMax={calc ? () => setAmount(calc.maxBorrow.toFixed(2)) : undefined}
        />
        {m && calc && <LtvSlider m={m} ltv={calc.ltv} disabled={calc.value <= 0 || m.maxLtvBps <= 0} onChange={setLtv} />}
      </div>

      <div className="grid gap-2">
        <CheckRow on={!overWeekend} label={overWeekend ? "Above the weekend limit" : "Within the weekend limit"} value={m ? fmtLtv(m.weekendLtvBps) : undefined} />
        <CheckRow on label="Fixed rate, locked to maturity" value={m ? `${m.aprPct.toFixed(2)}%` : undefined} />
      </div>

      {overWeekend && (
        <p className="border-l border-glow/60 pl-3 text-[12px] leading-relaxed text-fg-2">
          This loan sits above the {fmtLtv(m?.weekendLtvBps)} weekend limit. It stays safe, but collateral can only be withdrawn over
          the weekend once you are back under it.
        </p>
      )}

      <Submit m={m} blocked={blocked} label={addColl > 0 && add > 0 ? "Deposit and borrow" : addColl > 0 ? "Deposit collateral" : "Borrow"} build={calls} onDone={() => (setColl(""), setAmount(""))} />

      <Summary>
        <Row k="Collateral value" v={calc ? `${fmt(calc.value)} USDG` : "-"} />
        {m?.premiumPpm !== undefined && (
          <Row
            k={`Weekend premium, ${m.weekends ?? 0} × ${fmtPremium(m.premiumPpm)}`}
            v={calc && add > 0 ? `${fmt(calc.premium)} USDG` : "-"}
          />
        )}
        {m?.premiumPpm !== undefined && <Row k="You receive" v={calc && add > 0 ? `${fmt(add - calc.premium)} USDG` : "-"} />}
        <Row k="Owed at maturity" v={calc ? `${fmt(calc.owed)} USDG` : "-"} strong />
        <Row k="Liquidation price" v={calc?.liqPrice ? `${fmt(calc.liqPrice)} USDG` : "-"} />
        <Row k="Weekend LTV" v={m ? fmtLtv(m.weekendLtvBps) : "-"} tone="text-glow" />
      </Summary>

      {m && <SessionNote m={m} now={now} />}
    </div>
  );
}

/** What the current market session means for a borrower, in plain words. */
function SessionNote({ m, now }: { m: MarketView; now?: number }) {
  const next = now ? nextTransition(now) : undefined;
  const text: Record<MarketView["session"], string> = {
    Live: `Market open. In the final four hours before Friday's close the borrow limit glides from ${fmtLtv(m.risk.baseLtvBps)} to ${fmtLtv(m.weekendLtvBps)}.`,
    Closing: `The weekly close is near. The borrow limit is gliding down to ${fmtLtv(m.weekendLtvBps)} so nobody enters the weekend at the edge.`,
    Closed: "Market closed. Repaying and adding collateral still work. Borrowing and liquidations resume after the first new price.",
    Halted: "Pricing is paused (corporate action, sequencer or USDG peg). Only repaying and adding collateral are available.",
  };
  return (
    <div className="border-t border-line pt-3">
      <div className="flex items-center justify-between text-[11px] text-fg-3">
        <span>This weekend</span>
        {next && <span className="num">{next.to} in {fmtDuration(next.in)}</span>}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-fg-2">{text[m.session]}</p>
    </div>
  );
}

function RepayForm({ m, pos, sym }: { m?: MarketView; pos?: PositionView; sym: string }) {
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
    <div className="flex flex-col gap-4">
      <Field label="Repay (USDG)" value={amount} onChange={setAmount} hint={pos ? `Wallet ${fmt(pos.wallet.usdg)}` : undefined} onMax={pos ? () => setAmount(pos.debtNow.toFixed(6)) : undefined} />
      <Field label={`Withdraw collateral (${sym})`} value={withdraw} onChange={setWithdraw} onMax={pos ? () => setWithdraw(String(pos.collateral)) : undefined} />

      <div className="grid gap-2">
        <CheckRow on label="Repay any time, also on weekends" />
        <CheckRow on={full} label={full ? "Closes the loan in full" : "Partial repayment at today's value"} />
      </div>

      <Submit m={m} blocked={blocked} label={pay > 0 && w > 0 ? "Repay and withdraw" : pay > 0 ? "Repay" : "Withdraw"} build={calls} onDone={() => (setAmount(""), setWithdraw(""))} />

      <Summary>
        <Row k="Debt today" v={pos ? `${fmt(pos.debtNow)} USDG` : "-"} strong />
        <Row k="Owed at maturity" v={pos ? `${fmt(pos.face)} USDG` : "-"} />
        <Row k="Collateral" v={pos ? `${fmt(pos.collateral, 4)} ${sym}` : "-"} />
      </Summary>
      <p className="text-[12px] leading-relaxed text-fg-3">Repaying early costs today&apos;s discounted value. Repay is never paused, even on weekends.</p>
    </div>
  );
}

function LendForm({ m, pos }: { m?: MarketView; pos?: PositionView }) {
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"Deposit" | "Withdraw">("Deposit");
  const [tranche, setTranche] = useState<"Protected" | "Boost">("Protected");
  const v = Number(amount) || 0;
  const t = m?.tranches;
  const isSenior = tranche === "Protected";
  const boost = m ? boostDisplay(m) : undefined;
  const held = pos ? (isSenior ? pos.protectedValue : pos.boostValue) : undefined;

  const calls = (owner: `0x${string}`): Call[] => {
    const amt = parseUnits(amount, 6);
    const vault = t!.address!;
    if (mode === "Deposit") {
      return [
        { to: m!.usdg!, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [vault, amt] }) },
        { to: vault, data: encodeFunctionData({ abi: tranchesAbi, functionName: isSenior ? "depositSenior" : "depositJunior", args: [amt, owner] }) },
      ];
    }
    return [{ to: vault, data: encodeFunctionData({ abi: tranchesAbi, functionName: isSenior ? "withdrawSenior" : "withdrawJunior", args: [amt, owner] }) }];
  };

  let blocked: string | undefined;
  if (v <= 0) blocked = "Enter an amount";
  else if (mode === "Withdraw" && held !== undefined && v > held + 1e-6) blocked = `More than your ${tranche} balance`;
  else if (m?.mode === "live" && !t?.address) blocked = "No tranches on this market";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {(["Protected", "Boost"] as const).map((x) => {
          const on = tranche === x;
          const apr = x === "Protected" ? (t ? `${t.seniorAprPct.toFixed(2)}%` : undefined) : boost?.text;
          return (
            <button
              key={x}
              onClick={() => setTranche(x)}
              aria-pressed={on}
              className={`rounded-[8px] border px-3 py-2.5 text-left transition-colors ${on ? "border-glow/40 bg-glow/[0.06]" : "border-line hover:border-line-strong"}`}
            >
              <div className={`text-[12.5px] ${on ? "text-fg" : "text-fg-2"}`}>{x}</div>
              <div className={`num mt-1 text-[16px] ${on ? (x === "Boost" ? "text-glow" : "text-fg") : "text-fg-3"}`}>
                {apr ?? "-"}
              </div>
              <div className="mt-1 text-[11px] text-fg-3">
                {x === "Protected" ? "Paid first, fixed target" : boost?.indicative ? `Indicative, ${INDICATIVE_NOTE}` : "Earns the rest, first loss"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-[8px] border border-line bg-ink-2 p-1">
        {(["Deposit", "Withdraw"] as const).map((x) => (
          <button key={x} onClick={() => setMode(x)} aria-pressed={mode === x} className={`h-7 rounded-[6px] text-[12.5px] transition-colors ${mode === x ? "bg-white/[0.08] text-fg" : "text-fg-3 hover:text-fg-2"}`}>
            {x}
          </button>
        ))}
      </div>
      <Field
        label="Amount (USDG)"
        value={amount}
        onChange={setAmount}
        hint={pos ? (mode === "Deposit" ? `Wallet ${fmt(pos.wallet.usdg)}` : `In ${tranche} ${fmt(held)}`) : undefined}
        onMax={pos ? () => setAmount(String(mode === "Deposit" ? pos.wallet.usdg : (held ?? 0))) : undefined}
      />

      <Submit m={m} blocked={blocked} label={`${mode} ${tranche}`} build={calls} onDone={() => setAmount("")} />

      <YieldSource m={m} />
    </div>
  );
}

/** Where lender yield comes from, and in which order money flows. */
function YieldSource({ m }: { m?: MarketView }) {
  const t = m?.tranches;
  const cover = t ? vaultCoverBps(t) : undefined;
  const empty = t !== undefined && t.coverBps !== undefined && cover === undefined;
  return (
    <div className="border-t border-line pt-3">
      <div className="text-[11px] text-fg-3">Where the yield comes from</div>
      <ol className="mt-2.5 grid gap-2 text-[12px] leading-relaxed text-fg-2">
        <li>
          <span className="num text-fg">1.</span> Borrowers pay a fixed <span className="num text-fg">{m ? `${m.aprPct.toFixed(2)}%` : "-"}</span> on the USDG they borrow, secured by
          over-collateralised {m?.symbol ?? "stock"} tokens
          {m?.premiumPpm !== undefined && (
            <>
              , plus a weekend premium of <span className="num text-fg">{fmtPremium(m.premiumPpm)}</span>, priced by GapGuard from{" "}
              {m.symbol}&apos;s real weekend moves
            </>
          )}
          .
        </li>
        <li>
          <span className="num text-fg">2.</span> Protected is paid first, up to <span className="num text-fg">{t ? `${t.seniorAprPct.toFixed(2)}%` : "-"}</span>.
        </li>
        <li>
          <span className="num text-fg">3.</span> Boost keeps everything above that, weekend premiums included, and takes any loss first
          (for example a Monday gap that leaves bad debt).
        </li>
      </ol>
      <div className="mt-3 flex justify-between text-[11.5px] text-fg-3">
        <span>Boost cover (min {t ? (t.minJuniorBps / 100).toFixed(0) : 20}%)</span>
        <span className="num text-fg-2">{cover !== undefined ? `${(cover / 100).toFixed(1)}%` : empty ? "No deposits yet" : "-"}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Loan-to-value slider from 0 to today's borrow limit; moving it sets the borrow amount. */
function LtvSlider({ m, ltv, disabled, onChange }: { m: MarketView; ltv: number; disabled: boolean; onChange: (bps: number) => void }) {
  const max = Math.max(0, m.maxLtvBps);
  const shown = Number.isFinite(ltv) ? Math.min(Math.max(ltv, 0), max) : max;
  const pct = max > 0 ? (shown / max) * 100 : 0;
  const weekendAt = max > 0 ? Math.min(100, (m.weekendLtvBps / max) * 100) : 0;
  const over = ltv > max;
  const track = disabled ? "rgb(255 255 255 / 0.06)" : `linear-gradient(to right, var(--color-glow) 0 ${pct}%, rgb(255 255 255 / 0.08) ${pct}% 100%)`;

  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span className="text-fg-3">Loan to value</span>
        {max > 0 ? (
          <span className="num">
            <span className={over ? "text-halt" : "text-fg"}>{Number.isFinite(ltv) ? fmtPct(ltv) : "-"}</span>
            <span className="text-fg-3"> / {fmtLtv(max)} now</span>
          </span>
        ) : (
          <span className="text-fg-3">Borrowing paused</span>
        )}
      </div>
      <div className="relative mt-2.5">
        <input
          type="range"
          min={0}
          max={max}
          step={Math.max(1, Math.round(max / 200))}
          value={shown}
          disabled={disabled}
          aria-label="Loan to value"
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ background: track }}
          className="relative z-10 block h-1 w-full cursor-pointer appearance-none rounded-full outline-none disabled:cursor-not-allowed
            [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-ink [&::-moz-range-thumb]:bg-glow
            [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ink [&::-webkit-slider-thumb]:bg-glow [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgb(233_161_94/0.18)]
            focus-visible:[&::-webkit-slider-thumb]:shadow-[0_0_0_5px_rgb(233_161_94/0.3)]
            disabled:[&::-webkit-slider-thumb]:bg-fg-3 disabled:[&::-moz-range-thumb]:bg-fg-3"
        />
        {max > 0 && weekendAt < 100 && (
          <span className="pointer-events-none absolute -top-1 z-20 h-3 w-px bg-fg-2/70" style={{ left: `${weekendAt}%` }} />
        )}
      </div>
      <div className="relative mt-2 h-3 text-[10.5px] text-fg-3">
        <span className="num absolute left-0">0%</span>
        {max > 0 && weekendAt < 88 && weekendAt > 12 && (
          <span className="num absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${weekendAt}%` }}>
            weekend {fmtLtv(m.weekendLtvBps)}
          </span>
        )}
        <span className="num absolute right-0">{max > 0 ? fmtLtv(max) : "Paused"}</span>
      </div>
    </div>
  );
}

function CheckRow({ on, label, value }: { on: boolean; label: string; value?: string }) {
  const Icon = on ? CheckSquare : Square;
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="flex items-center gap-2">
        <Icon size={15} weight={on ? "fill" : "regular"} className={on ? "text-glow" : "text-fg-3"} />
        <span className={on ? "text-fg-2" : "text-fg"}>{label}</span>
      </span>
      {value && <span className="num text-fg-3">{value}</span>}
    </div>
  );
}

function Field({ label, value, onChange, hint, onMax }: { label: string; value: string; onChange: (v: string) => void; hint?: string; onMax?: () => void }) {
  return (
    <label className="grid gap-1.5">
      <span className="flex justify-between gap-2 text-[12px]">
        <span className="text-fg-2">{label}</span>
        {hint && <span className="num truncate text-fg-3">{hint}</span>}
      </span>
      <span className="flex h-10 items-center rounded-[8px] border border-line-strong bg-ink-2 px-3 transition-colors focus-within:border-fg-3 hover:border-white/20">
        <input
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onChange(e.target.value)}
          className="num w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
        />
        {onMax && (
          <button type="button" onClick={onMax} className="ml-2 rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium text-glow transition-colors hover:bg-glow/10">
            MAX
          </button>
        )}
      </span>
    </label>
  );
}

function Summary({ children }: { children: React.ReactNode }) {
  return <dl className="grid gap-2 border-t border-line pt-3 text-[12px]">{children}</dl>;
}

function Row({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-3">{k}</dt>
      <dd className={`num text-right ${tone ?? (strong ? "text-fg" : "text-fg-2")}`}>{v}</dd>
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
      role="checkbox"
      aria-checked={acct.gasless}
      onClick={() => acct.setGasless(!acct.gasless)}
      className="mb-3 flex w-full items-center justify-between text-left text-[12px]"
    >
      <span className="flex items-center gap-2">
        {acct.gasless ? <CheckSquare size={15} weight="fill" className="text-glow" /> : <Square size={15} className="text-fg-3" />}
        <span className={acct.gasless ? "text-fg-2" : "text-fg"}>Gasless, one transaction</span>
      </span>
      <span className="flex items-center gap-1 text-[11px] text-fg-3">
        <Lightning size={11} weight="fill" className={acct.gasless ? "text-glow" : "text-fg-3"} />
        {acct.gasless ? "ZeroDev on" : "off"}
      </span>
    </button>
  );

  const btn = "h-11 w-full whitespace-nowrap rounded-[8px] px-3 text-[14px] font-medium transition active:translate-y-px";
  if (!isConnected) {
    return <ConnectWalletButton variant="block" />;
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
      <button
        disabled={disabled}
        onClick={run}
        className={`${btn} ${disabled ? "cursor-not-allowed bg-white/[0.06] text-fg-3" : "bg-glow text-ink shadow-[0_0_24px_-6px_rgb(233_161_94/0.55)] hover:bg-[#f0b173]"}`}
      >
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
