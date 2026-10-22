"use client";
import { Input } from "@intu/ui";
import type { WeeklyHours } from "@/lib/types";

const DAYS = [
  ["1", "Mon"],
  ["2", "Tue"],
  ["3", "Wed"],
  ["4", "Thu"],
  ["5", "Fri"],
  ["6", "Sat"],
  ["0", "Sun"],
] as const;

/**
 * One opening window per day, in Lagos time. A close at or before the open time means the venue
 * runs past midnight (22:00–04:00), and the visit counts against the night it started.
 */
export function HoursEditor({ name, value }: { name: string; value?: WeeklyHours | undefined }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-fg">Opening hours (Lagos time)</legend>
      {DAYS.map(([d, label]) => {
        const w = value?.[d]?.[0];
        return (
          <div key={d} className="grid grid-cols-[2.75rem_1fr_auto_1fr] items-center gap-2">
            <span className="text-sm font-medium text-muted">{label}</span>
            <Input name={`${name}_${d}_open`} type="time" aria-label={`${label} opens`} defaultValue={w?.open ?? ""} />
            <span aria-hidden className="text-faint">–</span>
            <Input name={`${name}_${d}_close`} type="time" aria-label={`${label} closes`} defaultValue={w?.close === "24:00" ? "00:00" : (w?.close ?? "")} />
          </div>
        );
      })}
      <p className="text-xs text-muted">Leave a day blank if closed. A closing time earlier than opening runs past midnight; 00:00 to 00:00 is open all day.</p>
    </fieldset>
  );
}

export function readHours(form: FormData, name: string): WeeklyHours {
  const hours = {} as WeeklyHours;
  for (const [d] of DAYS) {
    const open = String(form.get(`${name}_${d}_open`) ?? "");
    let close = String(form.get(`${name}_${d}_close`) ?? "");
    if (!open && !close) {
      hours[d] = [];
      continue;
    }
    if (!open || !close) throw new Error("Give both an opening and a closing time, or leave the day blank");
    if (open === "00:00" && close === "00:00") close = "24:00";
    hours[d] = [{ open, close }];
  }
  return hours;
}
