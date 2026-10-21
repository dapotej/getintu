import { boolean, date, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { WeeklyHours } from "@intu/rules";
import { deletedAt, id, timestamps } from "./columns.ts";
import { benefitTypeEnum, cityEnum, currencyEnum, venueCategoryEnum, venueTierEnum } from "./enums.ts";

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

export type OpeningHours = WeeklyHours;

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
  // An id from outside the platform, e.g. the pilot sheet's venue ID (V01).
  externalRef: text().unique(),
  photoPaths: text().array().notNull().default([]),
  active: boolean().notNull().default(true),
  isTest: boolean().notNull().default(false),
  ...timestamps,
  deletedAt: deletedAt(),
});

// What a venue gives for a benefit, and what intu pays for each use.
export const offers = pgTable("offers", {
  id: id(),
  venueId: uuid()
    .notNull()
    .references(() => venues.id),
  benefitType: benefitTypeEnum().notNull(),
  description: text(),
  rateMinor: integer().notNull(),
  rateCurrency: currencyEnum().notNull().default("NGN"),
  // Narrower hours than the venue's; null means whenever the venue is open.
  validHours: jsonb().$type<WeeklyHours>(),
  validFrom: date({ mode: "string" }),
  validTo: date({ mode: "string" }),
  dailyCap: integer(),
  active: boolean().notNull().default(true),
  isTest: boolean().notNull().default(false),
  ...timestamps,
  deletedAt: deletedAt(),
});
