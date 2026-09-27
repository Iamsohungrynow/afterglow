"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import type { Address, Hex } from "viem";
import { chains } from "@/lib/chains";
import { SPONSORED_CHAINS, createSmartAccount, sendBatch, zerodevEnabled, type KernelClient } from "@/lib/zerodev";

export interface Call {
  to: Address;
  data: Hex;
}

interface AccountState {
  eoa?: Address;
  smart?: Address;
  /** Address whose positions the UI shows and acts for. */
  owner?: Address;
  chainId: number;
  gasless: boolean;
  gaslessAvailable: boolean;
  setGasless: (v: boolean) => void;
  preparing: boolean;
  execute: (calls: Call[]) => Promise<Hex>;
}

const Ctx = createContext<AccountState | null>(null);

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const { address: eoa } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const gaslessAvailable = zerodevEnabled && SPONSORED_CHAINS.has(chainId);
  const [gasless, setGasless] = useState(true);
  const [kernel, setKernel] = useState<KernelClient>();
  const [preparing, setPreparing] = useState(false);

  // Build the Kernel smart account for the connected wallet when gasless mode is on.
  useEffect(() => {
    setKernel(undefined);
    if (!gaslessAvailable || !gasless || !walletClient || !eoa) return;
    const chain = chains.find((c) => c.id === chainId);
    if (!chain) return;
    let cancelled = false;
    setPreparing(true);
    createSmartAccount(chain, walletClient)
      .then((k) => !cancelled && setKernel(k))
      .catch((e) => console.error("smart account", e))
      .finally(() => !cancelled && setPreparing(false));
    return () => {
      cancelled = true;
    };
  }, [gaslessAvailable, gasless, walletClient, eoa, chainId]);

  const useSmart = gaslessAvailable && gasless;
  const smart = kernel?.account.address;

  const execute = useCallback(
    async (calls: Call[]) => {
      if (useSmart) {
        if (!kernel) throw new Error("Smart account is still being prepared");
        return (await sendBatch(kernel, calls)) as Hex;
      }
      if (!walletClient || !publicClient) throw new Error("Connect a wallet first");
      let last: Hex = "0x";
      for (const c of calls) {
        last = await walletClient.sendTransaction({ to: c.to, data: c.data, account: walletClient.account!, chain: walletClient.chain });
        await publicClient.waitForTransactionReceipt({ hash: last });
      }
      return last;
    },
    [useSmart, kernel, walletClient, publicClient],
  );

  const value = useMemo<AccountState>(
    () => ({
      eoa,
      smart,
      owner: useSmart ? smart : eoa,
      chainId,
      gasless: useSmart && Boolean(eoa),
      gaslessAvailable,
      setGasless,
      preparing,
      execute,
    }),
    [eoa, smart, useSmart, chainId, gaslessAvailable, preparing, execute],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAfterglowAccount() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAfterglowAccount outside AccountProvider");
  return v;
}
