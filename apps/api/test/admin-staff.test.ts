import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@intu/db";
import { createStaff, testApi } from "./support/auth.ts";

const url = process.env.DATABASE_URL;

describe.runIf(url)("admin staff", () => {
  const { db, sql } = createDb(url ?? "", { max: 5 });
  afterAll(() => sql.end());
  const { as, auth } = testApi(db);

  it("invites a team member through Supabase and links their login", async () => {
    const lead = await createStaff(db, "ops_lead");
    const email = `new+${randomUUID().slice(0, 8)}@example.com`;
    const res = await as(lead).post("/admin/staff", { email: email.toUpperCase(), fullName: "TEST Concierge", role: "concierge" });
    expect(res.status).toBe(201);
    const invite = auth.invited.find((i) => i.email === email);
    expect(invite).toBeDefined();
    expect(res.json.staff).toMatchObject({ email, role: "concierge", authUserId: invite?.id, active: true });
    expect((await as(lead).post("/admin/staff", { email, fullName: "TEST Again", role: "ops" })).status).toBe(409);
  });

  it("can't invite venue roles from the admin console", async () => {
    const lead = await createStaff(db, "founder");
    expect((await as(lead).post("/admin/staff", { email: "door@example.com", fullName: "TEST Door", role: "door_staff" })).status).toBe(400);
  });

  it("deactivating someone also blocks their Supabase login, and you can't deactivate yourself", async () => {
    const lead = await createStaff(db, "ops_lead");
    const ops = await createStaff(db, "ops");
    const res = await as(lead).patch(`/admin/staff/${ops.id}`, { active: false });
    expect(res.json.staff.active).toBe(false);
    expect(auth.banned).toContain(ops.authUserId);
    expect((await as(ops).get("/admin/me")).status).toBe(403);
    expect((await as(lead).patch(`/admin/staff/${lead.id}`, { active: false })).json.error.code).toBe("cannot_change_self");
  });
});
