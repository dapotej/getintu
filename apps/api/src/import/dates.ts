export type DateOrder = "ISO" | "DMY" | "MDY";

const pad = (n: number) => String(n).padStart(2, "0");

/** A calendar date from the sheet ("2026-12-05", "05/12/2026" or "12/05/2026" depending on `order`). */
export function parseDate(raw: string, order: DateOrder): string | null {
  const s = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const slash = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/.exec(s);
  if (slash && order !== "ISO") {
    const [a, b, y] = [Number(slash[1]), Number(slash[2]), Number(slash[3])];
    return order === "DMY" ? valid(y, b, a) : valid(y, a, b);
  }
  return null;
}

function valid(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A timestamp from the sheet. Without an explicit offset it's read as Lagos time (UTC+1, no DST). */
export function parseLagosTimestamp(raw: string, order: DateOrder): Date | null {
  const s = raw.trim();
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && /^\d{4}-/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const date = parseDate(s, order);
  if (!date) return null;
  const time = /(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/.exec(s);
  const [h, m, sec] = time ? [Number(time[1]), Number(time[2]), Number(time[3] ?? 0)] : [0, 0, 0];
  if (h > 23 || m > 59 || sec > 59) return null;
  return new Date(`${date}T${pad(h)}:${pad(m)}:${pad(sec)}+01:00`);
}
