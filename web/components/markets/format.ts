import { daysLeft, fmt } from "@/lib/format";

/** Short amount for tables and stats: 12,345.67 below 10K, then 12.35K / 1.23M / 1.23B. */
export function splitCompact(n: number | undefined): { value: string; suffix: string } {
  if (n === undefined || !Number.isFinite(n)) return { value: "-", suffix: "" };
  const a = Math.abs(n);
  if (a >= 1e9) return { value: fmt(n / 1e9, 2), suffix: "B" };
  if (a >= 1e6) return { value: fmt(n / 1e6, 2), suffix: "M" };
  if (a >= 1e4) return { value: fmt(n / 1e3, 2), suffix: "K" };
  return { value: fmt(n, 2), suffix: "" };
}

export function compact(n: number | undefined) {
  const { value, suffix } = splitCompact(n);
  return value + suffix;
}

export function maturityLeft(maturity: number, now: number | undefined) {
  if (now === undefined) return undefined;
  const d = daysLeft(maturity, now);
  if (d >= 1) return `${Math.floor(d)}d left`;
  if (d > 0) return "Under 1d left";
  return "Matured";
}

export function fmtSeconds(sec: number) {
  if (sec % 86400 === 0) return `${sec / 86400} day${sec === 86400 ? "" : "s"}`;
  if (sec % 3600 === 0) return `${sec / 3600} hour${sec === 3600 ? "" : "s"}`;
  return `${Math.round(sec / 60)} min`;
}
