"use client";

import { createPublicClient, http, type Chain, type Hex, type WalletClient } from "viem";
import { createKernelAccount, createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";

const PROJECT_ID = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID;
const entryPoint = getEntryPoint("0.7");

export const zerodevEnabled = Boolean(PROJECT_ID);

/** ZeroDev sponsors gas on these chains (free plan: testnets only). */
export const SPONSORED_CHAINS = new Set([46630, 421614]);

export function zerodevRpc(chainId: number) {
  return `https://rpc.zerodev.app/api/v3/${PROJECT_ID}/chain/${chainId}`;
}

export type KernelClient = Awaited<ReturnType<typeof createSmartAccount>>;

/**
 * Wraps the connected wallet in a ZeroDev Kernel v3.1 smart account (ECDSA validator), with a
 * paymaster that sponsors gas. Several contract calls then settle in one user operation, and the
 * user never needs ETH.
 */
export async function createSmartAccount(chain: Chain, walletClient: WalletClient) {
  if (!PROJECT_ID) throw new Error("NEXT_PUBLIC_ZERODEV_PROJECT_ID is not set");
  const publicClient = createPublicClient({ chain, transport: http() });
  const rpc = zerodevRpc(chain.id);

  const validator = await signerToEcdsaValidator(publicClient, {
    // viem wallet client from wagmi; the connected EOA signs user operations.
    signer: walletClient as Parameters<typeof signerToEcdsaValidator>[1]["signer"],
    entryPoint,
    kernelVersion: KERNEL_V3_1,
  });
  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: validator },
    entryPoint,
    kernelVersion: KERNEL_V3_1,
  });
  const paymaster = createZeroDevPaymasterClient({ chain, transport: http(rpc) });
  const client = createKernelAccountClient({
    account,
    chain,
    bundlerTransport: http(rpc),
    client: publicClient,
    paymaster: {
      getPaymasterData: (userOperation) => paymaster.sponsorUserOperation({ userOperation }),
    },
  });
  return client;
}

/** Send several calls as one sponsored user operation; resolves with the transaction hash. */
export async function sendBatch(client: KernelClient, calls: { to: `0x${string}`; data: Hex; value?: bigint }[]) {
  const callData = await client.account.encodeCalls(calls.map((c) => ({ ...c, value: c.value ?? 0n })));
  const hash = await client.sendUserOperation({ callData });
  const receipt = await client.waitForUserOperationReceipt({ hash });
  return receipt.receipt.transactionHash;
}
