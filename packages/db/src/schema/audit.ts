import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns.ts";
import { actorTypeEnum } from "./enums.ts";

// Append-only: a database trigger (see migrations) rejects updates and deletes.
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorType: actorTypeEnum().notNull(),
    actorId: uuid(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: uuid().notNull(),
    before: jsonb(),
    after: jsonb(),
  },
  (t) => [index().on(t.entity, t.entityId), index().on(t.occurredAt)],
);
