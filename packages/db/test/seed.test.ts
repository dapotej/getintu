import { afterAll, describe, expect, it } from "vitest";
import { count, inArray } from "drizzle-orm";
import { createDb, seed } from "../src/index.ts";
import { allowances, members, memberships, partners, venues } from "../src/schema/index.ts";
import { testMembers, testMemberships, testPartners, testVenues } from "../src/seed-data.ts";

describe("TEST seed data", () => {
  it("marks every record TEST and uses no real contact details", () => {
    for (const row of [...testPartners, ...testVenues, ...testMembers]) {
      expect(row.isTest).toBe(true);
    }
    for (const p of testPartners) expect(p.legalName.startsWith("TEST ")).toBe(true);
    for (const v of testVenues) expect(v.name.startsWith("TEST ")).toBe(true);
    for (const m of testMembers) {
      expect(m.fullName.startsWith("TEST ")).toBe(true);
      expect(m.email.endsWith("@example.com")).toBe(true);
      // Fiction-reserved ranges only: UK 07700 900xxx, US 555-01xx.
      expect(m.phone).toMatch(/^(\+447700900\d{3}|\+1\d{3}55501\d{2})$/);
    }
  });
});

const url = process.env.DATABASE_URL;

describe.runIf(url)("seed()", () => {
  const { db, sql } = createDb(url ?? "", { max: 1 });
  afterAll(() => sql.end());

  // Count only the seed's own rows: other test files insert members in parallel.
  const seeded = async () => ({
    partners: (await db.select({ n: count() }).from(partners).where(inArray(partners.id, testPartners.map((p) => p.id))))[0]?.n,
    venues: (await db.select({ n: count() }).from(venues).where(inArray(venues.id, testVenues.map((v) => v.id ?? ""))))[0]?.n,
    members: (await db.select({ n: count() }).from(members).where(inArray(members.id, testMembers.map((m) => m.id))))[0]?.n,
    memberships: (await db.select({ n: count() }).from(memberships).where(inArray(memberships.id, testMemberships.map((m) => m.id ?? ""))))[0]?.n,
    allowances: (await db.select({ n: count() }).from(allowances).where(inArray(allowances.membershipId, testMemberships.map((m) => m.id ?? ""))))[0]?.n,
  });

  it("can run twice without duplicating rows", async () => {
    await seed(db);
    const first = await seeded();
    await seed(db);
    expect(await seeded()).toEqual(first);
    expect(first).toMatchObject({ partners: testPartners.length, venues: testVenues.length, members: testMembers.length, memberships: testMemberships.length });
  });
});
