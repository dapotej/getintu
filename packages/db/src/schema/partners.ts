import { boolean, jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./columns.ts";

// A business intu pays. Bank details are encrypted at field level before they reach this table.
export const partners = pgTable("partners", {
  id: id(),
  legalName: text().notNull(),
  tradingName: text().notNull(),
  contactName: text(),
  contactEmail: text(),
  contactPhone: text(),
  bankDetailsEncrypted: text(),
  settlementTerms: text(),
  active: boolean().notNull().default(true),
  isTest: boolean().notNull().default(false),
  ...timestamps,
  deletedAt: deletedAt(),
});

export const cityEnum = pgEnum("city", ["lagos", "abuja"]);

export const venueCategoryEnum = pgEnum("venue_category", [
  "beach_club",
  "hotel",
  "golf",
  "spa",
  "gym",
  "nightclub",
  "members_club",
  "restaurant",
  "lounge",
]);

// Top-tier venues can be limited to higher plans (e.g. Black only).
export const venueTierEnum = pgEnum("venue_tier", ["standard", "top"]);

/** Opening windows per weekday (0 = Sunday), in Lagos time. A close before open runs past midnight. */
export type OpeningHours = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { open: string; close: string }[]>;

// A place a member can visit.
export const venues = pgTable("venues", {
  id: id(),
  partnerId: uuid()
    .notNull()
    .references(() => partners.id),
  name: text().notNull(),
  area: text().notNull(),
  city: cityEnum().notNull(),
  category: venueCategoryEnum().notNull(),
  tier: venueTierEnum().notNull().default("standard"),
  description: text(),
  openingHours: jsonb().$type<OpeningHours>().notNull(),
  capacityNotes: text(),
  photoPaths: text().array().notNull().default([]),
  active: boolean().notNull().default(true),
  isTest: boolean().notNull().default(false),
  ...timestamps,
  deletedAt: deletedAt(),
});
