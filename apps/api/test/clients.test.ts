// Client accounts in the console: seats on a plan, people added one at a time, from a list or as
// passes given a name later, removing someone, invoices recorded by hand, and usage as totals.
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@intu/db";
import { redeem } from "../src/ledger/redeem.ts";
import { createStaff, testApi } from "./support/auth.ts";
import { createWorld } from "./support/fixtures.ts";

const url = process.env.DATABASE_URL;
const phone = () => `+999${randomInt(10 ** 9, 10 ** 10)}`;

describe.runIf(url)("clients", () => {
  const { db, sql } = createDb(url ?? "", { max: 10 });
  afterAll(() => sql.end());
  // Saturday 12 December 2026 in Lagos, inside the TEST plan's season.
  const now = new Date("2026-12-12T13:00:00Z");
  const { as } = testApi(db, { clock: () => now });

  async function bank(seats: number | null = 5) {
    const world = await createWorld(db);
    const ops = as(await createStaff(db, "ops"));
    const res = await ops.post("/admin/clients", { name: `TEST Bank ${randomUUID().slice(0, 4)}`, kind: "bank", seats, contractStartsOn: "2026-12-01", contractEndsOn: "2027-01-10", isTest: true });
    expect(res.status).toBe(201);
    return { world, ops, client: res.json.client, plan: world.plan };
  }

  it("adds a client's people one at a time, each with a pass the client pays for", async () => {
    const { ops, client, plan } = await bank();
    const person = { fullName: "TEST Ngozi Bank", phone: phone(), email: "ngozi@example.com", customerRef: "CUST-001", planId: plan.id };
    const res = await ops.post(`/admin/clients/${client.id}/people`, person);
    expect(res.status).toBe(201);
    const [seat] = res.json.seats;
    // Starts today, not on the contract's first day, and runs to the contract's end.
    expect(seat).toMatchObject({ customerRef: "CUST-001", member: { fullName: "TEST Ngozi Bank" }, membership: { status: "active", startsOn: "2026-12-12", endsOn: "2027-01-10" }, plan: { id: plan.id } });
    const [membership] = await db.select().from(schema.memberships).where(eq(schema.memberships.id, seat.membership.id));
    expect(membership).toMatchObject({ paymentSource: "client", clientAccountId: client.id });
    expect((await db.select().from(schema.allowances).where(eq(schema.allowances.membershipId, membership!.id))).length).toBe(1);
    const page = (await ops.get(`/admin/members/${seat.member.id}`)).json;
    expect(page.memberships[0].client).toEqual({ id: client.id, name: client.name });
    // The same person can't hold two of this client's passes.
    expect((await ops.post(`/admin/clients/${client.id}/people`, person)).json.error.code).toBe("already_has_pass");
    expect((await ops.get("/admin/clients")).json.clients.find((c: { id: string }) => c.id === client.id)).toMatchObject({ seatsSetUp: 1, seatsAssigned: 1 });
  });

  it("sets up passes waiting for a name, keeps to the contract's seats, and gives them out later", async () => {
    const { world, ops, client, plan } = await bank(3);
    expect((await ops.post(`/admin/clients/${client.id}/seats`, { planId: plan.id, count: 2 })).json.usage.seats).toEqual({ total: 2, assigned: 0, open: 2, limit: 3 });
    expect((await ops.post(`/admin/clients/${client.id}/seats`, { planId: plan.id, count: 2 })).json.error.code).toBe("seat_limit");
    const open = (await ops.get(`/admin/clients/${client.id}`)).json.seats;
    // An existing member gets the pass: found by phone, not added twice.
    const res = await ops.post(`/admin/client-seats/${open[0].id}/assign`, { fullName: "Ignored", phone: world.first.member.phone, customerRef: "CUST-9" });
    expect(res.status).toBe(200);
    expect(res.json.seats[0]).toMatchObject({ member: { id: world.first.member.id }, customerRef: "CUST-9" });
    expect((await ops.post(`/admin/client-seats/${open[0].id}/assign`, { fullName: "TEST Other", phone: phone() })).json.error.code).toBe("seat_taken");
    // An unneeded open pass can go; a held one can't.
    expect((await ops.post(`/admin/client-seats/${open[0].id}/remove`)).json.error.code).toBe("seat_taken");
    expect((await ops.post(`/admin/client-seats/${open[1].id}/remove`)).json.usage.seats).toMatchObject({ total: 1, open: 0 });
    const [audit] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, open[1].id), eq(schema.auditLog.action, "client_seat.removed")));
    expect(audit).toBeTruthy();
  });

  it("ends a pass that day when someone leaves, and frees the seat for someone else", async () => {
    const { world, ops, client, plan } = await bank();
    const seat = (await ops.post(`/admin/clients/${client.id}/people`, { fullName: "TEST Leaver", phone: phone(), planId: plan.id })).json.seats[0];
    expect((await ops.post(`/admin/client-seats/${seat.id}/release`, {})).status).toBe(400);
    const res = await ops.post(`/admin/client-seats/${seat.id}/release`, { reason: "TEST left the bank" });
    expect(res.json.seats[0]).toMatchObject({ id: seat.id, member: null, membership: null, customerRef: null });
    const [ended] = await db.select().from(schema.memberships).where(eq(schema.memberships.id, seat.membership.id));
    expect(ended).toMatchObject({ status: "ended", endsOn: "2026-12-12" });
    // The scanner says no from now on.
    const visit = await redeem(db, { membershipId: ended!.id, venueId: world.venue.id, offerId: world.offer.id, method: "online", now });
    expect(visit.decision.result).toBe("declined");
    const [audit] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, seat.id), eq(schema.auditLog.action, "client_seat.released")));
    expect(audit?.after).toMatchObject({ reason: "TEST left the bank" });
    // The freed seat goes to someone new.
    expect((await ops.post(`/admin/client-seats/${seat.id}/assign`, { fullName: "TEST Joiner", phone: phone() })).json.seats[0].member.fullName).toBe("TEST Joiner");
  });

  it("checks an uploaded list first, then adds everyone on it together", async () => {
    const { world, ops, client, plan } = await bank(10);
    const [a, b] = [phone(), phone()];
    const bad = `Full name,Mobile,Email,Customer ID\nTEST Ada List,${a},ada@example.com,C1\nTEST Bayo List,${world.first.member.phone},,C2\nTEST No Phone,0803 123,,C3\nTEST Twice,${a},,C4\n`;
    const dry = (await ops.post(`/admin/clients/${client.id}/people/upload`, { csv: bad, planId: plan.id, commit: false })).json;
    expect(dry.counts).toEqual({ new: 1, existing: 1, errors: 2 });
    expect(dry.rows.filter((r: { status: string }) => r.status === "error").map((r: { line: number; message: string }) => [r.line, r.message])).toEqual([
      [4, "Phone isn't in international format, e.g. +2348012345678"],
      [5, "This phone is in the list twice"],
    ]);
    expect((await ops.post(`/admin/clients/${client.id}/people/upload`, { csv: bad, planId: plan.id, commit: true })).json.error.code).toBe("list_has_errors");
    expect((await ops.get(`/admin/clients/${client.id}`)).json.seats).toHaveLength(0);
    expect((await ops.post(`/admin/clients/${client.id}/people/upload`, { csv: "Who,When\nx,y\n", planId: plan.id, commit: false })).json.error.code).toBe("missing_columns");

    const good = `Name,Phone\nTEST Ada List,${a}\nTEST Chi List,${b}\n`;
    const done = (await ops.post(`/admin/clients/${client.id}/people/upload`, { csv: good, planId: plan.id, commit: true })).json;
    expect(done).toMatchObject({ committed: true, counts: { new: 2, existing: 0, errors: 0 } });
    const seats = (await ops.get(`/admin/clients/${client.id}`)).json.seats;
    expect(seats.map((s: { member: { fullName: string } }) => s.member.fullName).sort()).toEqual(["TEST Ada List", "TEST Chi List"]);
    // Uploading again finds them already holding passes.
    expect((await ops.post(`/admin/clients/${client.id}/people/upload`, { csv: good, planId: plan.id, commit: false })).json.counts.errors).toBe(2);
  });

  it("shows usage as totals only, and records invoices for finance", async () => {
    const { world, ops, client, plan } = await bank();
    const seat = (await ops.post(`/admin/clients/${client.id}/people`, { fullName: "TEST Visitor", phone: phone(), planId: plan.id })).json.seats[0];
    await redeem(db, { membershipId: seat.membership.id, venueId: world.venue.id, offerId: world.offer.id, method: "online", now });
    const { usage } = (await ops.get(`/admin/clients/${client.id}`)).json;
    expect(usage).toMatchObject({ visits: 1, visitsThisMonth: 1, peopleThisMonth: 1, byService: [{ name: "Entry only", visits: 1, thisMonth: 1 }] });
    expect(usage).not.toHaveProperty("rows");

    // Finance keeps invoices; ops can't.
    const finance = as(await createStaff(db, "finance"));
    const number = `TEST-INV-${randomUUID().slice(0, 6)}`;
    const invoice = { number, issuedOn: "2026-12-01", dueOn: "2026-12-31", amountMinor: 250_000_000, currency: "NGN", note: null };
    expect((await ops.post(`/admin/clients/${client.id}/invoices`, invoice)).status).toBe(403);
    const created = (await finance.post(`/admin/clients/${client.id}/invoices`, invoice)).json.invoices[0];
    expect(created).toMatchObject({ number, amountMinor: 250_000_000, currency: "NGN", status: "issued", paidOn: null });
    expect((await finance.post(`/admin/clients/${client.id}/invoices`, invoice)).json.error.code).toBe("duplicate_number");
    expect((await finance.post(`/admin/clients/${client.id}/invoices`, { ...invoice, number: `${number}-X`, amountMinor: 1.5 })).status).toBe(400);
    expect((await finance.patch(`/admin/client-invoices/${created.id}`, { status: "paid" })).json.invoices[0]).toMatchObject({ status: "paid", paidOn: "2026-12-12" });
    expect((await finance.post(`/admin/clients/${client.id}/people`, { fullName: "TEST X", phone: phone(), planId: plan.id })).status).toBe(403);
    // The concierge doesn't see clients at all.
    expect((await as(await createStaff(db, "concierge")).get("/admin/clients")).status).toBe(403);
  });
});
