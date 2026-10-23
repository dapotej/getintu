import { Hono } from "hono";
import { and, asc, eq, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import { one, schema, type Db, type Tx } from "@intu/db";
import { covers, USAGE_MODES } from "@intu/rules";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import { body, fail } from "../http.ts";
import { staffAudit } from "./audited.ts";
import { idParam, uuid } from "./validation.ts";

const { categories, offers, venues, partners, benefits, plans } = schema;
const LEVELS = ["category", "subcategory", "service"] as const;

const Create = z.object({ parentId: uuid.nullable(), name: z.string().trim().min(2).max(120), customerVisible: z.boolean().optional() });
// usageMode null means "the same as the entry above".
const Update = z.object({ name: z.string().trim().min(2).max(120), sortOrder: z.number().int().min(0), customerVisible: z.boolean(), active: z.boolean(), usageMode: z.enum(USAGE_MODES).nullable() }).partial();

/** The next free code under a parent: C09, C03-S08, C03-S01-T04. Codes are never reused. */
async function nextCode(tx: Tx, parent: typeof categories.$inferSelect | null) {
  const siblings = await tx
    .select({ code: categories.code })
    .from(categories)
    .where(parent ? eq(categories.parentId, parent.id) : isNull(categories.parentId));
  const n = Math.max(0, ...siblings.map((s) => Number(s.code.split("-").at(-1)?.slice(1)))) + 1;
  const pad = String(n).padStart(2, "0");
  return parent ? `${parent.code}-${parent.level === "category" ? "S" : "T"}${pad}` : `C${pad}`;
}

export function categoryRoutes(db: Db) {
  const app = new Hono<AdminEnv>();

  // The whole tree, flat and in display order; the console nests it by parentId.
  app.get("/categories", requirePermission("plans.read"), async (c) => {
    const rows = await db.select().from(categories).orderBy(asc(categories.code));
    return c.json({ categories: rows });
  });

  // One entry's page: the offers that deliver it or anything under it, and the plans whose
  // benefits include it (a benefit on it or above covers it all; one below covers part of it).
  app.get("/categories/:id", requirePermission("plans.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const [category] = await db.select().from(categories).where(eq(categories.id, id));
    if (!category) fail(404, "not_found", "Category not found");
    const offerRows = await db
      .select({
        id: offers.id,
        rateMinor: offers.rateMinor,
        rateCurrency: offers.rateCurrency,
        retailMinor: offers.retailMinor,
        offerModel: offers.offerModel,
        pricesArePlaceholders: offers.pricesArePlaceholders,
        active: offers.active,
        service: { id: categories.id, code: categories.code, name: categories.name },
        venue: { id: venues.id, name: venues.name, area: venues.area, tier: venues.tier, kind: venues.kind, active: venues.active },
        partner: { id: partners.id, tradingName: partners.tradingName },
      })
      .from(offers)
      .innerJoin(categories, eq(categories.id, offers.categoryId))
      .innerJoin(venues, eq(venues.id, offers.venueId))
      .innerJoin(partners, eq(partners.id, venues.partnerId))
      .where(and(or(eq(categories.code, category.code), like(categories.code, `${category.code}-%`)), isNull(offers.deletedAt), isNull(venues.deletedAt), isNull(partners.deletedAt)))
      .orderBy(asc(partners.tradingName), asc(venues.name), asc(categories.code));
    const benefitRows = await db
      .select({ id: benefits.id, quantity: benefits.quantity, period: benefits.period, code: categories.code, name: categories.name, plan: { id: plans.id, name: plans.name, active: plans.active } })
      .from(benefits)
      .innerJoin(categories, eq(categories.id, benefits.categoryId))
      .innerJoin(plans, eq(plans.id, benefits.planId))
      .orderBy(asc(plans.name));
    const inPlans = benefitRows
      .filter((b) => covers(b.code, category.code) || covers(category.code, b.code))
      .map(({ code, ...b }) => ({ ...b, covers: covers(code, category.code) ? ("all" as const) : ("part" as const) }));
    return c.json({ category, offers: offerRows, benefits: inPlans });
  });

  app.post("/categories", requirePermission("plans.write"), async (c) => {
    const input = await body(c, Create);
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const [parent] = input.parentId ? await tx.select().from(categories).where(eq(categories.id, input.parentId)).for("update") : [null];
      if (input.parentId && !parent) fail(422, "unknown_parent", "Parent category not found");
      if (parent?.level === "service") fail(400, "too_deep", "Service types can't have children");
      const level = LEVELS[parent ? LEVELS.indexOf(parent.level) + 1 : 0] ?? "service";
      const siblings = await tx.select({ id: categories.id }).from(categories).where(parent ? eq(categories.parentId, parent.id) : isNull(categories.parentId));
      const created = one(
        await tx
          .insert(categories)
          .values({ parentId: parent?.id ?? null, level, name: input.name, code: await nextCode(tx, parent ?? null), sortOrder: siblings.length + 1, customerVisible: input.customerVisible ?? true })
          .returning(),
      );
      await staffAudit(tx, staff, "category.created", "category", created.id, null, created);
      return created;
    });
    return c.json({ category: row }, 201);
  });

  app.patch("/categories/:id", requirePermission("plans.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, Update);
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(categories).where(eq(categories.id, id)).for("update");
      if (!before) fail(404, "not_found", "Category not found");
      // Hiding a parent hides what's under it in the member app; turning one off stops new offers using it.
      if (input.active === false) {
        const [child] = await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.parentId, id), eq(categories.active, true)));
        if (child) fail(409, "has_active_children", "Turn off the entries under it first");
      }
      const after = one(await tx.update(categories).set(input).where(eq(categories.id, id)).returning());
      await staffAudit(tx, staff, "category.updated", "category", id, before, after);
      return after;
    });
    return c.json({ category: row });
  });

  return app;
}
