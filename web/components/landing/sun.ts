import { DEFAULT_SCHEDULE, intoWeek, scheduleSession } from "@/lib/session";

/**
 * Sun elevation for the hero, driven by the same weekly schedule Phaselock enforces.
 *  1    : Monday reopen, high and pale
 *  0.85 : start of the 4-hour closing window (drifts down slowly through the week)
 *  0    : the weekly close, touching the horizon
 * -0.45 : the weekend, below the horizon, only the afterglow is left
 */
export function sunElevation(t: number) {
  const s = DEFAULT_SCHEDULE;
  const { session, rampBps } = scheduleSession(t, s);
  if (session === "Closed") return -0.45;
  if (session === "Closing") return 0.85 * (1 - rampBps / 10_000);
  const liveEnd = s.weeklyCloseOffset - s.closingWindow;
  const w = intoWeek(t);
  return 1 - 0.15 * Math.min(1, w / liveEnd);
}
