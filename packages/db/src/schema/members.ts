import { boolean, char, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./columns.ts";

// A person. Phone (E.164) is the login. Partners only ever see name and photo.
export const members = pgTable("members", {
  id: id(),
  fullName: text().notNull(),
  phone: text().notNull().unique(),
  email: text(),
  // Path in private storage; served only through signed URLs.
  photoPath: text(),
  // ISO 3166-1 alpha-2.
  country: char({ length: 2 }),
  consentTermsAt: timestamp({ withTimezone: true }),
  consentMarketing: boolean().notNull().default(false),
  isTest: boolean().notNull().default(false),
  ...timestamps,
  deletedAt: deletedAt(),
});
