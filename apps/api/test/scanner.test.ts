// The intu scanner end to end through the API: PIN sign-in, scanning QR and backup codes,
// offline sync with flags to ops, today's list, reports, and the admin side.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@intu/db";
import { fromBase64url, generateKeyPair, signCode, type KeyPair } from "@intu/qr";
import { createStaff, testApi } from "./support/auth.ts";
import { createWorld } from "./support/fixtures.ts";

const url = process.env.DATABASE_URL;

describe.runIf(url)("intu scanner", () => {
  const { db, sql } = createDb(url ?? "", { max: 10 });
  afterAll(() => sql.end());
  // Saturday 12 December 2026, 14:00 in Lagos.
  let now = new Date("2026-12-12T13:00:00Z");
  const { app, as, photos } = testApi(db, { clock: () => now });
  const at = (iso: string) => (now = new Date(iso));

  const request = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
    const res = await app.request(path, {
      method,
      headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.body === undefined ? {} : { "content-type": "application/json" }) },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: (await res.json()) as any };
  };

  let admin: ReturnType<typeof as>;
  beforeAll(async () => {
    admin = as(await createStaff(db, "founder"));
  });

  /** A venue with a login code and one door staff member, plus a member holding a TEST pass. */
  async function door(opts: Parameters<typeof createWorld>[1] = {}) {
    at("2026-12-12T13:00:00Z");
    const world = await createWorld(db, opts);
    const loginCode = (await admin.post(`/admin/venues/${world.venue.id}/login-code`)).json.loginCode as string;
    const pin = String(100000 + Math.floor(Math.random() * 899999));
    const staff = (await admin.post(`/admin/venues/${world.venue.id}/door-staff`, { fullName: "TEST Door Ada", pin })).json.staff;
    const token = (await request("POST", "/partner/session", { body: { venueCode: loginCode.toLowerCase(), pin } })).json.token as string;
    const pass = async (membershipId = world.first.membership.id) => {
      const device: KeyPair = generateKeyPair();
      const { json } = await admin.post(`/admin/memberships/${membershipId}/test-pass`, { devicePublicKey: Buffer.from(device.publicKey).toString("base64url") });
      const cert = fromBase64url(json.pass.certificate);
      return { ...json.pass, code: (when = now) => signCode(cert, device.secretKey, when) };
    };
    const scan = (body: Record<string, unknown>) => request("POST", "/scan", { token, body: { offerId: world.offer.id, ...body } });
    return { ...world, loginCode, pin, staff, token, pass, scan };
  }

  it("signs door staff in with the venue code and PIN, and limits wrong guesses", async () => {
    const d = await door();
    expect(d.token).toBeTruthy();
    expect((await request("POST", "/partner/session", { body: { venueCode: d.loginCode, pin: "000000" } })).status).toBe(401);
    expect((await request("POST", "/partner/session", { body: { venueCode: "NOPE99", pin: d.pin } })).status).toBe(401);
    expect((await request("GET", "/partner/venue")).status).toBe(401);
    for (let i = 0; i < 9; i++) await request("POST", "/partner/session", { body: { venueCode: d.loginCode, pin: "111111" } });
    const locked = await request("POST", "/partner/session", { body: { venueCode: d.loginCode, pin: d.pin } });
    expect(locked.status).toBe(429);
  });

  it("gives the scanner what it needs offline: offers, plan benefits, keys and revocations", async () => {
    const d = await door();
    const { json } = await request("GET", "/partner/venue", { token: d.token });
    expect(json.venue).toMatchObject({ id: d.venue.id, tier: "standard" });
    expect(json.offers).toEqual([expect.objectContaining({ id: d.offer.id, categoryCode: "C03-S01-T01", name: "Entry only" })]);
    expect(json.benefits).toEqual(expect.arrayContaining([expect.objectContaining({ planId: d.plan.id, categoryCode: "C03-S01" })]));
    expect(json.keys).toEqual([expect.objectContaining({ keyId: 1 })]);
    expect(json.revocations).toMatchObject({ devices: expect.any(Array), memberships: expect.any(Array) });
  });

  it("approves a QR scan with the member's name, then refuses the same code again", async () => {
    const d = await door();
    const pass = await d.pass();
    const code = pass.code();
    const first = await d.scan({ code });
    expect(first.json).toMatchObject({ result: "approved", remaining: 3, member: { name: d.first.member.fullName, photoUrl: null }, offer: { name: "Entry only" } });
    expect(first.json.member).not.toHaveProperty("phone");
    const again = await d.scan({ code });
    expect(again.json).toMatchObject({ result: "declined", reason: "DUPLICATE_SCAN", claimedAt: now.toISOString() });
  });

  it("keeps a listing's cars, and records the one the driver picked on each visit", async () => {
    const d = await door();
    const car = await admin.post(`/admin/venues/${d.venue.id}/vehicles`, { plate: " lnd 123   ab ", makeModel: "Toyota Land Cruiser", year: 2022, colour: "Black" });
    expect(car.status).toBe(201);
    expect(car.json.vehicle).toMatchObject({ plate: "LND 123 AB", makeModel: "Toyota Land Cruiser", year: 2022, colour: "Black", active: true });
    expect((await admin.post(`/admin/venues/${d.venue.id}/vehicles`, { plate: "LND 123 AB", makeModel: "Lexus LX 600" })).json.error.code).toBe("plate_taken");
    expect((await admin.post(`/admin/venues/${d.venue.id}/vehicles`, { plate: "!!", makeModel: "Lexus LX 600" })).status).toBe(400);
    const spare = (await admin.post(`/admin/venues/${d.venue.id}/vehicles`, { plate: "EKY 456 CD", makeModel: "Lexus LX 600" })).json.vehicle;
    expect((await admin.patch(`/admin/vehicles/${spare.id}`, { active: false })).json.vehicle.active).toBe(false);
    const [audit] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, spare.id), eq(schema.auditLog.action, "vehicle.retired")));
    expect(audit).toBeTruthy();
    expect((await admin.get(`/admin/venues/${d.venue.id}`)).json.vehicles).toHaveLength(2);

    // The scanner only offers the cars in service.
    const venue = (await request("GET", "/partner/venue", { token: d.token })).json;
    expect(venue.vehicles).toEqual([{ id: car.json.vehicle.id, plate: "LND 123 AB", makeModel: "Toyota Land Cruiser", colour: "Black", year: 2022 }]);
    const pass = await d.pass();
    const ok = await d.scan({ code: pass.code(), vehicleId: car.json.vehicle.id });
    expect(ok.json.result).toBe("approved");
    const [row] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, ok.json.redemptionId));
    expect(row?.vehicleId).toBe(car.json.vehicle.id);
    const visits = (await admin.get(`/admin/members/${d.first.member.id}`)).json.visits;
    expect(visits[0]).toMatchObject({ vehiclePlate: "LND 123 AB" });

    // Another listing's car is never recorded, and never stops the visit.
    const other = await door();
    const theirs = (await admin.post(`/admin/venues/${other.venue.id}/vehicles`, { plate: "ABC 999 XY", makeModel: "Toyota Prado" })).json.vehicle;
    const second = await (await d.pass(d.first.membership.id)).code();
    const offline = { id: randomUUID(), code: second, offerId: d.offer.id, partySize: 1, occurredAt: now.toISOString(), vehicleId: theirs.id };
    at("2026-12-12T13:30:00Z");
    expect((await request("POST", "/scan/sync", { token: d.token, body: { sentAt: now.toISOString(), visits: [offline] } })).json.results[0].status).toBe("recorded");
    const [synced] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, offline.id));
    expect(synced?.vehicleId).toBeNull();
  });

  it("shows staff the member's photo with an online result", async () => {
    const d = await door();
    const path = `${d.first.member.id}/door.jpg`;
    await photos.put(path, new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]));
    await db.update(schema.members).set({ photoPath: path }).where(eq(schema.members.id, d.first.member.id));
    const res = await d.scan({ code: (await d.pass()).code() });
    expect(res.json.member.photoUrl).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("approves exactly one of two scans of the same code at once", async () => {
    const d = await door({ quantity: 10 });
    const code = (await d.pass()).code();
    const results = await Promise.all([d.scan({ code }), d.scan({ code })]);
    expect(results.map((r) => r.json.result).sort()).toEqual(["approved", "declined"]);
  });

  it("refuses an old code, a forged one and a revoked device, and lets the next code work", async () => {
    const d = await door();
    const pass = await d.pass();
    const old = pass.code(new Date(now.getTime() - 120_000));
    expect((await d.scan({ code: old })).json).toEqual({ result: "invalid", error: "code_expired" });
    expect((await d.scan({ code: "I1.not-a-pass" })).json).toEqual({ result: "invalid", error: "malformed" });

    expect((await admin.post(`/admin/devices/${pass.deviceId}/revoke`, { reason: "TEST phone lost" })).status).toBe(200);
    expect((await d.scan({ code: pass.code() })).json).toEqual({ result: "invalid", error: "device_revoked" });
    const { json } = await request("GET", "/revocations", { token: d.token });
    expect(json.devices).toContain(pass.deviceId);

    const replacement = await d.pass();
    expect((await d.scan({ code: replacement.code() })).json.result).toBe("approved");
  });

  it("accepts today's 6-digit backup code, and stops guessing after five wrong ones", async () => {
    const d = await door();
    const pass = await d.pass();
    const today = pass.backupCodes.find((b: { validOn: string }) => b.validOn === "2026-12-12").code;
    const ok = await d.scan({ backupCode: today });
    expect(ok.json).toMatchObject({ result: "approved", member: { name: d.first.member.fullName } });
    const [row] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, ok.json.redemptionId));
    expect(row).toMatchObject({ method: "manual", scanCode: null });

    let wrong = "000000";
    if (wrong === today) wrong = "000001";
    for (let i = 0; i < 5; i++) expect((await d.scan({ backupCode: wrong })).json).toEqual({ result: "invalid", error: "unknown_backup_code" });
    expect((await d.scan({ backupCode: wrong })).status).toBe(429);
  });

  it("only scans offers at the staff member's own venue", async () => {
    const d = await door();
    const other = await door();
    const res = await request("POST", "/scan", { token: d.token, body: { offerId: other.offer.id, code: (await d.pass()).code() } });
    expect(res.status).toBe(404);
  });

  it("records offline visits once, and flags rule breaks to ops instead of reversing them", async () => {
    const d = await door({ quantity: 1 });
    const pass = await d.pass();
    // Two offline approvals at different times of the day: the second has no allowance left.
    const first = { id: randomUUID(), code: pass.code(now), offerId: d.offer.id, partySize: 1, occurredAt: now.toISOString() };
    const laterAt = new Date("2026-12-12T16:00:00Z");
    const later = { id: randomUUID(), code: pass.code(laterAt), offerId: d.offer.id, partySize: 1, occurredAt: laterAt.toISOString() };
    at("2026-12-12T17:00:00Z");
    const sync = await request("POST", "/scan/sync", { token: d.token, body: { sentAt: now.toISOString(), visits: [first, later] } });
    expect(sync.json.results).toEqual([
      { id: first.id, status: "recorded", flagged: false },
      { id: later.id, status: "recorded", flagged: true },
    ]);
    const again = await request("POST", "/scan/sync", { token: d.token, body: { sentAt: now.toISOString(), visits: [first, later] } });
    expect(again.json.results.map((r: { status: string }) => r.status)).toEqual(["already_synced", "already_synced"]);

    const rows = await db.select().from(schema.redemptions).where(eq(schema.redemptions.membershipId, d.first.membership.id));
    expect(rows.map((r) => [r.result, r.method, r.flagged]).sort()).toEqual([
      ["approved", "offline", false],
      ["approved", "offline", true],
    ]);
    const flaggedRow = rows.find((r) => r.flagged);
    expect(flaggedRow?.flagReason).toContain("ALLOWANCE_USED_UP");
    const [allowance] = await db.select().from(schema.allowances).where(eq(schema.allowances.membershipId, d.first.membership.id));
    expect(allowance).toMatchObject({ granted: 1, used: 1 });

    const queue = (await admin.get("/admin/redemptions")).json.redemptions;
    expect(queue.map((r: { id: string }) => r.id)).toContain(later.id);
    expect((await admin.post(`/admin/redemptions/${later.id}/review`, { note: "TEST venue paid; member told" })).status).toBe(200);
    expect((await admin.get("/admin/redemptions")).json.redemptions.map((r: { id: string }) => r.id)).not.toContain(later.id);
    expect((await admin.get("/admin/redemptions?status=reviewed")).json.redemptions.find((r: { id: string }) => r.id === later.id)).toMatchObject({ flagReviewNote: "TEST venue paid; member told" });
  });

  it("corrects for a scanner clock that's off, and flags an offline scan of a since-revoked device", async () => {
    const d = await door();
    const pass = await d.pass();
    await admin.post(`/admin/devices/${pass.deviceId}/revoke`, { reason: "TEST phone stolen" });
    // Five minutes later, a scanner that's offline (with an old revocation list) and whose clock
    // runs 10 minutes slow approves the stolen phone's code.
    at("2026-12-12T13:05:00Z");
    const scannerNow = new Date(now.getTime() - 10 * 60_000);
    const visit = { id: randomUUID(), code: pass.code(scannerNow), offerId: d.offer.id, partySize: 1, occurredAt: scannerNow.toISOString() };
    const sync = await request("POST", "/scan/sync", { token: d.token, body: { sentAt: scannerNow.toISOString(), visits: [visit] } });
    expect(sync.json.results).toEqual([{ id: visit.id, status: "recorded", flagged: true }]);
    const [row] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, visit.id));
    expect(row?.occurredAt.toISOString()).toBe(now.toISOString());
    expect(row?.flagReason).toContain("revoked");
  });

  it("refuses offline visits with a forged code or an impossible time", async () => {
    const d = await door();
    const pass = await d.pass();
    const visits = [
      { id: randomUUID(), code: "I1.forged-code", offerId: d.offer.id, partySize: 1, occurredAt: now.toISOString() },
      { id: randomUUID(), code: pass.code(), offerId: d.offer.id, partySize: 1, occurredAt: new Date(now.getTime() + 3600_000).toISOString() },
    ];
    const sync = await request("POST", "/scan/sync", { token: d.token, body: { sentAt: now.toISOString(), visits } });
    expect(sync.json.results).toEqual([
      { id: visits[0]?.id, status: "rejected", error: "malformed" },
      { id: visits[1]?.id, status: "rejected", error: "bad_time" },
    ]);
  });

  it("lists today's visits by name only, and lets staff report a problem with one", async () => {
    const d = await door();
    const pass = await d.pass();
    const approved = await d.scan({ code: pass.code() });
    await d.scan({ code: pass.code() });
    const { json } = await request("GET", "/partner/visits", { token: d.token });
    expect(json.date).toBe("2026-12-12");
    expect(json.visits).toHaveLength(2);
    expect(json.visits[0]).toEqual(expect.objectContaining({ memberName: d.first.member.fullName, offerName: "Entry only" }));
    expect(Object.keys(json.visits[0])).not.toContain("phone");

    const report = await request("POST", `/partner/visits/${approved.json.redemptionId}/report`, { token: d.token, body: { kind: "wrong_person", note: "TEST face didn't match the photo" } });
    expect(report.json.visit.flagged).toBe(true);
    const [row] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, approved.json.redemptionId));
    expect(row?.flagReason).toBe("Reported by TEST Door Ada: Wrong person. TEST face didn't match the photo");
    const other = await door();
    expect((await request("POST", `/partner/visits/${approved.json.redemptionId}/report`, { token: other.token, body: { kind: "other", note: "TEST not mine" } })).status).toBe(404);
  });

  it("manages door staff: unique PINs per venue, and a deactivated PIN stops working mid-shift", async () => {
    const d = await door();
    expect((await admin.post(`/admin/venues/${d.venue.id}/door-staff`, { fullName: "TEST Door Copy", pin: d.pin })).json.error.code).toBe("pin_taken");
    expect((await admin.post(`/admin/venues/${d.venue.id}/door-staff`, { fullName: "TEST Door Short", pin: "123" })).status).toBe(400);
    const list = (await admin.get(`/admin/venues/${d.venue.id}/door-staff`)).json;
    expect(list).toMatchObject({ loginCode: d.loginCode, staff: [{ id: d.staff.id, fullName: "TEST Door Ada", active: true, hasPin: true }] });
    expect(JSON.stringify(list)).not.toContain("scrypt");

    await admin.patch(`/admin/door-staff/${d.staff.id}`, { active: false });
    expect((await request("GET", "/partner/venue", { token: d.token })).status).toBe(401);
    const audits = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, d.staff.id)));
    expect(JSON.stringify(audits)).not.toContain("scrypt");
  });

  it("issues TEST passes for TEST members only", async () => {
    const d = await door();
    await db.update(schema.members).set({ isTest: false }).where(eq(schema.members.id, d.first.member.id));
    const res = await admin.post(`/admin/memberships/${d.first.membership.id}/test-pass`, { devicePublicKey: Buffer.from(generateKeyPair().publicKey).toString("base64url") });
    expect(res.json.error.code).toBe("test_members_only");
  });

  describe("visiting services (chauffeurs, home beauty)", () => {
    async function visiting() {
      const d = await door({ quantity: 3 });
      await admin.patch(`/admin/venues/${d.venue.id}`, { kind: "visiting" });
      const book = (extra: Record<string, unknown> = {}) =>
        admin.post(`/admin/members/${d.first.member.id}/bookings`, { membershipId: d.first.membership.id, venueId: d.venue.id, offerId: d.offer.id, bookingDate: "2026-12-12", ...extra });
      return { ...d, book };
    }

    it("only scans against a confirmed booking for today, and uses it up", async () => {
      const d = await visiting();
      const pass = await d.pass();
      expect((await d.scan({ code: pass.code() })).json).toMatchObject({ result: "declined", reason: "BOOKING_REQUIRED" });
      expect((await d.book({ bookingDate: "2026-12-13" })).status).toBe(201);
      expect((await d.scan({ code: pass.code() })).json).toMatchObject({ result: "declined", reason: "BOOKING_REQUIRED" });

      const booked = await d.book();
      expect(booked.status).toBe(201);
      const venueBundle = (await request("GET", "/partner/venue", { token: d.token })).json;
      expect(venueBundle.venue.kind).toBe("visiting");
      expect(venueBundle.bookings.map((b: { membershipId: string }) => b.membershipId)).toContain(d.first.membership.id);

      at("2026-12-12T13:20:00Z");
      const ok = await d.scan({ code: pass.code() });
      expect(ok.json).toMatchObject({ result: "approved", remaining: 2 });
      const [used] = await db.select().from(schema.bookings).where(and(eq(schema.bookings.membershipId, d.first.membership.id), eq(schema.bookings.bookingDate, "2026-12-12")));
      expect(used).toMatchObject({ status: "completed", redemptionId: ok.json.redemptionId });
      const today = (await request("GET", "/partner/visits", { token: d.token })).json;
      expect(today.bookings).toEqual([expect.objectContaining({ memberName: d.first.member.fullName, offerName: "Entry only", used: true })]);

      // One booking, one job: a second scan later the same day needs another booking.
      at("2026-12-12T15:00:00Z");
      expect((await d.scan({ code: pass.code() })).json).toMatchObject({ result: "declined", reason: "BOOKING_REQUIRED" });
    });

    it("lets ops reverse a job that didn't happen: allowance back, booking cancelled, visit kept as reversed", async () => {
      const d = await visiting();
      await d.book();
      const ok = await d.scan({ code: (await d.pass()).code() });
      expect(ok.json.result).toBe("approved");
      expect((await admin.post(`/admin/redemptions/${ok.json.redemptionId}/reverse`, { reason: "TEST driver never arrived" })).status).toBe(200);
      expect((await admin.post(`/admin/redemptions/${ok.json.redemptionId}/reverse`, { reason: "TEST again" })).json.error.code).toBe("cannot_reverse");

      const [allowance] = await db.select().from(schema.allowances).where(eq(schema.allowances.membershipId, d.first.membership.id));
      expect(allowance).toMatchObject({ granted: 3, used: 0 });
      const bookings = (await admin.get(`/admin/members/${d.first.member.id}/bookings`)).json.bookings;
      expect(bookings[0]).toMatchObject({ status: "cancelled", redemptionId: null });
      const visits = (await admin.get(`/admin/members/${d.first.member.id}`)).json.visits;
      expect(visits[0].reversedAt).not.toBeNull();
      const audits = await db.select({ action: schema.auditLog.action }).from(schema.auditLog).where(eq(schema.auditLog.entityId, ok.json.redemptionId));
      expect(audits.map((a) => a.action)).toContain("redemption.reversed");
    });

    it("flags an offline visit to a visiting service that had no booking", async () => {
      const d = await visiting();
      const pass = await d.pass();
      const visit = { id: randomUUID(), code: pass.code(), offerId: d.offer.id, partySize: 1, occurredAt: now.toISOString() };
      const sync = await request("POST", "/scan/sync", { token: d.token, body: { sentAt: now.toISOString(), visits: [visit] } });
      expect(sync.json.results).toEqual([{ id: visit.id, status: "recorded", flagged: true }]);
      const [row] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, visit.id));
      expect(row?.flagReason).toContain("BOOKING_REQUIRED");
    });

    it("refuses bookings outside the pass dates or for another venue's offer", async () => {
      const d = await visiting();
      expect((await d.book({ bookingDate: "2027-02-01" })).json.error.code).toBe("outside_pass_dates");
      const other = await door();
      expect((await d.book({ offerId: other.offer.id })).json.error.code).toBe("unknown_offer");
    });
  });
});
