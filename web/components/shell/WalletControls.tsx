"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { CaretDown, Wallet, Copy, Check } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { Connector } from "wagmi";
import { chains } from "@/lib/chains";
import { short } from "@/lib/format";
import { useAfterglowAccount } from "@/components/terminal/AccountProvider";

export function NetworkSelect() {
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const current = chains.find((c) => c.id === chainId);
  if (!isConnected) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[12px] text-fg-2 transition hover:text-fg"
      >
        {current?.name ?? "Unsupported network"}
        <CaretDown size={11} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-60 overflow-hidden rounded-[12px] border border-line-strong bg-ink-3 py-1 shadow-[0_18px_40px_rgb(0_0_0/0.45)]">
          {chains.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                switchChain({ chainId: c.id });
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] hover:bg-white/[0.04] ${c.id === chainId ? "text-fg" : "text-fg-2"}`}
            >
              {c.name}
              <span className="num text-[11px] text-fg-3">{c.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Wallet connection with visible feedback: wallets detected via EIP-6963 (Rabby, MetaMask, ...)
 * are listed by name; while a request is pending the user is told to approve it in the wallet,
 * and failures are shown instead of swallowed.
 */
export function useWalletConnect() {
  const { connectAsync, connectors, isPending } = useConnect();
  const [error, setError] = useState<string>();
  const [slow, setSlow] = useState(false);

  // Prefer named wallets announced over EIP-6963; keep the generic injected one as a fallback.
  const named = connectors.filter((c) => c.id !== "injected");
  const options: readonly Connector[] = named.length ? named : connectors;

  useEffect(() => {
    if (!isPending) return setSlow(false);
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, [isPending]);

  const connectWith = async (connector: Connector) => {
    setError(undefined);
    try {
      await connectAsync({ connector });
    } catch (e) {
      const msg = e instanceof Error ? e.message.split(/\r?\n/)[0] : String(e);
      setError(/reject|denied/i.test(msg) ? "Request rejected in the wallet." : msg.slice(0, 120));
    }
  };

  const status = isPending
    ? slow
      ? "Still waiting. Open your wallet extension to approve."
      : "Approve the request in your wallet."
    : error;

  return { options, connectWith, isPending, status, hasWallet: options.length > 0 };
}

/** Connect control. `variant="block"` renders a full-width primary button for forms. */
export function ConnectWalletButton({ variant = "pill" }: { variant?: "pill" | "block" }) {
  const { options, connectWith, isPending, status, hasWallet } = useWalletConnect();
  const [menu, setMenu] = useState(false);
  const block = variant === "block";

  const onClick = () => {
    if (!hasWallet) return window.open("https://rabby.io", "_blank", "noopener");
    if (options.length === 1) return connectWith(options[0]);
    setMenu((m) => !m);
  };

  return (
    <div className={`relative ${block ? "w-full" : ""}`}>
      <button
        onClick={onClick}
        disabled={isPending}
        className={
          block
            ? "h-11 w-full rounded-[8px] bg-fg text-[14px] font-medium text-ink transition hover:bg-white active:translate-y-px disabled:opacity-70"
            : "flex h-8 items-center gap-2 rounded-full bg-fg px-4 text-[12.5px] font-medium text-ink transition hover:bg-white active:translate-y-px disabled:opacity-70"
        }
      >
        {!block && <Wallet size={14} weight="bold" />}
        {!hasWallet ? "Install a wallet" : isPending ? "Waiting for wallet" : block ? "Connect wallet" : "Connect"}
      </button>
      {menu && options.length > 1 && !isPending && (
        <div className={`absolute z-40 mt-2 w-56 rounded-[12px] border border-line-strong bg-ink-3 p-1 shadow-[0_18px_40px_rgb(0_0_0/0.45)] ${block ? "left-0" : "right-0"}`}>
          {options.map((c) => (
            <button
              key={c.uid}
              onClick={() => {
                setMenu(false);
                connectWith(c);
              }}
              className="flex w-full items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-left text-[13px] text-fg hover:bg-white/[0.05]"
            >
              {c.icon ? <img src={c.icon} alt="" className="size-5 rounded-[4px]" /> : <Wallet size={16} className="text-fg-3" />}
              {c.name}
            </button>
          ))}
        </div>
      )}
      {status && (
        <p className={`mt-2 text-[11.5px] leading-snug ${isPending ? "text-glow" : "text-halt"} ${block ? "text-center" : "absolute right-0 w-64 text-right"}`}>
          {status}
        </p>
      )}
    </div>
  );
}

export function ConnectButton() {
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { eoa, smart, gasless, preparing, smartError } = useAfterglowAccount();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string>();

  if (!isConnected) return <ConnectWalletButton />;

  const copy = (a?: string) => {
    if (!a) return;
    navigator.clipboard?.writeText(a);
    setCopied(a);
    setTimeout(() => setCopied(undefined), 1200);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-2 rounded-full border border-line-strong px-3 text-[12px] transition hover:border-fg-3"
      >
        <span className="num text-fg">{short(gasless && smart ? smart : eoa)}</span>
        {gasless && smart && <span className="text-[11px] text-glow">smart account</span>}
        {gasless && !smart && <span className="text-[11px] text-fg-3">{preparing ? "preparing…" : smartError ? "gasless off" : ""}</span>}
        <CaretDown size={11} className="text-fg-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-72 rounded-[12px] border border-line-strong bg-ink-3 p-3 shadow-[0_18px_40px_rgb(0_0_0/0.45)]">
          {[
            ["Wallet", eoa],
            ["Afterglow smart account", smart],
          ].map(([label, addr]) =>
            addr ? (
              <button key={label} onClick={() => copy(addr)} className="flex w-full items-center justify-between rounded-[8px] px-2 py-2 text-left hover:bg-white/[0.04]">
                <span>
                  <span className="block text-[11px] text-fg-3">{label}</span>
                  <span className="num mt-0.5 block text-[12.5px] text-fg">{short(addr)}</span>
                </span>
                {copied === addr ? <Check size={14} className="text-live" /> : <Copy size={14} className="text-fg-3" />}
              </button>
            ) : null,
          )}
          {gasless && (
            <p className="px-2 pb-1 pt-2 text-[11px] leading-relaxed text-fg-3">
              Gasless mode acts through the smart account. Fund it (not the wallet) with USDG and stock tokens.
            </p>
          )}
          <button onClick={() => disconnect()} className="mt-2 w-full rounded-[8px] border border-line px-2 py-2 text-[12px] text-fg-2 hover:text-fg">
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
