import { afterAll, describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { createDb, seed } from "../src/index.ts";
import { members, partners, venues } from "../src/schema/index.ts";
import { testMembers, testPartners, testVenues } from "../src/seed-data.ts";

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

  it("can run twice without duplicating rows", async () => {
    await seed(db);
    await seed(db);
    const [p] = await db.select({ n: count() }).from(partners);
    const [v] = await db.select({ n: count() }).from(venues);
    const [m] = await db.select({ n: count() }).from(members);
    expect(p?.n).toBeGreaterThanOrEqual(testPartners.length);
    expect(v?.n).toBeGreaterThanOrEqual(testVenues.length);
    expect(m?.n).toBeGreaterThanOrEqual(testMembers.length);
    const again = await seed(db);
    const [m2] = await db.select({ n: count() }).from(members);
    expect(m2?.n).toBe(m?.n);
    expect(again.members).toBe(testMembers.length);
  });
});
