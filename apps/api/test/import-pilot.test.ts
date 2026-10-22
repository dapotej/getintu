// A small pilot sheet in the shape the POC spec describes, imported end to end.
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq, inArray, like } from "drizzle-orm";
import { createDb, schema } from "@intu/db";
import { importPilot } from "../src/import/pilot.ts";
import { redeem } from "../src/ledger/redeem.ts";
import { createStaff, testApi } from "./support/auth.ts";
import { categoryIdOf } from "./support/fixtures.ts";

const url = process.env.DATABASE_URL;

/** A fresh sheet per test: unique pass numbers, venue IDs and phones so runs don't collide. */
function sheet() {
  const run = randomUUID().slice(0, 4).toUpperCase();
  const pass = (n: number) => `INTU-${run}${n}`;
  const venue = (n: number) => `V${run}${n}`;
  const phone = () => `+999 ${randomInt(10 ** 8, 10 ** 9)}`;
  return {
    pass,
    venue,
    files: {
      partners: [
        "Venue ID,Name,Area,Benefit(s) offered,Rate per visit (₦),Contact,Bank details reference,Active",
        `${venue(1)},TEST Pilot Beach ${run},Oniru,Beach,"₦18,000",TEST Manager,REF-1,TRUE`,
        `${venue(2)},TEST Pilot Hotel ${run},Victoria Island,Pool and gym; Spa,"25,000",,,TRUE`,
        `${venue(3)},TEST Pilot Club ${run},Ikoyi,Hosted night,25000,,,TRUE`,
      ].join("\n"),
      members: [
        "Pass number,Token,Tier,Name,Email,WhatsApp,Photo link,Arrival,Departure,Status,Crew group ID",
        `${pass(1)},tok1,Plus,TEST Pilot One,one@example.com,${phone()},https://drive.example.com/1,14/12/2026,02/01/2027,Active,`,
        `${pass(2)},tok2,Essential,TEST Pilot Two,,${phone()},,20/12/2026,,Suspended,`,
        `${pass(3)},tok3,Crew,TEST Pilot Crew A,,${phone()},,18/12/2026,03/01/2027,Active,CREW-${run}`,
        `${pass(4)},tok4,Crew,TEST Pilot Crew B,,${phone()},,18/12/2026,03/01/2027,Active,CREW-${run}`,
      ].join("\n"),
      allowances: [
        "Pass number,Benefit,Total,Used,Remaining",
        `${pass(1)},Beach,4,2,2`,
        `${pass(1)},Pool and gym,4,1,3`,
        `${pass(1)},Spa,1,1,0`,
        `${pass(2)},Beach,2,0,2`,
        `${pass(3)},Hosted night,1,1,0`,
        `${pass(4)},Hosted night,1,0,1`,
      ].join("\n"),
      visits: [
        "Timestamp,Pass number,Venue ID,Benefit,Result,Method,Staff note",
        `15/12/2026 13:05:00,${pass(1)},${venue(1)},Beach,Approved,Scan,`,
        `22/12/2026 12:00:00,${pass(1)},${venue(1)},Beach,Approved,Manual,no signal`,
        `22/12/2026 16:30:00,${pass(1)},${venue(2)},Spa,Approved,Scan,`,
        `23/12/2026 11:00:00,${pass(2)},${venue(1)},Beach,Declined - pass not active,Scan,`,
        `26/12/2026 23:40:00,${pass(3)},${venue(3)},Hosted night,Approved,Scan,party of 4`,
        `27/12/2026 10:00:00,${pass(1)},${venue(2)},Pool and gym,Declined (wrong venue),Scan,`,
      ].join("\n"),
      bookings: [
        "Pass number,Venue or event,Date,Benefit used,Status",
        `${pass(3)},${venue(3)},26/12/2026,Hosted night,Completed`,
        `${pass(1)},TEST Boxing Day Rooftop Party,26/12/2026,,Confirmed`,
      ].join("\n"),
    },
  };
}

const tierPlans = { Essential: "00000000-0000-4000-8000-000000000401", Plus: "00000000-0000-4000-8000-000000000402", Crew: "00000000-0000-4000-8000-000000000403" };

describe.runIf(url)("pilot import", () => {
  const { db, sql } = createDb(url ?? "", { max: 10 });
  afterAll(() => sql.end());
  const actor = { type: "system" as const };
  const membershipsFor = async (passes: string[]) => db.select().from(schema.memberships).where(inArray(schema.memberships.passNumber, passes));

  it("a dry run reports everything and writes nothing", async () => {
    const s = sheet();
    const report = await importPilot(db, { files: s.files, tierPlans, dateOrder: "DMY", dryRun: true, actor });
    expect(report.errors).toEqual([]);
    expect(report.committed).toBe(false);
    expect(report.counts).toMatchObject({ venues: { created: 3 }, offers: { created: 4 }, members: { created: 4 }, memberships: { created: 4 }, allowances: { updated: 4 }, visits: { created: 6 }, bookings: { created: 2 } });
    expect(await membershipsFor([s.pass(1)])).toEqual([]);
  });

  it("imports members, Crew groups, allowance counts, visit history and bookings", async () => {
    const s = sheet();
    const report = await importPilot(db, { files: s.files, tierPlans, dateOrder: "DMY", dryRun: false, actor });
    expect(report.errors).toEqual([]);
    expect(report.committed).toBe(true);
    expect(report.notImported).toEqual([expect.stringContaining("1 member photo"), expect.stringContaining("4 pilot QR tokens")]);
    expect(report.warnings.map((w) => w.message)).toEqual(
      expect.arrayContaining([expect.stringContaining("opening hours"), expect.stringContaining('"wrong venue" has no platform equivalent')]),
    );

    const ms = await membershipsFor([s.pass(1), s.pass(2), s.pass(3), s.pass(4)]);
    const byPass = Object.fromEntries(ms.map((m) => [m.passNumber, m]));
    expect(byPass[s.pass(1)]).toMatchObject({ status: "active", arrivesOn: "2026-12-14", departsOn: "2027-01-02", startsOn: "2026-12-01", endsOn: "2027-01-10" });
    expect(byPass[s.pass(2)]?.status).toBe("suspended");
    expect(byPass[s.pass(3)]?.groupId).toBe(byPass[s.pass(4)]?.groupId);
    expect(byPass[s.pass(3)]?.groupId).not.toBeNull();

    // Allowances follow the sheet; the Crew's shared hosted night combines both members' rows.
    const allowances = await db
      .select({ type: schema.categories.code, granted: schema.allowances.granted, used: schema.allowances.used, groupId: schema.allowances.groupId, membershipId: schema.allowances.membershipId })
      .from(schema.allowances)
      .innerJoin(schema.benefits, eq(schema.benefits.id, schema.allowances.benefitId))
      .innerJoin(schema.categories, eq(schema.categories.id, schema.benefits.categoryId));
    const one = allowances.filter((a) => a.membershipId === byPass[s.pass(1)]?.id);
    expect(Object.fromEntries(one.map((a) => [a.type, a.used]))).toMatchObject({ "C03-S01": 2, "C04-S01-T02": 1, "C04-S05": 1, "C04-S08": 0 });
    expect(allowances.filter((a) => a.groupId === byPass[s.pass(3)]?.groupId && a.type === "C06-S04-T01")).toEqual([
      expect.objectContaining({ granted: 1, used: 1 }),
    ]);

    // Visits keep their Lagos times, results and methods.
    const visits = await db.select().from(schema.redemptions).where(eq(schema.redemptions.membershipId, byPass[s.pass(1)]?.id ?? ""));
    expect(visits).toHaveLength(4);
    expect(visits.find((v) => v.method === "manual")).toMatchObject({ result: "approved", occurredAt: new Date("2026-12-22T11:00:00Z"), serviceDate: "2026-12-22" });
    const declined = await db.select().from(schema.redemptions).where(eq(schema.redemptions.membershipId, byPass[s.pass(2)]?.id ?? ""));
    expect(declined[0]).toMatchObject({ result: "declined", reason: "MEMBERSHIP_NOT_ACTIVE" });

    const bookings = await db.select().from(schema.bookings).where(inArray(schema.bookings.membershipId, ms.map((m) => m.id)));
    expect(bookings.map((b) => [b.status, b.eventName !== null])).toEqual(expect.arrayContaining([["completed", false], ["confirmed", true]]));

    // Imported members carry on in the platform: the pilot's history counts against the rules.
    const venue = (await db.select().from(schema.venues).where(eq(schema.venues.externalRef, s.venue(1))))[0];
    const offer = (await db.select().from(schema.offers).where(and(eq(schema.offers.venueId, venue?.id ?? ""), eq(schema.offers.categoryId, await categoryIdOf(db, "C03-S01-T01")))))[0];
    const again = await redeem(db, { membershipId: byPass[s.pass(1)]?.id ?? "", venueId: venue?.id ?? "", offerId: offer?.id ?? "", method: "online", now: new Date("2026-12-28T12:00:00Z") });
    expect(again.decision).toMatchObject({ result: "approved", remaining: 1 });
  });

  it("is safe to run twice: the second run only finds existing rows", async () => {
    const s = sheet();
    await importPilot(db, { files: s.files, tierPlans, dateOrder: "DMY", dryRun: false, actor });
    const second = await importPilot(db, { files: s.files, tierPlans, dateOrder: "DMY", dryRun: false, actor });
    expect(second.errors).toEqual([]);
    for (const [name, c] of Object.entries(second.counts)) {
      expect({ name, created: c.created, updated: c.updated ?? 0 }).toEqual({ name, created: 0, updated: 0 });
    }
    expect(second.counts.visits?.existing).toBe(6);
  });

  it("refuses to commit anything if any row has an error, and says which line", async () => {
    const s = sheet();
    const files = {
      ...s.files,
      members: `${s.files.members}\nINTU-BAD1,tok,Plus,TEST No Code,,07700900999,,,,Active,\nINTU-BAD2,tok,Platinum,TEST Unknown Tier,,+999123456789,,,,Active,`,
      allowances: `${s.files.allowances}\n${s.pass(2)},Beach,2,3,-1`,
    };
    const report = await importPilot(db, { files, tierPlans, dateOrder: "DMY", dryRun: false, actor });
    expect(report.committed).toBe(false);
    expect(report.errors).toEqual(
      expect.arrayContaining([
        { file: "members", line: 6, message: expect.stringContaining("needs a country code") },
        { file: "members", line: 7, message: expect.stringContaining('No plan chosen for tier "Platinum"') },
        { file: "allowances", line: 8, message: expect.stringContaining("more than one Beach row") },
      ]),
    );
    expect(await membershipsFor([s.pass(1)])).toEqual([]);
    expect(await db.select().from(schema.venues).where(like(schema.venues.externalRef, `${s.venue(1)}%`))).toEqual([]);
  });

  it("reports missing columns instead of guessing", async () => {
    const report = await importPilot(db, { files: { members: "Pass number,Name\nINTU-1,TEST\n" }, tierPlans, dateOrder: "DMY", dryRun: true, actor });
    expect(report.errors).toEqual([{ file: "members", line: 1, message: "Missing columns: tier, phone, status" }]);
  });

  it("is available to ops leads through the API, and records who imported", async () => {
    const { as } = testApi(db);
    const lead = await createStaff(db, "ops_lead");
    const ops = await createStaff(db, "ops");
    const s = sheet();
    const body = { files: { partners: s.files.partners }, tierPlans, dateOrder: "DMY", dryRun: false };
    expect((await as(ops).post("/admin/import/pilot", body)).status).toBe(403);
    const res = await as(lead).post("/admin/import/pilot", body);
    expect(res.status).toBe(200);
    expect(res.json.report.committed).toBe(true);
    const [venue] = await db.select().from(schema.venues).where(eq(schema.venues.externalRef, s.venue(1)));
    const [audit] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, venue?.id ?? ""));
    expect(audit).toMatchObject({ action: "venue.imported", actorType: "staff", actorId: lead.id });
  });
});
