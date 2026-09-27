import type { ReactNode } from "react";
import {
  ArbitrumMark,
  ChainlinkMark,
  OpenZeppelinMark,
  PaxosWordmark,
  RobinhoodMark,
  ZeroDevLogo,
} from "@/components/landing/partner-logos";

/** Mark + name set in the site sans, so every lockup shares one cap height. */
function Lockup({ mark, children }: { mark: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-[7px]">
      {mark}
      <span className="whitespace-nowrap text-[14px] font-medium leading-none tracking-[-0.012em] sm:text-[15px]">
        {children}
      </span>
    </span>
  );
}

const PARTNERS: { name: string; role: string; logo: ReactNode }[] = [
  {
    name: "Robinhood Chain",
    role: "settlement and stock tokens",
    logo: <Lockup mark={<RobinhoodMark className="h-[21px] w-auto shrink-0" />}>Robinhood Chain</Lockup>,
  },
  {
    name: "Arbitrum Stylus",
    role: "GapGuard, written in Rust",
    logo: <Lockup mark={<ArbitrumMark className="h-[23px] w-auto shrink-0" />}>Stylus</Lockup>,
  },
  {
    name: "Paxos USDG",
    role: "the asset you borrow and lend",
    logo: (
      <span className="inline-flex items-center gap-[9px]">
        <PaxosWordmark className="h-[12.5px] w-auto shrink-0" />
        <span aria-hidden className="h-[13px] w-px bg-current opacity-35" />
        <span className="text-[14px] font-medium leading-none tracking-[0.01em] sm:text-[15px]">USDG</span>
      </span>
    ),
  },
  {
    name: "Chainlink",
    role: "stock and USDG prices",
    logo: <Lockup mark={<ChainlinkMark className="h-[21px] w-auto shrink-0" />}>Chainlink</Lockup>,
  },
  {
    name: "ZeroDev",
    role: "smart accounts, sponsored gas",
    logo: <ZeroDevLogo className="h-[23px] w-auto" />,
  },
  {
    name: "OpenZeppelin",
    role: "contract libraries",
    logo: <Lockup mark={<OpenZeppelinMark className="h-[18px] w-auto shrink-0" />}>OpenZeppelin</Lockup>,
  },
];

/**
 * "Built on" partner strip: monochrome logos in the muted text colour on a hairline grid,
 * each with its role underneath. 6 across on desktop, 3x2 on tablet, 2x3 on phones.
 */
export function BuiltOn() {
  return (
    <div>
      <p className="text-[13px] text-fg-3">Built on</p>
      <ul className="mt-5 grid grid-cols-2 border-l border-t border-line sm:grid-cols-3 lg:grid-cols-6">
        {PARTNERS.map(({ name, role, logo }) => (
          <li
            key={name}
            className="group flex min-w-0 flex-col items-center border-b border-r border-line px-3 pb-6 pt-8 text-center transition-colors duration-300 hover:bg-ink-2"
          >
            <div
              role="img"
              aria-label={name}
              title={name}
              className="flex h-7 items-center justify-center text-fg-2 transition-colors duration-300 group-hover:text-fg"
            >
              {logo}
            </div>
            <p className="mt-4 text-balance text-[12px] leading-snug text-fg-3 transition-colors duration-300 group-hover:text-fg-2">
              {role}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
