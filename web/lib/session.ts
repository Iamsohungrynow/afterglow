// TypeScript mirror of PhaselockOracle's weekly schedule, used for the week timeline and
// countdowns. The contract stays the source of truth for any risk decision.

export type Session = "Live" | "Closing" | "Closed" | "Halted";
export const SESSIONS: Session[] = ["Live", "Closing", "Closed", "Halted"];

export const WEEK = 7 * 86400;
const MONDAY_SHIFT = 3 * 86400; // unix 0 was a Thursday

export interface Schedule {
  weeklyCloseOffset: number; // seconds after Monday 00:00 UTC
  weekendLength: number;
  closingWindow: number;
}

// Friday 20:00 ET (EDT) = Saturday 00:00 UTC; reopens Sunday 20:00 ET = Monday 00:00 UTC.
export const DEFAULT_SCHEDULE: Schedule = {
  weeklyCloseOffset: 5 * 86400,
  weekendLength: 2 * 86400,
  closingWindow: 4 * 3600,
};

export const intoWeek = (t: number) => (((t + MONDAY_SHIFT) % WEEK) + WEEK) % WEEK;
export const weekStart = (t: number) => t - intoWeek(t);

export function scheduleSession(t: number, s: Schedule = DEFAULT_SCHEDULE): { session: Session; rampBps: number } {
  const w = intoWeek(t);
  const sinceClose = (w - s.weeklyCloseOffset + WEEK) % WEEK;
  if (sinceClose < s.weekendLength) return { session: "Closed", rampBps: 0 };
  const untilClose = secondsUntilClose(t, s);
  if (untilClose <= s.closingWindow) {
    return { session: "Closing", rampBps: Math.floor(((s.closingWindow - untilClose) * 10_000) / s.closingWindow) };
  }
  return { session: "Live", rampBps: 0 };
}

export function secondsUntilClose(t: number, s: Schedule = DEFAULT_SCHEDULE) {
  const w = intoWeek(t);
  return w < s.weeklyCloseOffset ? s.weeklyCloseOffset - w : WEEK - w + s.weeklyCloseOffset;
}

/** Weekly closes after `t` and no later than `until`: the weekends a loan taken at `t` is exposed to
 * (AfterglowMarket.weekendsToMaturity). */
export function weekendsBetween(t: number, until: number, s: Schedule = DEFAULT_SCHEDULE) {
  const next = t + secondsUntilClose(t, s);
  return next > until ? 0 : 1 + Math.floor((until - next) / WEEK);
}

export function secondsUntilOpen(t: number, s: Schedule = DEFAULT_SCHEDULE) {
  const open = (s.weeklyCloseOffset + s.weekendLength) % WEEK;
  const w = intoWeek(t);
  return (open - w + WEEK) % WEEK || WEEK;
}

/** Next session boundary and what it turns into. */
export function nextTransition(t: number, s: Schedule = DEFAULT_SCHEDULE): { in: number; to: Session } {
  const { session } = scheduleSession(t, s);
  if (session === "Closed") return { in: secondsUntilOpen(t, s), to: "Live" };
  if (session === "Closing") return { in: secondsUntilClose(t, s), to: "Closed" };
  return { in: secondsUntilClose(t, s) - s.closingWindow, to: "Closing" };
}

/** Max borrow LTV for a session, matching AfterglowMarket.maxBorrowLtvBps. */
export function maxBorrowLtv(session: Session, rampBps: number, baseBps: number, weekendBps: number) {
  if (session === "Live") return baseBps;
  if (session === "Closing") return baseBps - Math.floor(((baseBps - weekendBps) * rampBps) / 10_000);
  return 0;
}

export function fmtDuration(sec: number) {
  sec = Math.max(0, Math.floor(sec));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}
