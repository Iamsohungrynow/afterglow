import Link from "next/link";
import { ShieldCheck, TrendUp } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { Reveal } from "./Reveal";
import { BOOST_APY, TARGET } from "./example";

interface Vault {
  icon: Icon;
  name: string;
  yield: string;
  line: string;
  hot?: boolean;
}

const VAULTS: Vault[] = [
  { icon: ShieldCheck, name: "Protected", yield: `${TARGET}%`, line: "Paid first. Shielded from weekend losses." },
  { icon: TrendUp, name: "Boost", yield: `~${BOOST_APY.toFixed(0)}%`, line: "Earns every weekend premium. Takes losses first.", hot: true },
];

/** The two lender vaults, one number and one line each. */
export function Strategies() {
  return (
    <div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-2">
        {VAULTS.map((v, i) => (
          <Reveal key={v.name} delay={i * 0.06} className="bg-ink-2">
            <div className="flex h-full flex-col p-6 md:p-8">
              <div className="flex items-center gap-2 text-[15px] text-fg">
                <v.icon size={17} className={v.hot ? "text-glow" : "text-fg-2"} />
                {v.name}
              </div>
              <div className={`num mt-6 text-[56px] leading-none md:text-[72px] ${v.hot ? "text-glow" : "text-fg"}`}>{v.yield}</div>
              <p className="mt-5 text-[15.5px] leading-relaxed text-fg-2">{v.line}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-fg-3">
        Example, fully lent.{" "}
        <Link href="/docs#lender-vaults" className="transition-colors hover:text-glow">
          How the vaults work →
        </Link>
      </p>
    </div>
  );
}
