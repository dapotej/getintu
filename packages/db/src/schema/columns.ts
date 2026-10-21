import { timestamp, uuid } from "drizzle-orm/pg-core";

// Every table: UUID key plus created/updated timestamps, stored in UTC.
export const id = () => uuid().primaryKey().defaultRandom();

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// Soft delete, for records that money refers to.
export const deletedAt = () => timestamp({ withTimezone: true });
