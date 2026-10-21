import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@intu/db";
import { redeem } from "../src/ledger/redeem.ts";
import { createStaff, testApi } from "./support/auth.ts";
import { createWorld } from "./support/fixtures.ts";

const url = process.env.DATABASE_URL;
const phone = () => `+999${randomInt(10 ** 9, 10 ** 10)}`;

describe.runIf(url)("admin members", () => {
  const { db, sql } = createDb(url ?? "", { max: 10 });
  afterAll(() => sql.end());
  const { as } = testApi(db);

  it("finds members by name, phone, email or pass number", async () => {
    const api = as(await createStaff(db, "concierge"));
    const hits = async (q: string) => (await api.get(`/admin/members?q=${encodeURIComponent(q)}`)).json.members.map((m: { fullName: string }) => m.fullName);
    expect(await hits("TEST Ada")).toContain("TEST Ada London");
    expect(await hits("+447700900002")).toContain("TEST Tunde Manchester");
    expect(await hits("member+303@example")).toContain("TEST Chioma Houston");
    expect(await hits("TEST-0005")).toEqual(["TEST Ngozi Crew Lead"]);
    expect(await hits("100%_nobody")).toEqual([]);
  });

  it("shows a member's memberships with their own and their Crew's shared allowances", async () => {
    const api = as(await createStaff(db, "ops"));
    const res = await api.get("/admin/members/00000000-0000-4000-8000-000000000306");
    expect(res.status).toBe(200);
    const crew = res.json.memberships[0];
    expect(crew.plan.code).toBe("TEST-DEC26-CREW");
    const shared = crew.allowances.filter((a: { shared: boolean }) => a.shared).map((a: { benefitType: string }) => a.benefitType).sort();
    expect(shared).toEqual(["hosted_night", "meet_assist"]);
    expect(crew.allowances).toHaveLength(9);
  });

  it("creates a member, refusing duplicate or badly formatted phone numbers", async () => {
    const api = as(await createStaff(db, "ops"));
    const p = phone();
    expect((await api.post("/admin/members", { fullName: "TEST New Member", phone: p, country: "gb" })).json.member).toMatchObject({ phone: p, country: "GB" });
    expect((await api.post("/admin/members", { fullName: "TEST Copy", phone: p })).status).toBe(409);
    expect((await api.post("/admin/members", { fullName: "TEST Local", phone: "07700900123" })).status).toBe(400);
  });

  it("adds a membership by hand and grants its allowances from the plan", async () => {
    const api = as(await createStaff(db, "ops"));
    const member = (await api.post("/admin/members", { fullName: "TEST Gifted", phone: phone() })).json.member;
    const res = await api.post(`/admin/members/${member.id}/memberships`, { planId: "00000000-0000-4000-8000-000000000402", paymentSource: "gift", arrivesOn: "2026-12-18", note: "TEST influencer pass" });
    expect(res.status).toBe(201);
    const [ms] = res.json.memberships;
    expect(ms).toMatchObject({ status: "active", startsOn: "2026-12-01", endsOn: "2027-01-10", arrivesOn: "2026-12-18", paymentSource: "gift" });
    expect(ms.allowances).toHaveLength(9);
    expect(ms.allowances.find((a: { benefitType: string }) => a.benefitType === "beach_club")).toMatchObject({ granted: 4, used: 0 });
  });

  it("suspends and reinstates, and a suspended pass is declined at the door", async () => {
    const api = as(await createStaff(db, "ops"));
    const w = await createWorld(db);
    const now = new Date("2026-12-12T13:00:00Z");
    const suspended = await api.post(`/admin/memberships/${w.first.membership.id}/suspend`, { reason: "TEST lost phone" });
    expect(suspended.json.memberships[0].status).toBe("suspended");
    expect((await api.post(`/admin/memberships/${w.first.membership.id}/suspend`, { reason: "again" })).status).toBe(409);
    expect((await redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now })).decision).toMatchObject({ reason: "MEMBERSHIP_NOT_ACTIVE" });

    await api.post(`/admin/memberships/${w.first.membership.id}/reinstate`, { reason: "TEST new phone issued" });
    expect((await redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now: new Date(now.getTime() + 60_000) })).decision.result).toBe("approved");
  });

  it("needs a reason to suspend", async () => {
    const api = as(await createStaff(db, "ops"));
    expect((await api.post(`/admin/memberships/${randomUUID()}/suspend`, {})).status).toBe(400);
  });
});
