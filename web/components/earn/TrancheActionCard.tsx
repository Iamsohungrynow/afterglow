"use client";

import { ConnectWalletButton } from "@/components/shell/WalletControls";
import { useState } from "react";
import { useAccount, useConnect } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData, parseUnits } from "viem";
import { ArrowSquareOut, Lightning } from "@phosphor-icons/react";
import { Card } from "@/components/ui/primitives";
import { Segmented } from "@/components/earn/Segmented";
import { useAfterglowAccount, type Call } from "@/components/terminal/AccountProvider";
import { usePosition } from "@/hooks/usePosition";
import { INDICATIVE_NOTE, boostDisplay, type MarketView } from "@/hooks/useMarket";
import { erc20Abi, tranchesAbi } from "@/lib/abi";
import { explorerTx } from "@/lib/chains";
import { fmt, fmtPct } from "@/lib/format";

type Mode = "Deposit" | "Withdraw";

/** Deposit into or withdraw from one tranche of a market's AfterglowTranches vault. */
export function TrancheActionCard({ m, tranche, chainId }: { m?: MarketView; tranche: "protected" | "boost"; chainId: number | undefined }) {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const acct = useAfterglowAccount();
  const qc = useQueryClient();
  const { data: pos } = usePosition(m, chainId, acct.owner);
  const [mode, setMode] = useState<Mode>("Deposit");
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<{ busy?: boolean; hash?: string; error?: string }>({});

  const isP = tranche === "protected";
  const name = isP ? "Protected" : "Boost";
  const t = m?.tranches;
  const trancheBal = isP ? pos?.protectedValue : pos?.boostValue;
  const balance = mode === "Deposit" ? pos?.wallet.usdg : trancheBal;
  const amt = Number(amount);
  const valid = amount !== "" && Number.isFinite(amt) && amt > 0;

  // Cover (Boost share of the vault) after this action, to catch the contract's min-cover rule early.
  const s = t?.seniorValue;
  const j = t?.juniorValue;
  let coverAfter: number | undefined;
  if (s !== undefined && j !== undefined) {
    const d = valid ? amt : 0;
    const ns = isP ? s + (mode === "Deposit" ? d : -d) : s;
    const nj = isP ? j : j + (mode === "Deposit" ? d : -d);
    // An empty vault has no cover to speak of; show "-" rather than the contract's 100%.
    coverAfter = ns + nj > 0 ? (Math.max(nj, 0) / (ns + nj)) * 10_000 : undefined;
  }
  const boost = m ? boostDisplay(m) : undefined;
  const apyText = isP ? (t ? `${t.seniorAprPct.toFixed(2)}%` : "-") : (boost?.text ?? "-");

  let blocked: string | undefined;
  if (valid && balance !== undefined && amt > balance + 1e-9) blocked = mode === "Deposit" ? "Not enough USDG" : "More than your balance";
  else if (valid && mode === "Withdraw" && m?.cash !== undefined && amt > m.cash) blocked = "Not enough idle USDG in the pool";
  else if (
    valid &&
    t &&
    coverAfter !== undefined &&
    coverAfter < t.minJuniorBps &&
    ((isP && mode === "Deposit") || (!isP && mode === "Withdraw" && (s ?? 0) > 0))
  )
    blocked = `Vault cover would fall below ${fmtPct(t.minJuniorBps, 0)}`;

  const unavailable = !m ? "Loading market" : m.mode === "preview" || !t?.address ? "Not deployed on this network" : undefined;

  const build = (): Call[] => {
    const tAddr = t!.address!;
    const value = parseUnits(amount, 6);
    const owner = acct.owner!;
    if (mode === "Deposit") {
      return [
        { to: m!.usdg!, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [tAddr, value] }) },
        {
          to: tAddr,
          data: encodeFunctionData({ abi: tranchesAbi, functionName: isP ? "depositSenior" : "depositJunior", args: [value, owner] }),
        },
      ];
    }
    return [
      {
        to: tAddr,
        data: encodeFunctionData({ abi: tranchesAbi, functionName: isP ? "withdrawSenior" : "withdrawJunior", args: [value, owner] }),
      },
    ];
  };

  const run = async () => {
    if (!acct.owner || !valid) return;
    setState({ busy: true });
    try {
      const hash = await acct.execute(build());
      setState({ hash });
      setAmount("");
      qc.invalidateQueries();
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      setState({ error: msg.length > 140 ? `${msg.slice(0, 140)}...` : msg });
    }
  };

  const btn = "h-11 w-full rounded-[8px] text-[14px] font-medium transition active:translate-y-px";
  const off = "cursor-not-allowed bg-white/[0.06] text-fg-3";

  let action: React.ReactNode;
  if (!isConnected) {
    action = (
      <ConnectWalletButton variant="block" />
    );
  } else if (unavailable) {
    action = (
      <div className="grid gap-2">
        <button disabled className={`${btn} ${off}`}>
          {unavailable}
        </button>
        {m && (
          <p className="text-center text-[12px] leading-snug text-fg-3">
            This vault only exists on Robinhood Chain Testnet. Switch network to deposit.
          </p>
        )}
      </div>
    );
  } else {
    const needOwner = acct.gasless && !acct.owner;
    const canRetry = needOwner && !acct.preparing;
    const disabled = !canRetry && (!valid || Boolean(blocked) || state.busy || needOwner);
    const label = state.busy
      ? "Confirm in wallet"
      : needOwner
        ? acct.preparing
          ? "Preparing smart account…"
          : "Retry smart account"
        : blocked ?? (valid ? `${mode} ${fmt(amt)} USDG` : "Enter an amount");
    action = (
      <>
        <button disabled={disabled} onClick={canRetry ? acct.retrySmart : run} className={`${btn} ${disabled ? off : "bg-glow text-ink hover:bg-[#f0b173]"}`}>
          {label}
        </button>
        {canRetry && acct.smartError && (
          <p className="text-center text-[12px] leading-snug text-halt">Smart account: {acct.smartError.slice(0, 140)}</p>
        )}
      </>
    );
  }

  return (
    <Card className="min-w-0 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] text-fg">
          {name} {m?.symbol}
        </h2>
        <Segmented
          items={["Deposit", "Withdraw"] as Mode[]}
          value={mode}
          onChange={(v) => {
            setMode(v);
            setAmount("");
            setState({});
          }}
        />
      </div>

      <div className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <label htmlFor="tranche-amount" className="text-[12.5px] text-fg-2">
            {mode === "Deposit" ? "Amount to deposit" : "Amount to withdraw"}
          </label>
          <span className="num text-[12px] text-fg-3">
            {mode === "Deposit" ? "Wallet" : "In vault"} {balance === undefined ? "-" : fmt(balance)} USDG
          </span>
        </div>
        <div className="mt-2 flex h-12 items-center gap-2 rounded-[8px] border border-line-strong bg-ink px-3 focus-within:border-fg-3">
          <input
            id="tranche-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (/^\d*\.?\d{0,6}$/.test(v)) setAmount(v);
              setState((st) => (st.busy ? st : {}));
            }}
            className="num min-w-0 flex-1 bg-transparent text-[18px] text-fg placeholder:text-fg-3 outline-none"
          />
          <span className="shrink-0 text-[12.5px] text-fg-3">USDG</span>
          <button
            type="button"
            disabled={!balance}
            onClick={() => balance && setAmount((Math.floor(balance * 1e6) / 1e6).toString())}
            className="shrink-0 rounded-[6px] border border-line-strong px-2 py-1 text-[11px] text-fg-2 transition hover:text-fg disabled:opacity-40"
          >
            MAX
          </button>
        </div>
      </div>

      <dl className="mt-5 grid gap-2.5 text-[12.5px]">
        <Row
          k={isP ? "Target APY" : boost?.indicative ? `Indicative APY, ${INDICATIVE_NOTE}` : "Estimated APY"}
          v={apyText}
          tone={isP ? undefined : "text-glow"}
        />
        <Row k="Role" v={isP ? "Paid first" : "First loss"} />
        <Row k="Your position" v={trancheBal === undefined ? "-" : `${fmt(trancheBal)} USDG`} />
        <Row k="Vault cover after" v={coverAfter === undefined ? "-" : fmtPct(coverAfter)} />
        {mode === "Withdraw" && <Row k="Idle USDG in pool" v={m?.cash === undefined ? "-" : fmt(m.cash)} />}
        {mode === "Deposit" && <Row k="Transactions" v={acct.gasless ? "1, approve and deposit batched" : "2, approve then deposit"} />}
      </dl>

      <div className="mt-5">
        {isConnected && acct.gaslessAvailable && (
          <button
            type="button"
            onClick={() => acct.setGasless(!acct.gasless)}
            className="mb-3 flex w-full items-center justify-between rounded-[8px] border border-line px-3 py-2 text-left"
          >
            <span className="flex items-center gap-2 text-[12px]">
              <Lightning size={13} weight="fill" className={acct.gasless ? "text-glow" : "text-fg-3"} />
              <span className={acct.gasless ? "text-fg" : "text-fg-2"}>Gasless, one transaction</span>
            </span>
            <span className="text-[11px] text-fg-3">{acct.gasless ? "On" : "Off"}</span>
          </button>
        )}
        {action}
        {state.hash && (
          <a
            href={explorerTx(acct.chainId, state.hash)}
            target="_blank"
            rel="noreferrer"
            className="mt-2 flex items-center justify-center gap-1 text-[12px] text-live"
          >
            Confirmed <ArrowSquareOut size={12} />
          </a>
        )}
        {state.error && <p className="mt-2 text-center text-[12px] leading-snug text-halt">{state.error}</p>}
      </div>
    </Card>
  );
}

function Row({ k, v, tone = "text-fg-2" }: { k: string; v: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="min-w-0 text-fg-3">{k}</dt>
      <dd className={`num min-w-0 text-right ${tone}`}>{v}</dd>
    </div>
  );
}
