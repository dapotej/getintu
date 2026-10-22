"use client";
import { useMemo } from "react";
import { useApi } from "./api";
import type { Category, OfferModel, PartnerStatus } from "./types";

/** The catalogue, with lookups the screens need. Loads once per screen. */
export function useCatalogue() {
  const { data, error, reload } = useApi<{ categories: Category[] }>("/admin/categories");
  return useMemo(() => {
    const all = data?.categories ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    const byCode = new Map(all.map((c) => [c.code, c]));
    const children = (parentId: string | null) => all.filter((c) => c.parentId === parentId).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    /** "Beach & Water › Beach Clubs › Entry only" */
    const path = (code: string) => {
      const parts = code.split("-").map((_, i, a) => byCode.get(a.slice(0, i + 1).join("-"))?.name);
      return parts.filter(Boolean).join(" › ");
    };
    /** Depth-first, for pickers: each entry with its depth. */
    const ordered: { c: Category; depth: number }[] = [];
    const walk = (parentId: string | null, depth: number) => children(parentId).forEach((c) => (ordered.push({ c, depth }), walk(c.id, depth + 1)));
    walk(null, 0);
    return { ready: data !== null, error, reload, all, byId, byCode, children, path, ordered };
  }, [data, error, reload]);
}

/** Nightlife & Social is the night side of intu; everything else is day. */
export const isNight = (code: string) => code === "C06" || code.startsWith("C06-");

export const OFFER_MODELS: Record<OfferModel, string> = {
  included: "Included in the pass",
  included_or_add_on: "Included, or as an add-on",
  add_on: "Paid add-on",
  member_privilege: "Member privilege",
};

export const PARTNER_STATUSES: Record<PartnerStatus, string> = {
  to_identify: "To identify",
  to_verify: "To verify",
  prospect: "Prospect",
  personal_lead: "Personal lead",
  negotiating: "Negotiating",
  signed: "Signed",
  live: "Live",
  paused: "Paused",
  declined: "Declined",
};

export const statusToneFor = (s: PartnerStatus) =>
  (s === "live" || s === "signed" ? "night" : s === "negotiating" ? "accent" : s === "paused" || s === "declined" ? "danger" : s === "prospect" || s === "personal_lead" ? "day" : "neutral") as "night" | "accent" | "danger" | "day" | "neutral";

/** Markup on cost, e.g. 50%. Worked out from the two prices, never stored. */
export function markup(costMinor: number | null, retailMinor: number | null): string | null {
  if (costMinor === null || retailMinor === null || costMinor === 0) return null;
  return `${Math.round(((retailMinor - costMinor) * 100) / costMinor)}%`;
}
