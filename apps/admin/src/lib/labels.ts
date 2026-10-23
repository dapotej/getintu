
export const ROLE_LABELS = { founder: "Founder", ops_lead: "Ops lead", ops: "Ops", concierge: "Concierge", finance: "Finance", partnerships: "Partnerships" } as const;

export const STATUS_LABELS: Record<string, string> = { active: "Active", suspended: "Suspended", pending: "Pending", ended: "Ended", cancelled: "Cancelled" };
export const statusTone = (s: string) => (s === "active" ? "night" : s === "suspended" ? "danger" : "neutral") as "night" | "danger" | "neutral";
export const PAID_BY: Record<string, string> = { direct: "Paid by member", client: "Client account", gift: "Gift" };

/** An airport booking's flight, e.g. "Arriving on BA75 at 15:20". */
export const tripText = (t: { direction: "arrival" | "departure"; flightNumber: string; time: string } | null | undefined) => (t ? `${t.direction === "arrival" ? "Arriving" : "Departing"} on ${t.flightNumber} at ${t.time}` : null);

/** "Black Toyota Land Cruiser (2022) · LND 123 AB". */
export const vehicleText = (v: { plate: string; makeModel: string; year: number | null; colour: string | null } | null | undefined) =>
  v ? `${[v.colour, v.makeModel].filter(Boolean).join(" ")}${v.year ? ` (${v.year})` : ""} · ${v.plate}` : null;

/** Today's date in Lagos, YYYY-MM-DD. */
export const lagosToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date());

/**
 * A pass's allowances, one per benefit: a benefit that resets (monthly, yearly) has a row for each
 * period, and only the current one (or the next, before the pass starts) is shown, with a count of
 * the periods still to come.
 */
export function currentAllowances<A extends { category: { code: string }; shared: boolean; periodStart: string; periodEnd: string }>(rows: readonly A[], today: string) {
  const groups = new Map<string, A[]>();
  for (const a of rows) {
    const key = `${a.category.code}:${a.shared}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups.values()].map((list) => {
    const sorted = [...list].sort((x, y) => x.periodStart.localeCompare(y.periodStart));
    const current = sorted.find((a) => a.periodStart <= today && a.periodEnd >= today) ?? sorted.find((a) => a.periodStart > today) ?? sorted[sorted.length - 1];
    return { allowance: current as A, periods: sorted.length, ahead: sorted.filter((a) => a.periodStart > (current?.periodStart ?? "")).length };
  });
}
