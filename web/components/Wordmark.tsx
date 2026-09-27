import Link from "next/link";

/** Serif wordmark with a small horizon rule under it. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group relative inline-flex flex-col leading-none" aria-label="Afterglow home">
      <span className="font-display text-[23px] font-semibold tracking-[0.005em] text-fg">Afterglow</span>
      <span
        aria-hidden
        className="mt-1 h-px w-full"
        style={{ background: "linear-gradient(90deg, transparent, rgb(233 161 94 / 0.9), transparent)" }}
      />
    </Link>
  );
}
