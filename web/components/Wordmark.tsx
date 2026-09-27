import Link from "next/link";
import { LogoMark } from "@/components/LogoMark";

/** Mark + serif wordmark. The mark's horizon sits on the type's baseline. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-baseline gap-[9px] leading-none" aria-label="Afterglow home">
      <LogoMark size={30} className="shrink-0 text-glow transition-colors duration-300 group-hover:text-[#f3b877]" />
      <span className="font-display text-[23px] font-semibold tracking-[0.005em] text-fg">Afterglow</span>
    </Link>
  );
}
