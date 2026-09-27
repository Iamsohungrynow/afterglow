import type { Session } from "@/lib/session";

const STYLE: Record<Session, string> = {
  Live: "text-live border-live/30 bg-live/10",
  Closing: "text-glow border-glow/30 bg-glow/10",
  Closed: "text-fg-2 border-line-strong bg-white/[0.03]",
  Halted: "text-halt border-halt/30 bg-halt/10",
};

/** Market session status. The dot here is real state, not decoration. */
export function SessionChip({ session, className = "" }: { session: Session; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STYLE[session]} ${className}`}>
      <span className={`size-1.5 rounded-full bg-current ${session === "Live" || session === "Closing" ? "animate-pulse-soft" : ""}`} />
      {session}
    </span>
  );
}
