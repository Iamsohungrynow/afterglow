"use client";

import { Providers } from "@/components/Providers";
import { AccountProvider } from "@/components/terminal/AccountProvider";
import { Terminal } from "@/components/terminal/Terminal";

export default function AppPage() {
  return (
    <Providers>
      <AccountProvider>
        <Terminal />
      </AccountProvider>
    </Providers>
  );
}
