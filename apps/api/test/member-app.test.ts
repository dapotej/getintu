import { createHmac, randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@intu/db";
import { generateKeyPair, toBase64url } from "@intu/qr";
import { redeem } from "../src/ledger/redeem.ts";
import { verifyWebhook } from "../src/member/sms-hook.ts";
import { createStaff, SMS_HOOK_SECRET, TEST_CONCIERGE, TEST_DOCTOR, testApi } from "./support/auth.ts";
import { categoryIdOf, createWorld } from "./support/fixtures.ts";

const url = process.env.DATABASE_URL;
const now = new Date("2026-12-12T13:00:00Z");
const fakePhone = () => `+999${randomInt(10 ** 9, 10 ** 10)}`;
// The smallest bytes that pass as a JPEG: the start-of-image marker and some data.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]).toString("base64");

describe.runIf(url)("member app API", () => {
  const { db, sql } = createDb(url ?? "", { max: 10 });
  afterAll(() => sql.end());
  const { as, asMember, photos, sent, app } = testApi(db, { clock: () => now });

  /** A member who has signed in to the app once (linked by phone). */
  const signedIn = async (world: Awaited<ReturnType<typeof createWorld>>, i = 0) => {
    const person = world.people[i]!;
    const client = asMember({ authUserId: randomUUID(), phone: person.member.phone });
    expect((await client.get("/me")).status).toBe(200);
    return client;
  };

  it("links a sign-in to the member with the same phone the first time, and audits it", async () => {
    const world = await createWorld(db);
    const authUserId = randomUUID();
    const me = (await asMember({ authUserId, phone: world.first.member.phone }).get("/me")).json;
    expect(me.member).toMatchObject({ id: world.first.member.id, fullName: world.first.member.fullName, photoUrl: null });
    expect(me.concierge).toEqual({ whatsapp: TEST_CONCIERGE });
    const [row] = await db.select().from(schema.members).where(eq(schema.members.id, world.first.member.id));
    expect(row?.authUserId).toBe(authUserId);
    const [audit] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, world.first.member.id), eq(schema.auditLog.action, "member.signed_in_first_time")));
    expect(audit).toMatchObject({ actorType: "member", actorId: world.first.member.id });
    // Signing in again on the same account finds them by sign-in, even if the number changed later.
    expect((await asMember({ authUserId, phone: fakePhone() }).get("/me")).json.member.id).toBe(world.first.member.id);
  });

  it("refuses staff sign-ins and unsigned requests", async () => {
    const staff = await createStaff(db, "ops");
    expect((await as(staff).get("/me")).json.error.code).toBe("not_a_member");
    expect((await app.request("/me")).status).toBe(401);
  });

  it("signs up a new phone number once the terms are accepted, as TEST data outside production", async () => {
    const phone = fakePhone();
    const client = asMember({ authUserId: randomUUID(), phone });
    expect((await client.get("/me")).json).toMatchObject({ member: null, phone });
    expect((await client.get("/me/memberships")).json.error.code).toBe("no_profile");
    expect((await client.put("/me", { fullName: "TEST New Member" })).json.error.code).toBe("terms_required");
    const res = await client.put("/me", { fullName: "TEST New Member", email: "new@example.com", country: "GB", acceptTerms: true });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(schema.members).where(eq(schema.members.phone, phone));
    expect(row).toMatchObject({ fullName: "TEST New Member", isTest: true, country: "GB" });
    expect(row?.consentTermsAt).not.toBeNull();
    expect((await client.put("/me", { fullName: "TEST Renamed", consentMarketing: true })).status).toBe(200);
    // A second account can't take a number that's already a member's.
    const other = asMember({ authUserId: randomUUID(), phone });
    expect((await other.get("/me")).json.member).toBeNull();
    expect((await other.put("/me", { fullName: "TEST Copycat", acceptTerms: true })).json.error.code).toBe("phone_in_use");
  });

  it("stores the photo privately and shows it through a signed link", async () => {
    const world = await createWorld(db);
    const client = await signedIn(world);
    expect((await client.put("/me/photo", { jpegBase64: Buffer.from("not a jpeg at all, just some text that is long enough to pass the size check of the API").toString("base64") })).json.error.code).toBe("not_jpeg");
    const res = await client.put("/me/photo", { jpegBase64: jpeg });
    expect(res.json.photoUrl).toMatch(/^data:image\/jpeg;base64,/);
    const [row] = await db.select().from(schema.members).where(eq(schema.members.id, world.first.member.id));
    expect(row?.photoPath).toMatch(new RegExp(`^${world.first.member.id}/.+\\.jpg$`));
    expect(photos.saved.has(row?.photoPath ?? "")).toBe(true);
    expect((await client.get("/me")).json.member.photoUrl).toBe(res.json.photoUrl);
  });

  it("lists my passes with what's left, and my approved visits", async () => {
    const world = await createWorld(db, { quantity: 4 });
    const client = await signedIn(world);
    await redeem(db, { membershipId: world.first.membership.id, venueId: world.venue.id, offerId: world.offer.id, method: "online", partySize: 1, now });
    const { memberships } = (await client.get("/me/memberships")).json;
    expect(memberships).toEqual([
      expect.objectContaining({
        id: world.first.membership.id,
        plan: { id: world.plan.id, name: world.plan.name },
        status: "active",
        allowances: [expect.objectContaining({ name: "Beach Clubs", granted: 4, used: 1, remaining: 3, night: false, period: "per_pass", periodEnd: "2027-01-10" })],
      }),
    ]);
    const { visits } = (await client.get("/me/visits")).json;
    expect(visits).toEqual([expect.objectContaining({ venue: expect.objectContaining({ id: world.venue.id }), service: "Entry only", partySize: 1 })]);
  });

  it("registers this phone's pass key, renews the pass on it, and stops once the device is revoked", async () => {
    const world = await createWorld(db);
    const client = await signedIn(world);
    const key = toBase64url(generateKeyPair().publicKey);
    const registered = await client.post("/me/devices", { membershipId: world.first.membership.id, publicKey: key, platform: "ios" });
    expect(registered.status).toBe(201);
    expect(registered.json.pass).toMatchObject({ certificate: expect.any(String), backupCodes: [expect.objectContaining({ validOn: "2026-12-12" }), expect.objectContaining({ validOn: "2026-12-13" })] });
    const deviceId = registered.json.pass.deviceId;
    const renewed = await client.post(`/me/devices/${deviceId}/pass`, { membershipId: world.first.membership.id });
    expect(renewed.json.pass.deviceId).toBe(deviceId);
    expect(renewed.json.pass.backupCodes[0].code).toBe(registered.json.pass.backupCodes[0].code);

    // Someone else's pass, or someone else's device, is refused.
    const other = await createWorld(db);
    const otherClient = await signedIn(other);
    expect((await client.post("/me/devices", { membershipId: other.first.membership.id, publicKey: key, platform: "ios" })).status).toBe(404);
    expect((await otherClient.post(`/me/devices/${deviceId}/pass`, { membershipId: other.first.membership.id })).json.error.code).toBe("device_not_found");

    await db.update(schema.devices).set({ revokedAt: now }).where(eq(schema.devices.id, deviceId));
    expect((await client.post(`/me/devices/${deviceId}/pass`, { membershipId: world.first.membership.id })).json.error.code).toBe("device_not_found");
  });

  it("lists venues, marking what my plan includes with the same tier rules as a scan", async () => {
    const world = await createWorld(db);
    const client = await signedIn(world);
    // A top-tier beach club: the plan's beach benefit only opens standard venues.
    const topTier = (await db.insert(schema.venues).values({ partnerId: world.venue.partnerId, name: `TEST Top ${randomUUID().slice(0, 4)}`, area: "Ikoyi", city: "lagos", categoryId: await categoryIdOf(db, "C03-S01"), tier: "top", openingHours: world.venue.openingHours, latitude: 6.45, longitude: 3.43, isTest: true }).returning())[0]!;
    await db.insert(schema.offers).values({ venueId: topTier.id, categoryId: await categoryIdOf(db, "C03-S01-T01"), rateMinor: 1_000_000, isTest: true });
    // A spa, which the plan doesn't cover at all.
    const spa = (await db.insert(schema.venues).values({ partnerId: world.venue.partnerId, name: `TEST Spa ${randomUUID().slice(0, 4)}`, area: "Ikoyi", city: "lagos", categoryId: await categoryIdOf(db, "C04-S05"), openingHours: world.venue.openingHours, isTest: true }).returning())[0]!;
    await db.insert(schema.offers).values({ venueId: spa.id, categoryId: await categoryIdOf(db, "C04-S05-T01"), rateMinor: 1_000_000, isTest: true });

    const { venues } = (await client.get("/venues")).json;
    const find = (id: string) => venues.find((v: { id: string }) => v.id === id);
    expect(find(world.venue.id)).toMatchObject({ included: true, openNow: true, night: false, offers: [expect.objectContaining({ id: world.offer.id, included: true })] });
    expect(find(topTier.id)).toMatchObject({ included: false, latitude: 6.45, longitude: 3.43 });
    expect(find(spa.id)).toMatchObject({ included: false, category: { code: "C04-S05", name: "Spa & Massage" } });
    expect((await client.get(`/venues/${spa.id}`)).json.venue.id).toBe(spa.id);
    expect((await client.get(`/venues/${randomUUID()}`)).status).toBe(404);
  });

  it("shows the doctor-on-call line only to members whose plan includes it", async () => {
    const without = await createWorld(db);
    expect((await (await signedIn(without)).get("/me")).json.doctorOnCall).toBeNull();
    const withDoctor = await createWorld(db, { benefitCode: "C08-S02", offerCode: "C08-S02-T01" });
    expect((await (await signedIn(withDoctor)).get("/me")).json.doctorOnCall).toEqual({ phone: TEST_DOCTOR });
  });

  it("takes booking requests for dates on my pass, for the concierge to confirm", async () => {
    const world = await createWorld(db);
    const client = await signedIn(world);
    const request = { membershipId: world.first.membership.id, venueId: world.venue.id, offerId: world.offer.id, bookingDate: "2026-12-20", partySize: 4, notes: "TEST birthday" };
    const res = await client.post("/bookings", request);
    expect(res.status).toBe(201);
    expect(res.json.booking).toMatchObject({ status: "requested", bookingDate: "2026-12-20", partySize: 4, offerName: "Entry only", venue: expect.objectContaining({ id: world.venue.id }) });
    const [audit] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, res.json.booking.id), eq(schema.auditLog.action, "booking.requested")));
    expect(audit?.actorType).toBe("member");
    expect((await client.get("/bookings")).json.bookings.map((b: { id: string }) => b.id)).toEqual([res.json.booking.id]);

    expect((await client.post("/bookings", { ...request, bookingDate: "2026-12-11" })).json.error.code).toBe("date_past");
    expect((await client.post("/bookings", { ...request, bookingDate: "2027-02-01" })).json.error.code).toBe("outside_pass_dates");
    const other = await createWorld(db);
    expect((await client.post("/bookings", { ...request, membershipId: other.first.membership.id })).json.error.code).toBe("unknown_membership");
    expect((await client.post("/bookings", { ...request, offerId: other.offer.id })).json.error.code).toBe("unknown_offer");
    await db.update(schema.memberships).set({ status: "suspended" }).where(eq(schema.memberships.id, world.first.membership.id));
    expect((await client.post("/bookings", request)).json.error.code).toBe("membership_inactive");
  });

  describe("Supabase's Send SMS hook", () => {
    const sign = (id: string, timestamp: string, body: string) =>
      `v1,${createHmac("sha256", Buffer.from(SMS_HOOK_SECRET.replace("v1,whsec_", ""), "base64")).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
    const call = (body: string, headers: Record<string, string>) => app.request("/auth/sms-hook", { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

    it("hands the code to the sender when Supabase signed the request", async () => {
      const body = JSON.stringify({ user: { id: randomUUID(), phone: "9991234567890" }, sms: { otp: "123456" } });
      const ts = String(Math.floor(now.getTime() / 1000));
      const res = await call(body, { "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": sign("msg_1", ts, body) });
      expect(res.status).toBe(200);
      expect(sent).toContainEqual({ phone: "+9991234567890", code: "123456" });
    });

    it("refuses a wrong signature, a changed body, or an old timestamp", async () => {
      const body = JSON.stringify({ user: { phone: "9991234567891" }, sms: { otp: "654321" } });
      const ts = String(Math.floor(now.getTime() / 1000));
      expect((await call(body, { "webhook-id": "msg_2", "webhook-timestamp": ts, "webhook-signature": "v1,AAAA" })).status).toBe(401);
      expect((await call(body.replace("654321", "000000"), { "webhook-id": "msg_2", "webhook-timestamp": ts, "webhook-signature": sign("msg_2", ts, body) })).status).toBe(401);
      const old = String(Math.floor(now.getTime() / 1000) - 600);
      expect(verifyWebhook(SMS_HOOK_SECRET, { id: "msg_3", timestamp: old, signature: sign("msg_3", old, body) }, body, now)).toBe(false);
      expect(sent.some((s) => s.code === "654321" || s.code === "000000")).toBe(false);
    });
  });
});
