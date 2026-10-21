// Plans, benefits, partners, venues and offers through the admin API.
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { createDb, schema } from "@intu/db";
import { redeem } from "../src/ledger/redeem.ts";
import { createStaff, testApi } from "./support/auth.ts";

const url = process.env.DATABASE_URL;
const allDay = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, [{ open: "00:00", close: "24:00" }]]));

describe.runIf(url)("admin catalogue", () => {
  const { db, sql } = createDb(url ?? "", { max: 10 });
  afterAll(() => sql.end());
  const { as } = testApi(db);
  const auditFor = (entityId: string) => db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, entityId)).orderBy(asc(schema.auditLog.occurredAt));

  it("creates a plan with prices and benefits, auditing each change as the staff member", async () => {
    const founder = await createStaff(db, "founder");
    const api = as(founder);
    const code = `TEST-${randomUUID().slice(0, 6)}`;

    const created = await api.post("/admin/plans", { code, name: "TEST Gold", durationDays: 365, groupSize: 1 });
    expect(created.status).toBe(201);
    const planId = created.json.plan.id;

    const priced = await api.put(`/admin/plans/${planId}/prices`, { prices: [{ currency: "NGN", amountMinor: 150_000_000 }, { currency: "GBP", amountMinor: 85_000 }] });
    expect(priced.json.plan.prices.map((p: { currency: string; amountMinor: number }) => [p.currency, p.amountMinor])).toEqual([
      ["GBP", 85_000],
      ["NGN", 150_000_000],
    ]);

    const withBenefit = await api.post(`/admin/plans/${planId}/benefits`, { type: "club_visit", quantity: 12, period: "per_year", capOncePerVenuePerMonth: true });
    expect(withBenefit.status).toBe(201);
    expect(withBenefit.json.plan.benefits[0]).toMatchObject({ type: "club_visit", quantity: 12, period: "per_year", capOncePerVenuePerMonth: true, allowedVenueTiers: ["standard"] });

    const audits = await auditFor(planId);
    expect(audits.map((a) => [a.action, a.actorType, a.actorId])).toEqual([
      ["plan.created", "staff", founder.id],
      ["plan.prices_set", "staff", founder.id],
    ]);
  });

  it("rejects bad input: duplicate codes, duplicate benefits, floats for money, unknown fields' types", async () => {
    const api = as(await createStaff(db, "ops_lead"));
    const code = `TEST-${randomUUID().slice(0, 6)}`;
    const { json } = await api.post("/admin/plans", { code, name: "TEST Silver" });
    expect((await api.post("/admin/plans", { code, name: "TEST again" })).status).toBe(409);
    expect((await api.put(`/admin/plans/${json.plan.id}/prices`, { prices: [{ currency: "GBP", amountMinor: 149.99 }] })).status).toBe(400);
    expect((await api.put(`/admin/plans/${json.plan.id}/prices`, { prices: [{ currency: "GBP", amountMinor: 1 }, { currency: "GBP", amountMinor: 2 }] })).status).toBe(400);
    await api.post(`/admin/plans/${json.plan.id}/benefits`, { type: "spa", period: "per_year", quantity: 3 });
    expect((await api.post(`/admin/plans/${json.plan.id}/benefits`, { type: "spa", period: "per_year", quantity: 1 })).status).toBe(409);
    expect((await api.post(`/admin/plans/${json.plan.id}/benefits`, { type: "jacuzzi", period: "per_year" })).status).toBe(400);
    expect((await api.get("/admin/plans/not-a-uuid")).status).toBe(400);
    expect((await api.get(`/admin/plans/${randomUUID()}`)).status).toBe(404);
  });

  it("won't delete a benefit members already hold", async () => {
    const api = as(await createStaff(db, "founder"));
    const [held] = await db.select({ id: schema.benefits.id }).from(schema.benefits).innerJoin(schema.allowances, eq(schema.allowances.benefitId, schema.benefits.id)).limit(1);
    const res = await api.delete(`/admin/benefits/${held?.id}`);
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("benefit_in_use");
  });

  it("makes venue tiers configurable: a top-tier venue opens to a plan once its benefit allows top tier", async () => {
    const lead = await createStaff(db, "ops_lead");
    const api = as(lead);
    const partner = (await api.post("/admin/partners", { legalName: "TEST Tiers Ltd", tradingName: "TEST Tiers" })).json.partner;
    const venue = (await api.post("/admin/venues", { partnerId: partner.id, name: "TEST Rooftop", area: "Ikoyi", city: "lagos", category: "members_club", tier: "top", openingHours: allDay })).json.venue;
    const offer = (await api.post("/admin/offers", { venueId: venue.id, benefitType: "golf", rateMinor: 4_000_000 })).json.offer;
    expect(venue.tier).toBe("top");

    const plan = (await api.post("/admin/plans", { code: `TEST-${randomUUID().slice(0, 6)}`, name: "TEST Tier plan", seasonStartsOn: "2026-12-01", seasonEndsOn: "2027-01-10" })).json.plan;
    const benefitId = (await api.post(`/admin/plans/${plan.id}/benefits`, { type: "golf", quantity: 2, period: "per_pass" })).json.plan.benefits[0].id;
    const member = (await api.post("/admin/members", { fullName: "TEST Tier Member", phone: `+999${randomInt(10 ** 9, 10 ** 10)}` })).json.member;
    const detail = (await api.post(`/admin/members/${member.id}/memberships`, { planId: plan.id, paymentSource: "gift" })).json;
    const membershipId = detail.memberships[0].id;
    const now = new Date("2026-12-12T13:00:00Z");

    const before = await redeem(db, { membershipId, venueId: venue.id, offerId: offer.id, method: "online", now });
    expect(before.decision).toMatchObject({ result: "declined", reason: "VENUE_TIER_NOT_ALLOWED" });

    await api.patch(`/admin/benefits/${benefitId}`, { allowedVenueTiers: ["standard", "top"] });
    const after = await redeem(db, { membershipId, venueId: venue.id, offerId: offer.id, method: "online", now: new Date(now.getTime() + 86_400_000) });
    expect(after.decision).toMatchObject({ result: "approved" });
  });

  it("validates venue hours and offer dates, and never returns bank details", async () => {
    const api = as(await createStaff(db, "partnerships"));
    const partner = (await api.post("/admin/partners", { legalName: "TEST Bank Ltd", tradingName: "TEST Bank" })).json.partner;
    await db.update(schema.partners).set({ bankDetailsEncrypted: "ciphertext" }).where(eq(schema.partners.id, partner.id));
    const list = (await api.get("/admin/partners")).json.partners.find((p: { id: string }) => p.id === partner.id);
    expect(list).not.toHaveProperty("bankDetailsEncrypted");
    expect(list.hasBankDetails).toBe(true);

    const badHours = { ...allDay, "6": [{ open: "25:00", close: "02:00" }] };
    expect((await api.post("/admin/venues", { partnerId: partner.id, name: "TEST Bad", area: "VI", city: "lagos", category: "nightclub", openingHours: badHours })).status).toBe(400);
    const venue = (await api.post("/admin/venues", { partnerId: partner.id, name: "TEST Good", area: "VI", city: "lagos", category: "nightclub", openingHours: allDay })).json.venue;
    expect((await api.post("/admin/offers", { venueId: venue.id, benefitType: "guest_list", rateMinor: 0, validFrom: "2026-12-10", validTo: "2026-12-01" })).status).toBe(400);
    expect((await api.post("/admin/venues", { partnerId: randomUUID(), name: "TEST Orphan", area: "VI", city: "lagos", category: "spa", openingHours: allDay })).status).toBe(422);

    const offer = (await api.post("/admin/offers", { venueId: venue.id, benefitType: "guest_list", rateMinor: 0, dailyCap: 40 })).json.offer;
    const updated = await api.patch(`/admin/offers/${offer.id}`, { dailyCap: 25, active: false });
    expect(updated.json.offer).toMatchObject({ dailyCap: 25, active: false });
    const [audit] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, offer.id), eq(schema.auditLog.action, "offer.updated")));
    expect(audit?.before).toMatchObject({ dailyCap: 40, active: true });
    expect(audit?.after).toMatchObject({ dailyCap: 25, active: false });
  });
});
