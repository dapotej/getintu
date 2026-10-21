import { boolean, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./columns.ts";
import { staffRoleEnum } from "./enums.ts";
import { partners, venues } from "./partners.ts";

// Anyone logging into the partner app or admin console.
export const staffUsers = pgTable("staff_users", {
  id: id(),
  role: staffRoleEnum().notNull(),
  fullName: text().notNull(),
  email: text().unique(),
  phone: text(),
  // Door staff: personal PIN, hashed.
  pinHash: text(),
  totpSecretEncrypted: text(),
  // Set for venue staff and managers; null for the intu team.
  partnerId: uuid().references(() => partners.id),
  active: boolean().notNull().default(true),
  isTest: boolean().notNull().default(false),
  ...timestamps,
  deletedAt: deletedAt(),
});

export const staffUserVenues = pgTable(
  "staff_user_venues",
  {
    staffUserId: uuid()
      .notNull()
      .references(() => staffUsers.id),
    venueId: uuid()
      .notNull()
      .references(() => venues.id),
  },
  (t) => [primaryKey({ columns: [t.staffUserId, t.venueId] })],
);
