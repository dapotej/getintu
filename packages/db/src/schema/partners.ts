import { boolean, date, doublePrecision, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import type { WeeklyHours } from "@intu/rules";
import { deletedAt, id, timestamps } from "./columns.ts";
import { categories } from "./categories.ts";
import { cityEnum, currencyEnum, offerModelEnum, venueKindEnum, venueTierEnum } from "./enums.ts";

// A business intu pays. Bank details are encrypted at field level before they reach this table.
export const partners = pgTable("partners", {
  id: id(),
  legalName: text().notNull(),
  tradingName: text().notNull(),
  contactName: text(),
  contactEmail: text(),
  contactPhone: text(),
  // The payout account (bank code and account number), encrypted with BANK_DETAILS_KEY. Only the
  // bank name, the last four digits and the account name the bank confirmed are kept in the clear.
  bankDetailsEncrypted: text(),
  payoutBankName: text(),
  payoutAccountLast4: text(),
  payoutAccountName: text(),
  // Paystack's transfer recipient for that account.
  payoutRecipientCode: text(),
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
  // A visiting service has no address: area is where it serves, opening hours its service hours,
  // and members can only use it against a confirmed booking.
  kind: venueKindEnum().notNull().default("place"),
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
  // Where it is on the map (WGS84). Empty for visiting services, which have no address.
  latitude: doublePrecision(),
  longitude: doublePrecision(),
  // A service by phone or video (doctor on call): the line members call, in E.164.
  servicePhone: text(),
  active: boolean().notNull().default(true),
  isTest: boolean().notNull().default(false),
  ...timestamps,
  deletedAt: deletedAt(),
});

// A car a chauffeur or transfer listing uses. The concierge assigns one to a booking, and drivers
// pick theirs in the scanner so each visit records it.
export const vehicles = pgTable("vehicles", {
  id: id(),
  venueId: uuid()
    .notNull()
    .references(() => venues.id),
  // As on the plate, upper case, e.g. LND 123 AB.
  plate: text().notNull(),
  // e.g. Toyota Land Cruiser.
  makeModel: text().notNull(),
  year: integer(),
  colour: text(),
  active: boolean().notNull().default(true),
  isTest: boolean().notNull().default(false),
  ...timestamps,
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
