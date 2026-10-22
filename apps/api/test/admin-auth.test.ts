import { afterAll, describe, expect, it } from "vitest";
import { generateKeyPair } from "jose";
import { createDb, schema } from "@intu/db";
import { eq } from "drizzle-orm";
import { PERMISSIONS, ROLE_PERMISSIONS } from "../src/auth/permissions.ts";
import { createStaff, signToken, testApi } from "./support/auth.ts";

const url = process.env.DATABASE_URL;

describe.runIf(url)("admin authentication", () => {
  const { db, sql } = createDb(url ?? "", { max: 5 });
  afterAll(() => sql.end());
  const { app, as } = testApi(db);
  const me = (token?: string) => app.request("/admin/me", token ? { headers: { authorization: `Bearer ${token}` } } : {});

  it("refuses a request with no token", async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("unauthenticated");
  });

  it("refuses a token signed with the wrong key, from the wrong issuer, or expired", async () => {
    const staff = await createStaff(db, "ops");
    const { privateKey: otherKey } = await generateKeyPair("ES256");
    for (const token of [
      await signToken({ sub: staff.authUserId ?? "", key: otherKey }),
      await signToken({ sub: staff.authUserId ?? "", issuer: "https://evil.example.com/auth/v1" }),
      await signToken({ sub: staff.authUserId ?? "", expiresIn: "-1m" }),
      "not-a-jwt",
    ]) {
      const res = await me(token);
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_token");
    }
  });

  it("requires two-step verification (aal2)", async () => {
    const staff = await createStaff(db, "founder");
    const res = await as(staff, "aal1").get("/admin/me");
    expect(res.status).toBe(403);
    expect(res.json.error.code).toBe("two_step_required");
  });

  it("refuses signed-in users who aren't intu staff, are deactivated, or work for a venue", async () => {
    const stranger = { authUserId: "00000000-0000-4000-8000-0000000000ff" };
    const inactive = await createStaff(db, "ops", { active: false });
    const [partner] = await db.select().from(schema.partners).limit(1);
    const doorStaff = await createStaff(db, "door_staff");
    const manager = await createStaff(db, "venue_manager", { partnerId: partner?.id ?? null });
    for (const who of [stranger, inactive, doorStaff, manager]) {
      const res = await as(who).get("/admin/me");
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe("not_staff");
    }
  });

  it("returns the staff member and their permissions", async () => {
    const staff = await createStaff(db, "concierge");
    const res = await as(staff).get("/admin/me");
    expect(res.status).toBe(200);
    expect(res.json).toEqual({
      staff: { id: staff.id, role: "concierge", fullName: staff.fullName, email: staff.email },
      permissions: ["members.read", "plans.read", "partners.read", "bookings.manage"],
    });
  });

  it("enforces each role's permissions", async () => {
    const concierge = await createStaff(db, "concierge");
    const partnerships = await createStaff(db, "partnerships");
    expect((await as(concierge).get("/admin/members")).status).toBe(200);
    expect((await as(concierge).post("/admin/plans", { code: "X", name: "TEST nope" })).json.error.code).toBe("forbidden");
    expect((await as(concierge).get("/admin/staff")).status).toBe(403);
    expect((await as(partnerships).post("/admin/partners", { legalName: "TEST Ltd", tradingName: "TEST" })).status).toBe(201);
    expect((await as(partnerships).post("/admin/members", { fullName: "TEST Nope", phone: "+999100200300" })).status).toBe(403);
  });

  it("gives founder and ops lead every permission", () => {
    expect(ROLE_PERMISSIONS.founder).toEqual(PERMISSIONS);
    expect(ROLE_PERMISSIONS.ops_lead).toEqual(PERMISSIONS);
    expect(ROLE_PERMISSIONS.door_staff).toEqual([]);
  });

  it("answers CORS preflight only for the admin origin", async () => {
    const ok = await app.request("/admin/me", { method: "OPTIONS", headers: { origin: "http://localhost:3001", "access-control-request-method": "GET" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3001");
    const other = await app.request("/admin/me", { method: "OPTIONS", headers: { origin: "https://evil.example.com", "access-control-request-method": "GET" } });
    expect(other.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("does not leak staff secrets", async () => {
    const lead = await createStaff(db, "ops_lead");
    await db.update(schema.staffUsers).set({ pinHash: "secret-hash" }).where(eq(schema.staffUsers.id, lead.id));
    const res = await as(lead).get("/admin/staff");
    const row = res.json.staff.find((s: { id: string }) => s.id === lead.id);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("pinHash");
    expect(row).not.toHaveProperty("totpSecretEncrypted");
  });
});
