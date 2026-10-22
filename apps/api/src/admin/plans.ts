import { Hono } from "hono";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { one, schema, type Db } from "@intu/db";
import { costPlan, covers } from "@intu/rules";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import { body, fail } from "../http.ts";
import { staffAudit } from "./audited.ts";
import { currency, idParam, isoDate, minorUnits, uuid, venueTier } from "./validation.ts";

const { plans, planPrices, benefits, allowances, categories, offers, venues, partners, fxRates } = schema;

// Audit rows need an entity id; exchange rates are one settings record.
const FX_RATES_ENTITY = "00000000-0000-0000-0000-000000000000";

const PlanFields = z.object({
  code: z.string().min(2).max(40),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).nullable(),
  seasonStartsOn: isoDate.nullable(),
  seasonEndsOn: isoDate.nullable(),
  durationDays: z.number().int().positive().nullable(),
  onSaleFrom: isoDate.nullable(),
  onSaleTo: isoDate.nullable(),
  groupSize: z.number().int().min(1).max(20),
  overheadPerMemberMinor: minorUnits,
  active: z.boolean(),
});
const CreatePlan = PlanFields.partial().required({ name: true });

// Words that don't tell plans apart.
const FILLER = new Set(["A", "AN", "AND", "THE", "OF", "FOR", "PASS", "PLAN", "MEMBERSHIP"]);

/**
 * A short plan code from its name: up to four words, short words whole, longer ones cut to three
 * letters, years to two digits. "December Pass Plus 2027" becomes DEC-PLUS-27.
 */
export function planCodeFrom(name: string) {
  const words = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const kept = words.filter((w) => !FILLER.has(w));
  const parts = (kept.length ? kept : words).slice(0, 4).map((w) => (/^(19|20)\d\d$/.test(w) ? w.slice(2) : w.length <= 4 ? w : w.slice(0, 3)));
  return parts.join("-") || "PLAN";
}
const UpdatePlan = PlanFields.partial();
const Prices = z.object({ prices: z.array(z.object({ currency, amountMinor: minorUnits })).max(3) });

const BenefitFields = z.object({
  categoryId: uuid,
  quantity: z.number().int().nonnegative().nullable(),
  period: z.enum(["per_pass", "per_month", "per_year"]),
  sharedByGroup: z.boolean(),
  capOncePerVenuePerMonth: z.boolean(),
  capOncePerVenuePerDay: z.boolean(),
  drawPerPerson: z.boolean(),
  allowedVenueTiers: z.array(venueTier).min(1),
  costBasis: z.enum(["per_use", "flat_per_member"]),
  plannedCostMinor: minorUnits.nullable(),
  expectedUsePct: z.number().int().min(0).max(100),
});
const CreateBenefit = BenefitFields.partial().required({ categoryId: true, period: true });
const UpdateBenefit = BenefitFields.omit({ categoryId: true }).partial();
const Rates = z.object({ rates: z.array(z.object({ currency: z.enum(["GBP", "USD"]), koboPerUnit: z.number().int().positive() })).max(2) });

export function planRoutes(db: Db) {
  const app = new Hono<AdminEnv>();

  const loadPlan = async (id: string) => {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    if (!plan) fail(404, "not_found", "Plan not found");
    const prices = await db.select().from(planPrices).where(eq(planPrices.planId, id)).orderBy(asc(planPrices.currency));
    const planBenefits = await db
      .select({ benefit: benefits, category: { id: categories.id, code: categories.code, name: categories.name, level: categories.level } })
      .from(benefits)
      .innerJoin(categories, eq(categories.id, benefits.categoryId))
      .where(eq(benefits.planId, id))
      .orderBy(asc(categories.code));
    // What each benefit can be used at: active offers at active venues of the tiers it allows.
    const live = await db
      .select({ rateMinor: offers.rateMinor, placeholder: offers.pricesArePlaceholders, code: categories.code, tier: venues.tier })
      .from(offers)
      .innerJoin(categories, eq(categories.id, offers.categoryId))
      .innerJoin(venues, eq(venues.id, offers.venueId))
      .innerJoin(partners, eq(partners.id, venues.partnerId))
      .where(and(eq(offers.active, true), isNull(offers.deletedAt), eq(venues.active, true), isNull(venues.deletedAt), eq(partners.active, true), isNull(partners.deletedAt)));
    const rates = Object.fromEntries((await db.select().from(fxRates)).map((r) => [r.currency, r.koboPerUnit]));
    const costing = costPlan(
      { ...plan, prices },
      planBenefits.map(({ benefit: b, category }) => ({
        ...b,
        offers: live.filter((o) => covers(category.code, o.code) && b.allowedVenueTiers.includes(o.tier)),
      })),
      rates,
    );
    return { ...plan, prices, benefits: planBenefits.map((b) => ({ ...b.benefit, category: b.category })), costing };
  };

  app.get("/plans", requirePermission("plans.read"), async (c) => {
    const rows = await db.select().from(plans).orderBy(asc(plans.name));
    const prices = await db.select().from(planPrices);
    return c.json({ plans: rows.map((p) => ({ ...p, prices: prices.filter((x) => x.planId === p.id) })) });
  });

  app.get("/plans/:id", requirePermission("plans.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    return c.json({ plan: await loadPlan(id) });
  });

  app.post("/plans", requirePermission("plans.write"), async (c) => {
    const input = await body(c, CreatePlan);
    const staff = c.get("staff");
    const plan = await db.transaction(async (tx) => {
      const taken = async (code: string) => (await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, code))).length > 0;
      let code = input.code;
      if (code) {
        if (await taken(code)) fail(409, "duplicate_code", `A plan with code ${code} already exists`);
      } else {
        // Made from the name; a number on the end when another plan has it.
        const base = planCodeFrom(input.name);
        code = base;
        for (let n = 2; await taken(code); n++) code = `${base}-${n}`;
      }
      const row = one(await tx.insert(plans).values({ ...input, code }).returning());
      await staffAudit(tx, staff, "plan.created", "plan", row.id, null, row);
      return row;
    });
    return c.json({ plan: await loadPlan(plan.id) }, 201);
  });

  app.patch("/plans/:id", requirePermission("plans.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, UpdatePlan);
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(plans).where(eq(plans.id, id)).for("update");
      if (!before) fail(404, "not_found", "Plan not found");
      const after = one(await tx.update(plans).set(input).where(eq(plans.id, id)).returning());
      await staffAudit(tx, staff, "plan.updated", "plan", id, before, after);
    });
    return c.json({ plan: await loadPlan(id) });
  });

  app.put("/plans/:id/prices", requirePermission("plans.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const { prices } = await body(c, Prices);
    if (new Set(prices.map((p) => p.currency)).size !== prices.length) fail(400, "duplicate_currency", "One price per currency");
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      const [plan] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, id)).for("update");
      if (!plan) fail(404, "not_found", "Plan not found");
      const before = await tx.select().from(planPrices).where(eq(planPrices.planId, id));
      await tx.delete(planPrices).where(eq(planPrices.planId, id));
      const after = prices.length ? await tx.insert(planPrices).values(prices.map((p) => ({ ...p, planId: id }))).returning() : [];
      await staffAudit(tx, staff, "plan.prices_set", "plan", id, before, after);
    });
    return c.json({ plan: await loadPlan(id) });
  });

  app.post("/plans/:id/benefits", requirePermission("plans.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, CreateBenefit);
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      const [plan] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.id, id));
      if (!plan) fail(404, "not_found", "Plan not found");
      const [category] = await tx.select().from(categories).where(eq(categories.id, input.categoryId));
      if (!category) fail(422, "unknown_category", "Category not found");
      const [dup] = await tx.select({ id: benefits.id }).from(benefits).where(and(eq(benefits.planId, id), eq(benefits.categoryId, input.categoryId)));
      if (dup) fail(409, "duplicate_benefit", `This plan already has a ${category.name} benefit`);
      const row = one(await tx.insert(benefits).values({ ...input, planId: id }).returning());
      await staffAudit(tx, staff, "benefit.created", "benefit", row.id, null, row);
    });
    return c.json({ plan: await loadPlan(id) }, 201);
  });

  app.patch("/benefits/:id", requirePermission("plans.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, UpdateBenefit);
    const staff = c.get("staff");
    const planId = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(benefits).where(eq(benefits.id, id)).for("update");
      if (!before) fail(404, "not_found", "Benefit not found");
      const after = one(await tx.update(benefits).set(input).where(eq(benefits.id, id)).returning());
      await staffAudit(tx, staff, "benefit.updated", "benefit", id, before, after);
      return before.planId;
    });
    return c.json({ plan: await loadPlan(planId) });
  });

  app.delete("/benefits/:id", requirePermission("plans.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const staff = c.get("staff");
    const planId = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(benefits).where(eq(benefits.id, id)).for("update");
      if (!before) fail(404, "not_found", "Benefit not found");
      const [used] = await tx.select({ n: count() }).from(allowances).where(eq(allowances.benefitId, id));
      if ((used?.n ?? 0) > 0) fail(409, "benefit_in_use", "Members already hold allowances for this benefit; set its quantity instead");
      await tx.delete(benefits).where(eq(benefits.id, id));
      await staffAudit(tx, staff, "benefit.deleted", "benefit", id, before, null);
      return before.planId;
    });
    return c.json({ plan: await loadPlan(planId) });
  });

  // Planning exchange rates, used only to show margins on pound and dollar prices.
  app.get("/fx-rates", requirePermission("plans.read"), async (c) => {
    return c.json({ rates: await db.select().from(fxRates).orderBy(asc(fxRates.currency)) });
  });

  app.put("/fx-rates", requirePermission("plans.write"), async (c) => {
    const { rates } = await body(c, Rates);
    if (new Set(rates.map((r) => r.currency)).size !== rates.length) fail(400, "duplicate_currency", "One rate per currency");
    const staff = c.get("staff");
    const after = await db.transaction(async (tx) => {
      const before = await tx.select().from(fxRates).orderBy(asc(fxRates.currency));
      for (const r of rates) {
        await tx.insert(fxRates).values(r).onConflictDoUpdate({ target: fxRates.currency, set: { koboPerUnit: r.koboPerUnit, updatedAt: new Date() } });
      }
      const rows = await tx.select().from(fxRates).orderBy(asc(fxRates.currency));
      await staffAudit(tx, staff, "fx_rates.set", "fx_rates", FX_RATES_ENTITY, before, rows);
      return rows;
    });
    return c.json({ rates: after });
  });

  return app;
}
