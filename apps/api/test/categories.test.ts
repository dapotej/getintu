import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@intu/db";
import { redeem } from "../src/ledger/redeem.ts";
import { createStaff, testApi } from "./support/auth.ts";
import { categoryIdOf, createWorld } from "./support/fixtures.ts";

const url = process.env.DATABASE_URL;
const now = new Date("2026-12-12T13:00:00Z");

describe.runIf(url)("catalogue API", () => {
  const { db, sql } = createDb(url ?? "", { max: 10 });
  afterAll(() => sql.end());
  const { as } = testApi(db);

  it("lists the whole tree to anyone who can see plans", async () => {
    const res = await as(await createStaff(db, "concierge")).get("/admin/categories");
    expect(res.status).toBe(200);
    const codes = res.json.categories.map((c: { code: string }) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["C01", "C03-S01", "C08-S02-T01", "C08-S03-T01"]));
    expect(res.json.categories.find((c: { code: string }) => c.code === "C08-S02").name).toBe("Doctor on call");
    expect(res.json.categories.find((c: { code: string }) => c.code === "C08-S03-T01").name).toBe("Doctor home visit");
  });

  it("adds entries with the next free code at the right level, and audits them", async () => {
    const lead = await createStaff(db, "ops_lead");
    const api = as(lead);
    const wellness = await categoryIdOf(db, "C04");
    const sub = (await api.post("/admin/categories", { parentId: wellness, name: `TEST Recovery ${randomUUID().slice(0, 4)}` })).json.category;
    expect(sub.level).toBe("subcategory");
    expect(sub.code).toMatch(/^C04-S(09|[1-9]\d)$/);
    const service = (await api.post("/admin/categories", { parentId: sub.id, name: "TEST Ice bath" })).json.category;
    expect(service).toMatchObject({ level: "service", code: `${sub.code}-T01` });
    expect((await api.post("/admin/categories", { parentId: service.id, name: "TEST Too deep" })).json.error.code).toBe("too_deep");
    const [audit] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, service.id));
    expect(audit).toMatchObject({ action: "category.created", actorId: lead.id });
  });

  it("renames, hides and turns off entries, but not a parent with live children", async () => {
    const api = as(await createStaff(db, "founder"));
    const parent = (await api.post("/admin/categories", { parentId: await categoryIdOf(db, "C07"), name: "TEST Galleries" })).json.category;
    const child = (await api.post("/admin/categories", { parentId: parent.id, name: "TEST Gallery night" })).json.category;
    expect((await api.patch(`/admin/categories/${child.id}`, { name: "TEST Late gallery night", customerVisible: false })).json.category).toMatchObject({ name: "TEST Late gallery night", customerVisible: false });
    expect((await api.patch(`/admin/categories/${parent.id}`, { active: false })).json.error.code).toBe("has_active_children");
    await api.patch(`/admin/categories/${child.id}`, { active: false });
    expect((await api.patch(`/admin/categories/${parent.id}`, { active: false })).json.category.active).toBe(false);
  });

  it("only lets plan editors change the catalogue", async () => {
    const res = await as(await createStaff(db, "partnerships")).post("/admin/categories", { parentId: null, name: "TEST Nope" });
    expect(res.status).toBe(403);
  });

  it("only takes a single service type for an offer", async () => {
    const w = await createWorld(db);
    const api = as(await createStaff(db, "partnerships"));
    const res = await api.post("/admin/offers", { venueId: w.venue.id, categoryId: await categoryIdOf(db, "C03-S01"), rateMinor: 100 });
    expect(res.json.error.code).toBe("not_a_service");
    const ok = await api.post("/admin/offers", { venueId: w.venue.id, categoryId: await categoryIdOf(db, "C03-S01-T03"), rateMinor: 2_000_000, retailMinor: 3_000_000, offerModel: "add_on" });
    expect(ok.json.offer).toMatchObject({ rateMinor: 2_000_000, retailMinor: 3_000_000, offerModel: "add_on" });
  });
});

describe.runIf(url)("benefits by category at the door", () => {
  const { db, sql } = createDb(url ?? "", { max: 10 });
  afterAll(() => sql.end());

  it("draws on the plan's most specific benefit covering the offer", async () => {
    // Plan: 2 beach club visits (C03-S01) and 1 cabana (C03-S01-T03). A cabana offer uses the cabana.
    const w = await createWorld(db, { benefitCode: "C03-S01", offerCode: "C03-S01-T03", quantity: 2 });
    const cabana = (
      await db
        .insert(schema.benefits)
        .values({ planId: w.plan.id, categoryId: await categoryIdOf(db, "C03-S01-T03"), quantity: 1, period: "per_pass" })
        .returning()
    )[0]!;
    await db.insert(schema.allowances).values({ benefitId: cabana.id, membershipId: w.first.membership.id, periodStart: "2026-12-01", periodEnd: "2027-01-10", granted: 1 });

    const r = await redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now });
    expect(r.decision).toMatchObject({ result: "approved", remaining: 0 });
    const [row] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, r.redemptionId));
    expect(row).toMatchObject({ benefitId: cabana.id, categoryId: await categoryIdOf(db, "C03-S01-T03") });
    const beach = await db.select().from(schema.allowances).where(eq(schema.allowances.membershipId, w.first.membership.id));
    expect(beach.map((a) => [a.benefitId === cabana.id ? "cabana" : "beach", a.used]).sort()).toEqual([
      ["beach", 0],
      ["cabana", 1],
    ]);
  });

  it("covers everything under a whole-category benefit", async () => {
    const w = await createWorld(db, { benefitCode: "C03", offerCode: "C03-S04-T02" });
    const r = await redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now });
    expect(r.decision.result).toBe("approved");
  });

  it("declines an offer outside every benefit in the plan, recording no benefit", async () => {
    const w = await createWorld(db, { benefitCode: "C03-S01", offerCode: "C04-S05-T01" });
    const r = await redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now });
    expect(r.decision).toMatchObject({ result: "declined", reason: "BENEFIT_NOT_IN_PLAN" });
    const [row] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, r.redemptionId));
    expect(row?.benefitId).toBeNull();
  });
});
