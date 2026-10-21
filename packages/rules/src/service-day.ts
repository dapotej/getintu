import { toLagos } from "./lagos-time.ts";
import type { TimeWindow, WeeklyHours } from "./types.ts";

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const overnight = (w: TimeWindow) => toMinutes(w.close) <= toMinutes(w.open);

const windowsFor = (hours: WeeklyHours, weekday: number): TimeWindow[] =>
  hours[String(weekday) as keyof WeeklyHours] ?? [];

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The Lagos date of the opening window `instant` falls in, or null if `hours` has no window
 * open then. A visit after midnight inside a window that opened the evening before belongs to
 * that evening's date (Dapo, 21 Oct 2026: "the night it started").
 */
export function openWindowDate(hours: WeeklyHours, instant: Date): string | null {
  const t = toLagos(instant);
  for (const w of windowsFor(hours, t.weekday)) {
    const open = toMinutes(w.open);
    const close = toMinutes(w.close);
    if (overnight(w) ? t.minutes >= open : t.minutes >= open && t.minutes < close) return t.date;
  }
  for (const w of windowsFor(hours, (t.weekday + 6) % 7)) {
    if (overnight(w) && t.minutes < toMinutes(w.close)) return shiftDate(t.date, -1);
  }
  return null;
}

/** The day a visit counts against: its opening window's date, else the Lagos calendar date. */
export function serviceDate(hours: WeeklyHours, instant: Date): string {
  return openWindowDate(hours, instant) ?? toLagos(instant).date;
}
