import Link from "next/link";
import { ArrowRight, GithubLogo } from "@phosphor-icons/react/dist/ssr";

export const REPO = "https://github.com/Iamsohungrynow/afterglow";

export function LaunchButton({ large = false }: { large?: boolean }) {
  return (
    <Link
      href="/app"
      className={`group inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[6px] bg-fg font-medium text-ink transition hover:bg-white active:translate-y-px ${
        large ? "h-11 px-5 text-[14px]" : "h-8 px-3.5 text-[13px]"
      }`}
    >
      Launch app
      <ArrowRight size={large ? 14 : 12} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function SourceButton() {
  return (
    <a
      href={REPO}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[6px] border border-line-strong bg-ink/40 px-5 text-[14px] text-fg backdrop-blur-sm transition hover:border-fg-3 active:translate-y-px"
    >
      <GithubLogo size={15} />
      View source
    </a>
  );
}
