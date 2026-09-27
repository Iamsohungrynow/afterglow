import { Providers } from "@/components/Providers";
import { AccountProvider } from "@/components/terminal/AccountProvider";
import { AppShell } from "@/components/shell/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AccountProvider>
        <AppShell>{children}</AppShell>
      </AccountProvider>
    </Providers>
  );
}
