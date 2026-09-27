export const fmt = (n: number | undefined, d = 2) =>
  n === undefined || !Number.isFinite(n)
    ? "-"
    : n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

export const fmtPct = (bps: number | undefined, d = 1) => (bps === undefined ? "-" : `${(bps / 100).toFixed(d)}%`);

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function fmtDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" });
}

export function daysLeft(unix: number, now: number) {
  return Math.max(0, (unix - now) / 86400);
}
