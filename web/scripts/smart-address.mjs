// Prints the ZeroDev Kernel v3.1 smart account address the app creates for a wallet (index 0).
//   node scripts/smart-address.mjs <wallet address>
import { createPublicClient, http } from "viem";
import { getKernelAddressFromECDSA } from "@zerodev/ecdsa-validator";
import { KERNEL_V3_1, getEntryPoint } from "@zerodev/sdk/constants";

const eoa = process.argv[2];
if (!/^0x[0-9a-fA-F]{40}$/.test(eoa ?? "")) {
  console.error("usage: node scripts/smart-address.mjs <0x wallet address>");
  process.exit(1);
}
const publicClient = createPublicClient({ transport: http("https://rpc.testnet.chain.robinhood.com") });
const smart = await getKernelAddressFromECDSA({
  publicClient,
  eoaAddress: eoa,
  index: 0n,
  entryPoint: getEntryPoint("0.7"),
  kernelVersion: KERNEL_V3_1,
});
console.log(smart);
