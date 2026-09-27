"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { erc20Abi, marketAbi, tranchesAbi } from "@/lib/abi";
import type { MarketView } from "./useMarket";

export interface PositionView {
  collateral: number; // tokens
  face: number; // USDG owed at maturity
  debtNow: number; // USDG to repay today
  shares: bigint;
  lent: number; // USDG value of lender shares
  withdrawable: number;
  protectedValue: number; // USDG value in the Protected tranche
  boostValue: number; // USDG value in the Boost tranche
  wallet: { token: number; usdg: number };
}

/** Borrower and lender state for `owner` (the smart account when gasless mode is on). */
export function usePosition(market: MarketView | undefined, chainId: number | undefined, owner: Address | undefined) {
  const client = usePublicClient({ chainId });
  return useQuery({
    enabled: Boolean(market?.market && market.token && market.usdg && owner && client),
    queryKey: ["position", chainId, market?.market, owner],
    refetchInterval: 10_000,
    queryFn: async (): Promise<PositionView> => {
      const m = market!.market!;
      const [pos, debt, shares, maxW, tokenBal, usdgBal] = (await client!.multicall({
        allowFailure: false,
        contracts: [
          { address: m, abi: marketAbi, functionName: "positions", args: [owner!] },
          { address: m, abi: marketAbi, functionName: "debtOf", args: [owner!] },
          { address: m, abi: marketAbi, functionName: "balanceOf", args: [owner!] },
          { address: m, abi: marketAbi, functionName: "maxWithdraw", args: [owner!] },
          { address: market!.token!, abi: erc20Abi, functionName: "balanceOf", args: [owner!] },
          { address: market!.usdg!, abi: erc20Abi, functionName: "balanceOf", args: [owner!] },
        ],
      })) as unknown as [readonly [bigint, bigint], bigint, bigint, bigint, bigint, bigint];
      const lent = shares > 0n
        ? ((await client!.readContract({ address: m, abi: marketAbi, functionName: "convertToAssets", args: [shares] })) as bigint)
        : 0n;
      let protectedValue = 0;
      let boostValue = 0;
      if (market!.tranches.address) {
        const [s, j] = (await client!.readContract({
          address: market!.tranches.address,
          abi: tranchesAbi,
          functionName: "balancesOf",
          args: [owner!],
        })) as readonly [bigint, bigint];
        protectedValue = Number(s) / 1e6;
        boostValue = Number(j) / 1e6;
      }
      return {
        protectedValue,
        boostValue,
        collateral: Number(pos[0]) / 1e18,
        face: Number(pos[1]) / 1e6,
        debtNow: Number(debt) / 1e6,
        shares,
        lent: Number(lent) / 1e6,
        withdrawable: Number(maxW) / 1e6,
        wallet: { token: Number(tokenBal) / 1e18, usdg: Number(usdgBal) / 1e6 },
      };
    },
  });
}
