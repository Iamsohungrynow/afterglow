"use client";

import { useAccount } from "wagmi";
import { deployedChains } from "@/lib/markets";
import { useAfterglowAccount } from "@/components/terminal/AccountProvider";

/**
 * Chain the UI reads from: the wallet's chain when connected, otherwise the first chain with a
 * deployment (so visitors without a wallet still see live contract state).
 */
export function useReadChain(): number | undefined {
  const { isConnected } = useAccount();
  const { chainId } = useAfterglowAccount();
  return isConnected ? chainId : deployedChains()[0]?.id;
}
