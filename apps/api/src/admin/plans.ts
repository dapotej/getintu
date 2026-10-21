import { Hono } from "hono";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { one, schema, type Db } from "@intu/db";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import { body, fail } from "../http.ts";
import { staffAudit } from "./audited.ts";
import { benefitType, currency, idParam, isoDate, minorUnits, venueTier } from "./validation.ts";

const { plans, planPrices, benefits, allowances } = schema;

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
  active: z.boolean(),
});
const CreatePlan = PlanFields.partial().required({ code: true, name: true });
const UpdatePlan = PlanFields.partial();
const Prices = z.object({ prices: z.array(z.object({ currency, amountMinor: minorUnits })).max(3) });

const BenefitFields = z.object({
  type: benefitType,
  quantity: z.number().int().nonnegative().nullable(),
  period: z.enum(["per_pass", "per_month", "per_year"]),
  sharedByGroup: z.boolean(),
  capOncePerVenuePerMonth: z.boolean(),
  capOncePerVenuePerDay: z.boolean(),
  drawPerPerson: z.boolean(),
  allowedVenueTiers: z.array(venueTier).min(1),
});
const CreateBenefit = BenefitFields.partial().required({ type: true, period: true });
const UpdateBenefit = BenefitFields.omit({ type: true }).partial();

export function planRoutes(db: Db) {
  const app = new Hono<AdminEnv>();

  const loadPlan = async (id: string) => {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    if (!plan) fail(404, "not_found", "Plan not found");
    const prices = await db.select().from(planPrices).where(eq(planPrices.planId, id)).orderBy(asc(planPrices.currency));
    const planBenefits = await db.select().from(benefits).where(eq(benefits.planId, id)).orderBy(asc(benefits.type));
    return { ...plan, prices, benefits: planBenefits };
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
      const [existing] = await tx.select({ id: plans.id }).from(plans).where(eq(plans.code, input.code));
      if (existing) fail(409, "duplicate_code", `A plan with code ${input.code} already exists`);
      const row = one(await tx.insert(plans).values(input).returning());
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
      const [dup] = await tx.select({ id: benefits.id }).from(benefits).where(and(eq(benefits.planId, id), eq(benefits.type, input.type)));
      if (dup) fail(409, "duplicate_benefit", `This plan already has a ${input.type} benefit`);
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

  return app;
}
