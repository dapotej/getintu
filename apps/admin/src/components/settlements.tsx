"use client";
// Labels shared by the statements pages.
import type { SettlementStatus } from "@/lib/types";

export const SETTLEMENT_STATUS: Record<SettlementStatus, { label: string; tone: "day" | "night" | "danger" | "neutral" }> = {
  draft: { label: "Draft", tone: "day" },
  approved: { label: "Approved, not paid", tone: "night" },
  paying: { label: "Transfer sent", tone: "day" },
  paid: { label: "Paid", tone: "night" },
  failed: { label: "Transfer failed", tone: "danger" },
  void: { label: "Void", tone: "neutral" },
};

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
/** "2026-10" or "2026-10-01" → "October 2026". */
export const monthLabel = (month: string) => monthName.format(new Date(`${month.slice(0, 7)}-01T00:00:00Z`));
