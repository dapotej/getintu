import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq, ilike } from "drizzle-orm";
import { createDb, schema } from "@intu/db";
import { importPartnerPipeline, PLACEHOLDER_COST_MINOR } from "../src/import/partners.ts";
import { createStaff, testApi } from "./support/auth.ts";
import { categoryIdOf } from "./support/fixtures.ts";

const url = process.env.DATABASE_URL;
const HEADER = "Partner / Lead,Main Category,Subcategory,Proposed Offer,Priority,Status,Offer Model,Net Cost (NGN),Margin,Retail Price (NGN),Contact / Owner,Next Action,Notes";

/** Rows in the shape of the "Lagos Partner Pipeline" tab, with TEST names unique to each run. */
function sheet() {
  const tag = randomUUID().slice(0, 6);
  const name = (n: string) => `TEST ${n} ${tag}`;
  const csv = [
    HEADER,
    `${name("Airport protocol")},Arrival & Travel,Airport Protocol,Meet-and-assist,P1,Prospect,Included / Add-on,30000.0,0.5,45000,,,`,
    `${name("Beach")},Beach & Water,Beach Clubs,Entry + F&B credit,P1,Prospect,Credits,,,0,,Call the GM,`,
    `${name("Cinema")},Arts & Experiences,Cinema,Private screening,P2,To verify,Paid add-on,,,0,TEST Owner,,Check capacity`,
    `${name("Mystery")},Space,Moon Walks,Lunar visit,P9,Personal lead,Member privilege,,,0,,,`,
    `${name("Doctor")},Lifestyle Services,Healthcare Assistance,24/7 medical guidance,P2,To verify,Member privilege / Credits,,,0,,,`,
  ].join("\n");
  return { csv, name };
}

describe.runIf(url)("partner pipeline import", () => {
  const { db, sql } = createDb(url ?? "", { max: 5 });
  afterAll(() => sql.end());
  const actor = { type: "system" as const };
  const find = async (name: string) => (await db.select().from(schema.partners).where(ilike(schema.partners.tradingName, name)))[0];

  it("imports each lead with its status, category, offer model and prices", async () => {
    const s = sheet();
    const report = await importPartnerPipeline(db, { csv: s.csv, dryRun: false, actor });
    expect(report.errors).toEqual([]);
    expect(report.counts).toEqual({ created: 5, updated: 0, unchanged: 0 });
    // The sheet's old name for Doctor on call still finds it; credits come in as what's left of the model.
    expect(await find(s.name("Doctor"))).toMatchObject({ categoryId: await categoryIdOf(db, "C08-S02"), offerModel: "member_privilege" });

    expect(await find(s.name("Airport protocol"))).toMatchObject({
      status: "prospect",
      priority: "P1",
      categoryId: await categoryIdOf(db, "C01-S01"),
      proposedOffer: "Meet-and-assist",
      offerModel: "included_or_add_on",
      proposedCostMinor: 3_000_000,
      proposedRetailMinor: 4_500_000,
      pricesArePlaceholders: false,
    });
    // No costs yet: placeholders, flagged as such.
    expect(await find(s.name("Cinema"))).toMatchObject({ status: "to_verify", offerModel: "add_on", proposedCostMinor: PLACEHOLDER_COST_MINOR, proposedRetailMinor: 3_750_000, pricesArePlaceholders: true, contactName: "TEST Owner", notes: "Check capacity" });
    // There are no credits: credit offers come in as included, with a warning.
    expect(await find(s.name("Beach"))).toMatchObject({ offerModel: "included", nextAction: "Call the GM" });
    expect(report.warnings.map((w) => w.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("uses credits, which intu doesn't offer; imported as included in the pass"),
        expect.stringContaining('"Space › Moon Walks" isn\'t in the catalogue'),
        expect.stringContaining('Priority "P9"'),
      ]),
    );
  });

  it("updates on a second run instead of duplicating, and skips rows that haven't changed", async () => {
    const s = sheet();
    await importPartnerPipeline(db, { csv: s.csv, dryRun: false, actor });
    const changed = s.csv.replace("Private screening,P2,To verify", "Private screening,P1,Negotiating");
    const report = await importPartnerPipeline(db, { csv: changed, dryRun: false, actor });
    expect(report.counts).toEqual({ created: 0, updated: 1, unchanged: 4 });
    expect(await find(s.name("Cinema"))).toMatchObject({ status: "negotiating", priority: "P1" });
    expect(await db.select().from(schema.partners).where(ilike(schema.partners.tradingName, s.name("Cinema")))).toHaveLength(1);
  });

  it("writes nothing on a dry run or when any row is wrong", async () => {
    const s = sheet();
    expect((await importPartnerPipeline(db, { csv: s.csv, dryRun: true, actor })).committed).toBe(false);
    expect(await find(s.name("Cinema"))).toBeUndefined();
    const bad = `${s.csv}\nTEST Broken,Food & Drink,Fine Dining,Set menu,P1,Maybe,Included,,,0,,,`;
    const report = await importPartnerPipeline(db, { csv: bad, dryRun: false, actor });
    expect(report.errors).toEqual([{ line: 7, message: expect.stringContaining('Status "Maybe"') }]);
    expect(await find(s.name("Cinema"))).toBeUndefined();
  });

  it("is available to partnerships through the API, recording who imported", async () => {
    const { as } = testApi(db);
    const me = await createStaff(db, "partnerships");
    const s = sheet();
    expect((await as(await createStaff(db, "concierge")).post("/admin/import/partners", { csv: s.csv, dryRun: false })).status).toBe(403);
    const res = await as(me).post("/admin/import/partners", { csv: s.csv, dryRun: false });
    expect(res.json.report.committed).toBe(true);
    const partner = await find(s.name("Cinema"));
    const [audit] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, partner?.id ?? ""));
    expect(audit).toMatchObject({ action: "partner.imported", actorId: me.id });
  });
});
