import { boolean, index, integer, pgTable, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.ts";
import { categoryLevelEnum } from "./enums.ts";

// The catalogue tree: category (C03) → subcategory (C03-S01) → service type (C03-S01-T02).
// Codes nest, so the rules engine can tell whether a plan's benefit covers an offer.
export const categories = pgTable(
  "categories",
  {
    id: id(),
    code: text().notNull().unique(),
    parentId: uuid().references((): AnyPgColumn => categories.id),
    level: categoryLevelEnum().notNull(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    customerVisible: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
    ...timestamps,
  },
  (t) => [index().on(t.parentId)],
);
