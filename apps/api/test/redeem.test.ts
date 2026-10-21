import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@intu/db";
import { NotFoundError, redeem } from "../src/ledger/redeem.ts";
import { createWorld } from "./support/fixtures.ts";

const url = process.env.DATABASE_URL;
// Saturday 12 December 2026, 14:00 Lagos.
const now = new Date("2026-12-12T13:00:00Z");

describe.runIf(url)("redeem()", () => {
  const { db, sql } = createDb(url ?? "", { max: 20 });
  afterAll(() => sql.end());

  const allowanceOf = async (membershipId: string) => {
    const rows = await db.select().from(schema.allowances).where(eq(schema.allowances.membershipId, membershipId));
    return rows[0]!;
  };
  const auditFor = (entityId: string) => db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, entityId));

  it("approves, draws down the allowance and audits both writes", async () => {
    const w = await createWorld(db);
    const { redemptionId, decision } = await redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now });

    expect(decision).toEqual({ result: "approved", serviceDate: "2026-12-12", units: 1, remaining: 3 });
    const allowance = await allowanceOf(w.first.membership.id);
    expect(allowance.used).toBe(1);

    const [row] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, redemptionId));
    expect(row).toMatchObject({ result: "approved", reason: null, allowanceId: allowance.id, serviceDate: "2026-12-12", method: "online" });
    expect((await auditFor(redemptionId)).map((a) => a.action)).toEqual(["redemption.approved"]);
    expect((await auditFor(allowance.id)).map((a) => a.action)).toEqual(["allowance.granted", "allowance.drawn_down"]);
  });

  it("logs a decline without touching the allowance", async () => {
    const w = await createWorld(db, { quantity: 1 });
    await redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now });
    const second = await redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now: new Date(now.getTime() + 3_600_000) });

    expect(second.decision).toMatchObject({ result: "declined", reason: "ALLOWANCE_USED_UP" });
    expect((await allowanceOf(w.first.membership.id)).used).toBe(1);
    const [row] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, second.redemptionId));
    expect(row).toMatchObject({ result: "declined", reason: "ALLOWANCE_USED_UP", allowanceId: null });
    expect((await auditFor(second.redemptionId)).map((a) => a.action)).toEqual(["redemption.declined"]);
  });

  it("produces exactly one approval when the same code is scanned twice at once", async () => {
    const w = await createWorld(db);
    const scan = () => redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", scanCode: `TEST-${w.first.membership.id}`, now });
    const results = await Promise.all([scan(), scan()]);

    expect(results.filter((r) => r.decision.result === "approved")).toHaveLength(1);
    // The second scan is told the visit was already claimed, and when.
    expect(results.find((r) => r.decision.result === "declined")?.decision).toEqual({
      result: "declined",
      serviceDate: "2026-12-12",
      reason: "DUPLICATE_SCAN",
      claimedAt: now,
    });
    expect((await allowanceOf(w.first.membership.id)).used).toBe(1);
  });

  it("holds under a burst of ten simultaneous scans", async () => {
    const w = await createWorld(db);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now })),
    );
    expect(results.filter((r) => r.decision.result === "approved")).toHaveLength(1);
    const approvedRows = await db
      .select()
      .from(schema.redemptions)
      .where(and(eq(schema.redemptions.membershipId, w.first.membership.id), eq(schema.redemptions.result, "approved")));
    expect(approvedRows).toHaveLength(1);
    expect((await allowanceOf(w.first.membership.id)).used).toBe(1);
  });

  it("never lets an offer's daily cap be exceeded by concurrent members", async () => {
    const w = await createWorld(db, { members: 4, dailyCap: 2 });
    const results = await Promise.all(
      w.people.map((p) => redeem(db, { membershipId: p.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now })),
    );
    expect(results.filter((r) => r.decision.result === "approved")).toHaveLength(2);
    expect(results.filter((r) => r.decision.result === "declined").map((r) => r.decision)).toEqual([
      expect.objectContaining({ reason: "OFFER_DAILY_CAP" }),
      expect.objectContaining({ reason: "OFFER_DAILY_CAP" }),
    ]);
  });

  it("shares a Crew allowance across the group", async () => {
    const w = await createWorld(db, { benefitType: "hosted_night", quantity: 1, sharedByGroup: true, members: 4 });
    const [a, b] = w.people;
    const first = await redeem(db, { membershipId: a!.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", partySize: 4, now });
    const second = await redeem(db, { membershipId: b!.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now: new Date(now.getTime() + 86_400_000) });

    expect(first.decision).toMatchObject({ result: "approved", remaining: 0 });
    expect(second.decision).toMatchObject({ result: "declined", reason: "ALLOWANCE_USED_UP" });
    const group = await db.select().from(schema.allowances).where(eq(schema.allowances.groupId, a!.membership.groupId!));
    expect(group).toHaveLength(1);
    expect(group[0]!.used).toBe(1);
  });

  it("draws one unit per person for a per-person benefit", async () => {
    const w = await createWorld(db, { quantity: 4, drawPerPerson: true });
    const r = await redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", partySize: 3, now });
    expect(r.decision).toMatchObject({ result: "approved", units: 3, remaining: 1 });
    expect((await allowanceOf(w.first.membership.id)).used).toBe(3);
    const [row] = await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, r.redemptionId));
    expect(row?.partySize).toBe(3);
  });

  it("rejects a party size below one", async () => {
    const w = await createWorld(db);
    await expect(redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", partySize: 0, now })).rejects.toBeInstanceOf(RangeError);
  });

  it("counts uses of an unlimited benefit without ever running out", async () => {
    const w = await createWorld(db, { benefitType: "guest_list", quantity: null });
    for (let day = 0; day < 3; day++) {
      const r = await redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now: new Date(now.getTime() + day * 86_400_000) });
      expect(r.decision).toMatchObject({ result: "approved", remaining: null });
    }
    const allowance = await allowanceOf(w.first.membership.id);
    expect(allowance).toMatchObject({ granted: null, used: 3 });
  });

  it("rolls back the redemption if the allowance write fails", async () => {
    const w = await createWorld(db);
    const allowance = await allowanceOf(w.first.membership.id);
    // Make the draw-down fail for this one allowance; the redemption written before it must not survive.
    const trigger = `test_fail_drawdown_${allowance.id.replaceAll("-", "")}`;
    await sql`create or replace function test_fail_drawdown() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$`;
    await sql.unsafe(`create trigger ${trigger} before update on allowances for each row when (old.id = '${allowance.id}') execute function test_fail_drawdown()`);
    try {
      await expect(redeem(db, { membershipId: w.first.membership.id, venueId: w.venue.id, offerId: w.offer.id, method: "online", now })).rejects.toThrow();
    } finally {
      await sql.unsafe(`drop trigger ${trigger} on allowances`);
    }
    const rows = await db.select().from(schema.redemptions).where(eq(schema.redemptions.membershipId, w.first.membership.id));
    expect(rows).toHaveLength(0);
    expect((await allowanceOf(w.first.membership.id)).used).toBe(0);
  });

  it("throws NotFoundError for an offer at a different venue", async () => {
    const a = await createWorld(db);
    const b = await createWorld(db);
    await expect(redeem(db, { membershipId: a.first.membership.id, venueId: a.venue.id, offerId: b.offer.id, method: "online", now })).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe.runIf(url)("audit log", () => {
  const { sql } = createDb(url ?? "", { max: 1 });
  afterAll(() => sql.end());

  it("rejects updates and deletes", async () => {
    await expect(sql`update audit_log set action = 'tampered'`).rejects.toThrow(/append-only/);
    await expect(sql`delete from audit_log`).rejects.toThrow(/append-only/);
  });
});
