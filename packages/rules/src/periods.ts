import { shiftDate } from "./service-day.ts";

export type AllowancePeriod = "per_pass" | "per_month" | "per_year";

export interface PeriodRange {
  /** Lagos dates, inclusive. */
  start: string;
  end: string;
}

const addYears = (date: string, years: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
};

const lastDayOfMonth = (date: string): string => {
  const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};

/**
 * The allowance periods a membership running from `startsOn` to `endsOn` gets for a benefit:
 * one for the whole pass, one per calendar month, or one per membership year. Unused
 * allowances don't roll over, so each period is granted afresh.
 */
export function allowancePeriods(period: AllowancePeriod, startsOn: string, endsOn: string): PeriodRange[] {
  if (endsOn < startsOn) return [];
  if (period === "per_pass") return [{ start: startsOn, end: endsOn }];

  const ranges: PeriodRange[] = [];
  let start = startsOn;
  while (start <= endsOn) {
    const natural = period === "per_month" ? lastDayOfMonth(start) : shiftDate(addYears(startsOn, ranges.length + 1), -1);
    const end = natural < endsOn ? natural : endsOn;
    ranges.push({ start, end });
    start = shiftDate(end, 1);
  }
  return ranges;
}
