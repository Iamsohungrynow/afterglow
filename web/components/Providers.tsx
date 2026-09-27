"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { useState } from "react";
import { robinhood, robinhoodTestnet, arbitrumSepolia } from "@/lib/chains";

export const wagmiConfig = createConfig({
  chains: [robinhoodTestnet, arbitrumSepolia, robinhood],
  connectors: [injected()],
  transports: {
    [robinhoodTestnet.id]: http(),
    [arbitrumSepolia.id]: http(),
    [robinhood.id]: http(),
  },
  ssr: true,
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
