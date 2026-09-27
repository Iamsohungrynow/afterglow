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

/** Days to a timestamp with one decimal, e.g. "31.9d". The one rule every page uses. */
export function fmtDays(unix: number, now: number) {
  return `${daysLeft(unix, now).toFixed(1)}d`;
}

/** LTV in bps: whole percent when it is a round config value (55%), one decimal otherwise (43.7%). */
export const fmtLtv = (bps: number | undefined) => (bps === undefined ? "-" : fmtPct(bps, bps % 100 === 0 ? 0 : 1));

/** Weekend premium, labelled the same way everywhere: "7.8 bp / weekend". */
export const fmtPremium = (ppm: number | undefined) => (ppm === undefined ? "-" : `${(ppm / 100).toFixed(1)} bp / weekend`);

/** Classes that hide a scrollbar while keeping the element scrollable. */
export const NO_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
