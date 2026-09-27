import { deploymentFor } from "@/lib/markets";

/** One numbered docs section with a reading-width body. */
export function DocSection({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 border-t border-line pt-12 first:border-t-0 first:pt-0">
      <p className="num text-[12px] text-glow">{String(n).padStart(2, "0")}</p>
      <h2 id={`${id}-h`} className="mt-2 text-[26px] font-medium leading-tight tracking-[-0.02em] text-fg md:text-[30px]">
        {title}
      </h2>
      <div className="mt-6 space-y-5 text-[15.5px] leading-[1.7] text-fg-2 [&_strong]:font-medium [&_strong]:text-fg [&>*]:max-w-[68ch] [&>.doc-wide]:max-w-none">
        {children}
      </div>
    </section>
  );
}

/** An interactive figure that may run wider than the reading column, with an optional caption. */
export function Figure({ children, caption }: { children: React.ReactNode; caption?: React.ReactNode }) {
  return (
    <figure className="doc-wide pt-2 leading-normal">
      {children}
      {caption && <figcaption className="mt-3 text-[12.5px] leading-relaxed text-fg-3">{caption}</figcaption>}
    </figure>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="pt-3 text-[16px] font-medium text-fg">{children}</h3>;
}

/** A formula or worked number, set in mono. */
export function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="num overflow-x-auto rounded-[6px] border border-line bg-ink-2 px-4 py-3 text-[13.5px] leading-relaxed text-fg">
      {children}
    </div>
  );
}

export function Table({ head, rows, numCols = [] }: { head: string[]; rows: React.ReactNode[][]; numCols?: number[] }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-line">
      <table className={`w-full border-collapse text-left text-[13.5px] leading-snug ${head.length > 3 ? "min-w-[600px]" : ""}`}>
        <thead>
          <tr className="border-b border-line bg-ink-2">
            {head.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[12px] font-normal text-fg-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 align-top ${j === 0 ? "text-fg" : "text-fg-2"} ${numCols.includes(j) ? "num whitespace-nowrap" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Stat({ value, label, source }: { value: string; label: string; source: string }) {
  return (
    <div className="border-l border-line-strong pl-4">
      <div className="num text-[24px] leading-none text-fg">{value}</div>
      <div className="mt-2 text-[13.5px] leading-snug text-fg-2">{label}</div>
      <div className="mt-1 text-[11.5px] text-fg-3">{source}</div>
    </div>
  );
}

export function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-l border-line-strong pl-5">
      <h3 className="text-[16px] font-medium text-fg">{q}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}

const EXPLORER = "https://explorer.testnet.chain.robinhood.com/address/";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Addr({ a }: { a: string }) {
  return (
    <a href={`${EXPLORER}${a}`} target="_blank" rel="noreferrer" title={a} className="num text-fg-2 underline decoration-line-strong underline-offset-4 transition-colors hover:text-glow hover:decoration-glow">
      {short(a)}
    </a>
  );
}

/** Robinhood Chain testnet addresses, read from web/lib/deployments.json at build time. */
export function ContractTables() {
  const d = deploymentFor(46630);
  if (!d) return <p>No testnet deployment recorded yet.</p>;
  const core: [string, string, string | undefined][] = [
    ["Phaselock oracle", "Prices and market session", d.oracle],
    ["GapGuard (Stylus)", "Weekend gap model", d.gapGuard],
    ["Savings vault", "Weekend sweep target", d.idleVault],
    ["USDG", "Loan asset (testnet)", d.usdg],
    ["USDG / USD feed", "Depeg circuit breaker", d.usdgFeed],
  ];
  const markets = Object.entries(d.markets);
  return (
    <>
      <Table head={["Contract", "Role", "Address"]} rows={core.filter((r) => r[2]).map(([n, r, a]) => [n, r, <Addr key={n} a={a!} />])} />
      {markets.map(([sym, m]) => (
        <div key={sym} className="space-y-3">
          <H3>{sym} market</H3>
          <Table
            head={["Contract", "Address"]}
            rows={(
              [
                ["Market (ERC-4626)", m.market],
                ["Tranches", m.tranches],
                ["Protected share token", m.protectedToken],
                ["Boost share token", m.boostToken],
                [`${sym} stock token`, m.token],
                [`${sym} price feed`, m.feed],
              ] as [string, string | undefined][]
            )
              .filter((r) => r[1])
              .map(([n, a]) => [n, <Addr key={n} a={a!} />])}
          />
        </div>
      ))}
    </>
  );
}
