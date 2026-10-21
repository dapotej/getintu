// All rules, resets and reports run on Lagos time (Africa/Lagos), whatever the server's zone.
export const LAGOS_TZ = "Africa/Lagos";

const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: LAGOS_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface LagosTime {
  /** Calendar date in Lagos, YYYY-MM-DD. */
  date: string;
  /** Calendar month in Lagos, YYYY-MM. */
  month: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** Minutes since Lagos midnight. */
  minutes: number;
}

export function toLagos(instant: Date): LagosTime {
  const p = Object.fromEntries(parts.formatToParts(instant).map((x) => [x.type, x.value]));
  const weekday = WEEKDAYS.indexOf(p["weekday"] as (typeof WEEKDAYS)[number]);
  return {
    date: `${p["year"]}-${p["month"]}-${p["day"]}`,
    month: `${p["year"]}-${p["month"]}`,
    weekday,
    minutes: Number(p["hour"]) * 60 + Number(p["minute"]),
  };
}
