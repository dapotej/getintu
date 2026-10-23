// Admin side of the intu scanner: sign-in codes and partner staff, member devices and TEST
// passes, and the queue of visits flagged for review.
import { randomInt } from "node:crypto";
import { Hono } from "hono";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { hashPin, one, schema, verifyPin, type Db } from "@intu/db";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import { body, fail, query } from "../http.ts";
import { issuePass, type PassKeys } from "../passes.ts";
import { staffAudit } from "./audited.ts";
import { idParam } from "./validation.ts";

const { categories, devices, members, memberships, redemptions, staffUsers, staffUserVenues, venues } = schema;

// No 0/O or 1/I: codes are read off a sheet and typed on a phone.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newLoginCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)]).join("");

const Pin = z.string().regex(/^\d{6}$/, "A PIN is 6 digits");
// Managers scan too, and also see the venue's statements in the partner app.
const PartnerRole = z.enum(["door_staff", "venue_manager"]);
const NewDoorStaff = z.object({ fullName: z.string().trim().min(2).max(120), pin: Pin, role: PartnerRole.default("door_staff") });
const UpdateDoorStaff = z.object({ fullName: z.string().trim().min(2).max(120), pin: Pin, active: z.boolean(), role: PartnerRole }).partial();

// Never put a PIN hash in an audit row or a response.
const publicStaff = ({ pinHash: _pin, totpSecretEncrypted: _totp, ...s }: typeof staffUsers.$inferSelect) => s;

export function scannerAdminRoutes(deps: { db: Db; passKeys: PassKeys; clock: () => Date }) {
  const { db } = deps;
  const app = new Hono<AdminEnv>();

  const venueOr404 = async (id: string) => {
    const [venue] = await db.select().from(venues).where(and(eq(venues.id, id), isNull(venues.deletedAt)));
    if (!venue) fail(404, "not_found", "Venue not found");
    return venue;
  };
  const staffAt = (venueId: string) =>
    db
      .select({ staff: staffUsers })
      .from(staffUsers)
      .innerJoin(staffUserVenues, and(eq(staffUserVenues.staffUserId, staffUsers.id), eq(staffUserVenues.venueId, venueId)))
      .where(isNull(staffUsers.deletedAt))
      .orderBy(asc(staffUsers.fullName));
  /** A PIN must be unique among a venue's active staff, since sign-in is venue code plus PIN. */
  const pinTaken = async (venueId: string, pin: string, except?: string) =>
    (await staffAt(venueId)).some(({ staff }) => staff.active && staff.id !== except && verifyPin(pin, staff.pinHash));

  app.get("/venues/:id/door-staff", requirePermission("partners.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const venue = await venueOr404(id);
    return c.json({ loginCode: venue.loginCode, staff: (await staffAt(id)).map(({ staff }) => ({ id: staff.id, fullName: staff.fullName, role: staff.role, active: staff.active, hasPin: staff.pinHash !== null })) });
  });

  app.post("/venues/:id/login-code", requirePermission("partners.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const before = await venueOr404(id);
    const staff = c.get("staff");
    for (let attempt = 0; attempt < 10; attempt++) {
      const loginCode = newLoginCode();
      const [taken] = await db.select({ id: venues.id }).from(venues).where(eq(venues.loginCode, loginCode));
      if (taken) continue;
      const after = await db.transaction(async (tx) => {
        const row = one(await tx.update(venues).set({ loginCode }).where(eq(venues.id, id)).returning());
        await staffAudit(tx, staff, "venue.login_code_set", "venue", id, { loginCode: before.loginCode }, { loginCode: row.loginCode });
        return row;
      });
      return c.json({ loginCode: after.loginCode });
    }
    fail(409, "no_code", "Couldn't make a unique code; try again");
  });

  app.post("/venues/:id/door-staff", requirePermission("partners.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const { fullName, pin, role } = await body(c, NewDoorStaff);
    const venue = await venueOr404(id);
    if (await pinTaken(id, pin)) fail(409, "pin_taken", "Someone at this venue already uses that PIN");
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const created = one(await tx.insert(staffUsers).values({ role, fullName, partnerId: venue.partnerId, pinHash: hashPin(pin), isTest: venue.isTest }).returning());
      await tx.insert(staffUserVenues).values({ staffUserId: created.id, venueId: id });
      await staffAudit(tx, staff, "door_staff.created", "staff_user", created.id, null, { ...publicStaff(created), venueId: id });
      return created;
    });
    return c.json({ staff: { id: row.id, fullName: row.fullName, role: row.role, active: row.active, hasPin: true } }, 201);
  });

  app.patch("/door-staff/:id", requirePermission("partners.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, UpdateDoorStaff);
    const [before] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
    if (!before || (before.role !== "door_staff" && before.role !== "venue_manager")) fail(404, "not_found", "Partner staff member not found");
    if (input.pin) {
      const links = await db.select({ venueId: staffUserVenues.venueId }).from(staffUserVenues).where(eq(staffUserVenues.staffUserId, id));
      for (const { venueId } of links) if (await pinTaken(venueId, input.pin, id)) fail(409, "pin_taken", "Someone at this venue already uses that PIN");
    }
    const staff = c.get("staff");
    const after = await db.transaction(async (tx) => {
      const row = one(
        await tx
          .update(staffUsers)
          .set({ ...(input.fullName ? { fullName: input.fullName } : {}), ...(input.active !== undefined ? { active: input.active } : {}), ...(input.pin ? { pinHash: hashPin(input.pin) } : {}), ...(input.role ? { role: input.role } : {}) })
          .where(eq(staffUsers.id, id))
          .returning(),
      );
      await staffAudit(tx, staff, input.pin ? "door_staff.pin_reset" : "door_staff.updated", "staff_user", id, publicStaff(before), publicStaff(row));
      return row;
    });
    return c.json({ staff: { id: after.id, fullName: after.fullName, role: after.role, active: after.active, hasPin: after.pinHash !== null } });
  });

  // Devices that hold a member's pass. Revoking one stops its codes at once online, and offline
  // as soon as scanners refresh their revocation list (every 15 minutes).
  app.get("/members/:id/devices", requirePermission("members.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const rows = await db
      .select({ id: devices.id, platform: devices.platform, createdAt: devices.createdAt, revokedAt: devices.revokedAt })
      .from(devices)
      .where(eq(devices.memberId, id))
      .orderBy(desc(devices.createdAt));
    return c.json({ devices: rows });
  });

  app.post("/devices/:id/revoke", requirePermission("members.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const { reason } = await body(c, z.object({ reason: z.string().trim().min(3).max(500) }));
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(devices).where(eq(devices.id, id)).for("update");
      if (!before) fail(404, "not_found", "Device not found");
      if (before.revokedAt) return before;
      const after = one(await tx.update(devices).set({ revokedAt: deps.clock() }).where(eq(devices.id, id)).returning());
      await staffAudit(tx, staff, "device.revoked", "device", id, before, { ...after, reason });
      return after;
    });
    return c.json({ device: { id: row.id, platform: row.platform, createdAt: row.createdAt, revokedAt: row.revokedAt } });
  });

  // A pass on a browser, for trying the scanner before the member app exists. TEST members only.
  app.post("/memberships/:id/test-pass", requirePermission("members.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const { devicePublicKey } = await body(c, z.object({ devicePublicKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "A base64url Ed25519 public key") }));
    const [ms] = await db.select({ isTest: members.isTest }).from(memberships).innerJoin(members, eq(members.id, memberships.memberId)).where(eq(memberships.id, id));
    if (!ms) fail(404, "not_found", "Membership not found");
    if (!ms.isTest) fail(403, "test_members_only", "TEST passes are only for TEST members; real members use the app");
    const pass = await issuePass(db, deps.passKeys, { membershipId: id, devicePublicKey, platform: "test-browser", actor: { type: "staff", id: c.get("staff").id } }, deps.clock());
    if (!pass) fail(404, "not_found", "Membership not found");
    return c.json({ pass: { ...pass, expiresAt: pass.expiresAt.toISOString() } }, 201);
  });

  // Visits flagged for ops: offline rule breaks and venue reports.
  app.get("/redemptions", requirePermission("members.read"), async (c) => {
    const { status } = query(c, z.object({ status: z.enum(["open", "reviewed"]).default("open") }));
    const rows = await db
      .select({
        id: redemptions.id,
        occurredAt: redemptions.occurredAt,
        serviceDate: redemptions.serviceDate,
        result: redemptions.result,
        method: redemptions.method,
        partySize: redemptions.partySize,
        flagReason: redemptions.flagReason,
        flagReviewedAt: redemptions.flagReviewedAt,
        flagReviewNote: redemptions.flagReviewNote,
        member: { id: members.id, fullName: members.fullName },
        venue: { id: venues.id, name: venues.name, partnerId: venues.partnerId },
        offerName: categories.name,
      })
      .from(redemptions)
      .innerJoin(members, eq(members.id, redemptions.memberId))
      .innerJoin(venues, eq(venues.id, redemptions.venueId))
      .innerJoin(categories, eq(categories.id, redemptions.categoryId))
      .where(and(eq(redemptions.flagged, true), status === "open" ? isNull(redemptions.flagReviewedAt) : isNotNull(redemptions.flagReviewedAt), isNull(redemptions.deletedAt)))
      .orderBy(desc(redemptions.occurredAt))
      .limit(200);
    return c.json({ redemptions: rows });
  });

  app.post("/redemptions/:id/review", requirePermission("members.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const { note } = await body(c, z.object({ note: z.string().trim().min(3).max(2000) }));
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(redemptions).where(eq(redemptions.id, id)).for("update");
      if (!before || !before.flagged) fail(404, "not_found", "No flagged visit with that id");
      const after = one(await tx.update(redemptions).set({ flagReviewedAt: deps.clock(), flagReviewedById: staff.id, flagReviewNote: note }).where(eq(redemptions.id, id)).returning());
      await staffAudit(tx, staff, "redemption.flag_reviewed", "redemption", id, before, after);
    });
    return c.json({ ok: true });
  });

  return app;
}
