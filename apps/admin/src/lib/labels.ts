
export const ROLE_LABELS = { founder: "Founder", ops_lead: "Ops lead", ops: "Ops", concierge: "Concierge", finance: "Finance", partnerships: "Partnerships" } as const;

export const STATUS_LABELS: Record<string, string> = { active: "Active", suspended: "Suspended", pending: "Pending", ended: "Ended", cancelled: "Cancelled" };
export const statusTone = (s: string) => (s === "active" ? "night" : s === "suspended" ? "danger" : "neutral") as "night" | "danger" | "neutral";
export const PAID_BY: Record<string, string> = { direct: "Paid by member", client: "Client account", gift: "Gift" };

/** An airport booking's flight, e.g. "Arriving on BA75 at 15:20". */
export const tripText = (t: { direction: "arrival" | "departure"; flightNumber: string; time: string } | null | undefined) => (t ? `${t.direction === "arrival" ? "Arriving" : "Departing"} on ${t.flightNumber} at ${t.time}` : null);
