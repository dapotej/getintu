// Value parsing shared by the importers. Pure, so it also runs in the browser.

/** "₦18,000", "18000", "18,000.50" → kobo, without ever going through a float. */
export function nairaToKobo(raw: string): number | null {
  const s = raw.replace(/[₦,\s]|NGN/gi, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}
