import { boolean, date, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { WeeklyHours } from "@intu/rules";
import { deletedAt, id, timestamps } from "./columns.ts";
import { categories } from "./categories.ts";
import { cityEnum, currencyEnum, offerModelEnum, venueTierEnum } from "./enums.ts";

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
  // What kind of place it is: a catalogue category or subcategory (Beach Clubs, Gyms…).
  categoryId: uuid()
    .notNull()
    .references(() => categories.id),
  tier: venueTierEnum().notNull().default("standard"),
  description: text(),
  openingHours: jsonb().$type<OpeningHours>().notNull(),
  capacityNotes: text(),
  // What door staff type with their PIN to sign in to the scanner, e.g. K7Q2MX.
  loginCode: text().unique(),
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
  // The service type delivered.
  categoryId: uuid()
    .notNull()
    .references(() => categories.id),
  description: text(),
  // What intu pays the partner per use (cost price).
  rateMinor: integer().notNull(),
  // What a member pays when it's sold as an add-on. Markup is worked out, never stored.
  retailMinor: integer(),
  offerModel: offerModelEnum().notNull().default("included"),
  pricesArePlaceholders: boolean().notNull().default(false),
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
