
export const ROLE_LABELS = { founder: "Founder", ops_lead: "Ops lead", ops: "Ops", concierge: "Concierge", finance: "Finance", partnerships: "Partnerships" } as const;

export const STATUS_LABELS: Record<string, string> = { active: "Active", suspended: "Suspended", pending: "Pending", ended: "Ended", cancelled: "Cancelled" };
export const statusTone = (s: string) => (s === "active" ? "night" : s === "suspended" ? "danger" : "neutral") as "night" | "danger" | "neutral";
export const PAID_BY: Record<string, string> = { direct: "Paid by member", client: "Client account", gift: "Gift" };
