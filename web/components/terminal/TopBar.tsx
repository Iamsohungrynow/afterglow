"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { CaretDown, Wallet } from "@phosphor-icons/react";
import { useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { chains } from "@/lib/chains";
import { short } from "@/lib/format";
import { useAfterglowAccount } from "./AccountProvider";

export function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-line px-4">
      <div className="flex items-center gap-8">
        <Wordmark />
        <nav className="hidden items-center gap-5 text-[13px] md:flex">
          <span className="text-fg">Trade</span>
          <a href="https://github.com/Iamsohungrynow/afterglow" className="text-fg-3 transition-colors hover:text-fg-2">
            Docs
          </a>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <NetworkSelect />
        <ConnectButton />
      </div>
    </header>
  );
}

function NetworkSelect() {
  const { chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const current = chains.find((c) => c.id === chainId);
  if (!isConnected) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-1.5 rounded-[6px] border border-line-strong px-3 text-[12.5px] text-fg-2 transition hover:text-fg"
      >
        {current?.name ?? "Unsupported network"}
        <CaretDown size={11} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-56 border border-line-strong bg-ink-3 py-1 shadow-[0_18px_40px_rgb(0_0_0/0.45)]">
          {chains.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                switchChain({ chainId: c.id });
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-[12.5px] hover:bg-white/[0.04] ${
                c.id === chainId ? "text-fg" : "text-fg-2"
              }`}
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

function ConnectButton() {
  const { isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { eoa, smart, gasless } = useAfterglowAccount();

  if (!isConnected) {
    return (
      <button
        onClick={() => connectors[0] && connect({ connector: connectors[0] })}
        disabled={isPending}
        className="flex h-8 items-center gap-2 rounded-[6px] bg-fg px-3.5 text-[13px] font-medium text-ink transition hover:bg-white active:translate-y-px disabled:opacity-60"
      >
        <Wallet size={14} weight="bold" />
        {isPending ? "Connecting" : "Connect"}
      </button>
    );
  }
  return (
    <button
      onClick={() => disconnect()}
      title="Disconnect"
      className="flex h-8 items-center gap-2 rounded-[6px] border border-line-strong px-3 text-[12.5px] transition hover:border-fg-3"
    >
      <span className="num text-fg">{short(gasless && smart ? smart : eoa)}</span>
      {gasless && <span className="text-[11px] text-glow">smart account</span>}
    </button>
  );
}
