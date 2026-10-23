// Milestone 7: monthly partner statements from visits, second-person approval, Paystack transfers
// (faked at the network) with their webhooks, and statements in the partner portal.
import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@intu/db";
import { paystackSignature } from "../src/payments/providers.ts";
import { createPayments } from "../src/payments/setup.ts";
import { sealerFrom } from "../src/settlements/sealed.ts";
import { createStaff, testApi } from "./support/auth.ts";
import { createWorld } from "./support/fixtures.ts";

const url = process.env.DATABASE_URL;
const PAYSTACK_KEY = "sk_test_paystack_payouts";
const JOBS_SECRET = "test-jobs-secret-0123456789abcdefghij";

/** Paystack's transfer endpoints, answering from what each test sets. */
function fakePaystack() {
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  const state = { transferStatus: "pending", verify: new Map<string, string>(), refuse: null as string | null };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200 ? { status: true, message: "ok", data } : { status: false, message: data }), { status, headers: { "content-type": "application/json" } });
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    calls.push({ path: u.pathname, body });
    if (u.pathname === "/bank") return reply([{ name: "TEST Access Bank", code: "044", active: true }, { name: "TEST GTBank", code: "058", active: true }]);
    if (u.pathname === "/bank/resolve") return u.searchParams.get("account_number") === "0000000000" ? reply("Could not resolve account name", 422) : reply({ account_name: "TEST BEACH CLUB LTD", account_number: u.searchParams.get("account_number") });
    if (u.pathname === "/transferrecipient") return reply({ recipient_code: `RCP_${randomUUID().slice(0, 8)}` });
    if (u.pathname === "/transfer") {
      if (state.refuse) return reply(state.refuse, 400);
      return reply({ reference: body?.["reference"], transfer_code: `TRF_${randomUUID().slice(0, 8)}`, status: state.transferStatus });
    }
    if (u.pathname.startsWith("/transfer/verify/")) {
      const ref = decodeURIComponent(u.pathname.split("/").pop() ?? "");
      const status = state.verify.get(ref);
      return status ? reply({ reference: ref, transfer_code: `TRF_v_${ref.slice(-6)}`, status }) : reply("Transfer not found", 404);
    }
    return reply("unexpected", 404);
  }) as typeof fetch;
  return { f, calls, state };
}

describe.runIf(url)("settlements and payouts", () => {
  const { db, sql } = createDb(url ?? "", { max: 10 });
  afterAll(() => sql.end());
  // Monday 2 November 2026 in Lagos: October is last month.
  let now = new Date("2026-11-02T09:00:00Z");
  const fake = fakePaystack();
  const sealer = sealerFrom(randomBytes(32).toString("base64"));
  const payments = createPayments({ paystack: { secretKey: PAYSTACK_KEY }, fetch: fake.f, allowTest: false });
  const { app, as } = testApi(db, { clock: () => now, payments, bankDetails: sealer, jobsSecret: JOBS_SECRET });
  const request = async (method: string, path: string, opts: { token?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const res = await app.request(path, {
      method,
      headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.body === undefined ? {} : { "content-type": "application/json" }), ...opts.headers },
      ...(opts.body === undefined ? {} : { body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body) }),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, json: (await res.json()) as any };
  };

  let founder: Awaited<ReturnType<typeof createStaff>>;
  let finance: Awaited<ReturnType<typeof createStaff>>;
  let approver: Awaited<ReturnType<typeof createStaff>>;
  beforeAll(async () => {
    founder = await createStaff(db, "founder", { canApprovePayouts: true });
    finance = await createStaff(db, "finance");
    approver = await createStaff(db, "finance", { canApprovePayouts: true });
  });

  /** A partner with approved (and other) visits in October, as the scanner would have recorded them. */
  async function october(opts: { drawPerPerson?: boolean } = {}) {
    const world = await createWorld(db, { drawPerPerson: opts.drawPerPerson ?? false });
    const [benefit] = await db.select().from(schema.benefits).where(eq(schema.benefits.planId, world.plan.id));
    const visit = async (v: Partial<typeof schema.redemptions.$inferInsert> = {}) => {
      const [row] = await db
        .insert(schema.redemptions)
        .values({
          occurredAt: new Date(`${v.serviceDate ?? "2026-10-10"}T20:00:00Z`),
          serviceDate: "2026-10-10",
          memberId: world.first.member.id,
          membershipId: world.first.membership.id,
          venueId: world.venue.id,
          offerId: world.offer.id,
          categoryId: world.offer.categoryId,
          benefitId: benefit?.id ?? null,
          result: "approved",
          method: "online",
          ...v,
        })
        .returning();
      return row!;
    };
    return { ...world, visit };
  }

  const run = (who = finance, month?: string) => as(who).post("/admin/settlements/run", month ? { month } : {});
  const statementFor = async (partnerId: string, month = "2026-10") => {
    const list = (await as(finance).get(`/admin/settlements?month=${month}`)).json.settlements as { id: string; status: string; partner: { id: string } }[];
    const s = list.find((x) => x.partner.id === partnerId && x.status !== "void");
    return s ? (await as(finance).get(`/admin/settlements/${s.id}`)).json : null;
  };

  it("builds last month's statement from approved visits, at the offer's rate, per person when the benefit counts per person", async () => {
    const w = await october({ drawPerPerson: true });
    const party = await w.visit({ partySize: 3 });
    const single = await w.visit({ serviceDate: "2026-10-20" });
    const lateFromSeptember = await w.visit({ serviceDate: "2026-09-28" });
    const declined = await w.visit({ result: "declined", reason: "ALLOWANCE_USED_UP" });
    const flagged = await w.visit({ flagged: true, flagReason: "TEST: over the daily cap" });
    const november = await w.visit({ serviceDate: "2026-11-01" });

    expect((await run()).status).toBe(200);
    const s = await statementFor(w.partner.id);
    expect(s.settlement).toMatchObject({ status: "draft", periodStart: "2026-10-01", periodEnd: "2026-10-31", currency: "NGN", lineCount: 3, totalMinor: 1_800_000 * 5, changedById: finance.id });
    expect(s.lines.map((l: { id: string }) => l.id).sort()).toEqual([party.id, single.id, lateFromSeptember.id].sort());
    expect(s.lines.find((l: { id: string }) => l.id === party.id).amountMinor).toBe(5_400_000);
    for (const left of [declined, flagged, november]) expect((await db.select().from(schema.redemptions).where(eq(schema.redemptions.id, left.id)))[0]?.settlementId).toBeNull();

    // Once ops closes the flag, a second run adds just that visit to the same draft.
    await db.update(schema.redemptions).set({ flagReviewedAt: now }).where(eq(schema.redemptions.id, flagged.id));
    await run();
    const again = await statementFor(w.partner.id);
    expect(again.settlement.id).toBe(s.settlement.id);
    expect(again.settlement).toMatchObject({ lineCount: 4, totalMinor: 1_800_000 * 6 });
    const audits = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entity, "settlement"), eq(schema.auditLog.entityId, s.settlement.id)));
    expect(audits.map((a) => a.action).sort()).toEqual(["settlement.created", "settlement.lines_added"]);
  });

  it("pays one rate per visit when the benefit counts the visit once", async () => {
    const w = await october();
    await w.visit({ partySize: 4 });
    await run();
    expect((await statementFor(w.partner.id)).settlement.totalMinor).toBe(1_800_000);
  });

  it("needs a payout approver who didn't make or change the statement", async () => {
    const w = await october();
    await w.visit();
    await run();
    const { settlement } = await statementFor(w.partner.id);
    const notApprover = await as(finance).post(`/admin/settlements/${settlement.id}/approve`);
    expect(notApprover.status).toBe(403);
    expect(notApprover.json.error.code).toBe("not_an_approver");
    // The approver who added an adjustment changed it, so someone else approves.
    await as(approver).post(`/admin/settlements/${settlement.id}/adjustments`, { amountMinor: 50_000_00, reason: "TEST: October flat fee" });
    expect((await as(approver).post(`/admin/settlements/${settlement.id}/approve`)).json.error.code).toBe("changed_it_yourself");
    const view = (await as(approver).get(`/admin/settlements/${settlement.id}`)).json;
    expect(view.canApprove).toMatchObject({ ok: false, reason: "changed_it_yourself" });
    const ok = await as(founder).post(`/admin/settlements/${settlement.id}/approve`);
    expect(ok.json.settlement).toMatchObject({ status: "approved", approvedBy: founder.id, totalMinor: 1_800_000 + 5_000_000 });
    // Approved statements can't be changed until sent back to draft.
    expect((await as(finance).post(`/admin/settlements/${settlement.id}/adjustments`, { amountMinor: -100, reason: "TEST: too late" })).json.error.code).toBe("not_draft");
    expect((await as(finance).post(`/admin/settlements/${settlement.id}/send-back`, { reason: "TEST: one more line" })).json.settlement).toMatchObject({ status: "draft", approvedBy: null, changedById: finance.id });
    // Roles without settlements can't see them at all.
    expect((await as(await createStaff(db, "ops")).get("/admin/settlements")).status).toBe(403);
  });

  it("holds a disputed visit off the statement until it's released, and voiding frees every visit for the next run", async () => {
    const w = await october();
    const disputed = await w.visit();
    await w.visit({ serviceDate: "2026-10-11" });
    await run();
    const { settlement } = await statementFor(w.partner.id);
    const held = await as(finance).post(`/admin/settlements/${settlement.id}/lines/${disputed.id}/hold`, { reason: "TEST: venue says the member never came" });
    expect(held.json.settlement).toMatchObject({ lineCount: 1, totalMinor: 1_800_000 });
    expect((await as(finance).get(`/admin/settlements/${settlement.id}`)).json.held).toMatchObject([{ id: disputed.id, reason: "TEST: venue says the member never came" }]);
    await run();
    expect((await statementFor(w.partner.id)).settlement.lineCount).toBe(1);
    await as(finance).post(`/admin/redemptions/${disputed.id}/release-hold`);
    await run();
    expect((await statementFor(w.partner.id)).settlement).toMatchObject({ lineCount: 2, totalMinor: 3_600_000 });

    const voided = await as(finance).post(`/admin/settlements/${settlement.id}/void`, { reason: "TEST: rates were wrong" });
    expect(voided.json.settlement).toMatchObject({ status: "void", lineCount: 0 });
    await run();
    const fresh = await statementFor(w.partner.id);
    expect(fresh.settlement.id).not.toBe(settlement.id);
    expect(fresh.settlement.lineCount).toBe(2);
  });

  it("keeps the bank account encrypted, confirms the holder's name with the bank, and sends approved statements back for a fresh look", async () => {
    const w = await october();
    await w.visit();
    await run();
    const { settlement } = await statementFor(w.partner.id);
    await as(approver).post(`/admin/settlements/${settlement.id}/approve`);

    expect((await as(finance).put(`/admin/partners/${w.partner.id}/bank-account`, { bankCode: "044", accountNumber: "0000000000" })).json.error.code).toBe("account_not_found");
    expect((await as(finance).put(`/admin/partners/${w.partner.id}/bank-account`, { bankCode: "999", accountNumber: "0123456789" })).json.error.code).toBe("unknown_bank");
    const set = await as(finance).put(`/admin/partners/${w.partner.id}/bank-account`, { bankCode: "044", accountNumber: "0123456789" });
    expect(set.json).toEqual({ payoutAccount: { bankName: "TEST Access Bank", accountLast4: "6789", accountName: "TEST BEACH CLUB LTD" }, sentBack: 1 });
    const [row] = await db.select().from(schema.partners).where(eq(schema.partners.id, w.partner.id));
    expect(row?.bankDetailsEncrypted).not.toContain("0123456789");
    expect(JSON.parse(sealer.open(row?.bankDetailsEncrypted ?? ""))).toEqual({ bankCode: "044", accountNumber: "0123456789" });
    expect((await as(finance).get(`/admin/settlements/${settlement.id}`)).json.settlement.status).toBe("draft");
    const audit = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, w.partner.id), eq(schema.auditLog.action, "partner.bank_account_set")));
    expect(JSON.stringify(audit)).not.toContain("0123456789");
    // Partnerships can see statements but not change bank accounts.
    expect((await as(await createStaff(db, "partnerships")).put(`/admin/partners/${w.partner.id}/bank-account`, { bankCode: "044", accountNumber: "0123456789" })).status).toBe(403);
  });

  /** An approved October statement for a partner with a bank account. */
  async function approvedStatement() {
    const w = await october();
    await w.visit();
    await as(finance).put(`/admin/partners/${w.partner.id}/bank-account`, { bankCode: "058", accountNumber: "0123456789" });
    await run();
    const { settlement } = await statementFor(w.partner.id);
    await as(approver).post(`/admin/settlements/${settlement.id}/approve`);
    return { ...w, settlementId: settlement.id as string };
  }

  const webhook = (event: string, data: Record<string, unknown>) => {
    const raw = JSON.stringify({ event, data: { id: randomUUID(), ...data } });
    return request("POST", "/webhooks/paystack", { body: raw, headers: { "x-paystack-signature": paystackSignature(PAYSTACK_KEY, raw) } });
  };

  it("pays by Paystack transfer: waiting while pending, paid on the webhook, and a repeat webhook changes nothing", async () => {
    const w = await approvedStatement();
    expect((await as(await createStaff(db, "partnerships")).post(`/admin/settlements/${w.settlementId}/pay`)).status).toBe(403);
    fake.state.transferStatus = "pending";
    const sent = (await as(finance).post(`/admin/settlements/${w.settlementId}/pay`)).json.settlement;
    expect(sent).toMatchObject({ status: "paying", transferAttempts: 1, paidById: finance.id });
    const transfer = fake.calls.filter((c) => c.path === "/transfer").at(-1)?.body;
    expect(transfer).toMatchObject({ amount: 1_800_000, reference: sent.transferReference, source: "balance", currency: "NGN" });
    // Can't be sent twice while one is in flight.
    expect((await as(finance).post(`/admin/settlements/${w.settlementId}/pay`)).json.error.code).toBe("not_approved");

    const done = { reference: sent.transferReference, transfer_code: "TRF_test_done", amount: 1_800_000, status: "success" };
    expect((await webhook("transfer.success", done)).status).toBe(200);
    const paid = (await as(finance).get(`/admin/settlements/${w.settlementId}`)).json.settlement;
    expect(paid).toMatchObject({ status: "paid", paymentReference: "TRF_test_done" });
    const raw = JSON.stringify({ event: "transfer.failed", data: { id: "same", ...done, status: "failed" } });
    await request("POST", "/webhooks/paystack", { body: raw, headers: { "x-paystack-signature": paystackSignature(PAYSTACK_KEY, raw) } });
    expect((await as(finance).get(`/admin/settlements/${w.settlementId}`)).json.settlement.status).toBe("paid");
  });

  it("sends a failed transfer again under a new reference, and asks Paystack when a webhook is late", async () => {
    const w = await approvedStatement();
    fake.state.transferStatus = "pending";
    const first = (await as(finance).post(`/admin/settlements/${w.settlementId}/pay`)).json.settlement;
    await webhook("transfer.failed", { reference: first.transferReference, transfer_code: "TRF_x", reason: "TEST: account closed" });
    const failed = (await as(finance).get(`/admin/settlements/${w.settlementId}`)).json.settlement;
    expect(failed).toMatchObject({ status: "failed", failureReason: "TEST: account closed" });

    const second = (await as(finance).post(`/admin/settlements/${w.settlementId}/pay`)).json.settlement;
    expect(second).toMatchObject({ status: "paying", transferAttempts: 2 });
    expect(second.transferReference).not.toBe(first.transferReference);
    // No webhook: opening the statement asks Paystack, which says it went through.
    fake.state.verify.set(second.transferReference, "success");
    now = new Date(now.getTime() + 60_000);
    expect((await as(finance).get(`/admin/settlements/${w.settlementId}`)).json.settlement).toMatchObject({ status: "paid" });
  });

  it("marks a statement failed when Paystack refuses the transfer, or wants an OTP", async () => {
    const w = await approvedStatement();
    fake.state.refuse = "Your balance is not enough to fulfil this request";
    const refused = (await as(finance).post(`/admin/settlements/${w.settlementId}/pay`)).json.settlement;
    expect(refused).toMatchObject({ status: "failed" });
    expect(refused.failureReason).toContain("balance is not enough");
    fake.state.refuse = null;
    fake.state.transferStatus = "otp";
    expect((await as(finance).post(`/admin/settlements/${w.settlementId}/pay`)).json.settlement.failureReason).toContain("Turn off OTP for transfers");
    fake.state.transferStatus = "success";
    expect((await as(finance).post(`/admin/settlements/${w.settlementId}/pay`)).json.settlement).toMatchObject({ status: "paid", transferAttempts: 3 });
  });

  it("refuses to pay without a bank account, and records a payment made another way", async () => {
    const w = await october();
    await w.visit();
    await run();
    const { settlement } = await statementFor(w.partner.id);
    expect((await as(finance).post(`/admin/settlements/${settlement.id}/pay`)).json.error.code).toBe("not_approved");
    await as(approver).post(`/admin/settlements/${settlement.id}/approve`);
    expect((await as(finance).post(`/admin/settlements/${settlement.id}/pay`)).json.error.code).toBe("no_bank_account");
    const recorded = await as(finance).post(`/admin/settlements/${settlement.id}/record-paid`, { reference: "TEST GTB 000123" });
    expect(recorded.json.settlement).toMatchObject({ status: "paid", paymentReference: "TEST GTB 000123", paidById: finance.id });
    expect((await as(finance).post(`/admin/settlements/${settlement.id}/void`, { reason: "TEST: no" })).json.error.code).toBe("cannot_void");
  });

  it("shows venue managers their approved statements with each visit's member name only; door staff and other partners see nothing", async () => {
    const w = await approvedStatement();
    const loginCode = (await as(founder).post(`/admin/venues/${w.venue.id}/login-code`)).json.loginCode as string;
    await as(founder).post(`/admin/venues/${w.venue.id}/door-staff`, { fullName: "TEST Manager Bisi", pin: "246810", role: "venue_manager" });
    await as(founder).post(`/admin/venues/${w.venue.id}/door-staff`, { fullName: "TEST Door Tunde", pin: "135791" });
    const session = (pin: string) => request("POST", "/partner/session", { body: { venueCode: loginCode, pin } });
    const manager = (await session("246810")).json;
    expect(manager.staff.role).toBe("venue_manager");
    const door = (await session("135791")).json.token as string;

    // A draft for another month isn't shown.
    await w.visit({ serviceDate: "2026-11-01" });
    now = new Date("2026-12-02T09:00:00Z");
    await run();
    now = new Date("2026-11-02T09:00:00Z");

    const list = (await request("GET", "/partner/statements", { token: manager.token })).json.statements;
    expect(list).toEqual([expect.objectContaining({ id: w.settlementId, periodStart: "2026-10-01", totalMinor: 1_800_000, visits: 1, status: "approved", paidAt: null })]);
    const detail = (await request("GET", `/partner/statements/${w.settlementId}`, { token: manager.token })).json;
    expect(detail.lines).toEqual([expect.objectContaining({ member: w.first.member.fullName, amountMinor: 1_800_000, venue: w.venue.name })]);
    expect(JSON.stringify(detail)).not.toContain(w.first.member.phone);
    expect((await request("GET", "/partner/statements", { token: door })).status).toBe(403);

    const other = await approvedStatement();
    expect((await request("GET", `/partner/statements/${other.settlementId}`, { token: manager.token })).status).toBe(404);
  });

  it("runs last month's statements from the monthly job, as the system, so any approver can approve them", async () => {
    const w = await october();
    await w.visit();
    expect((await request("POST", "/jobs/settlements", { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    const res = await request("POST", "/jobs/settlements", { headers: { authorization: `Bearer ${JOBS_SECRET}` } });
    expect(res.json.month).toBe("2026-10");
    const { settlement } = await statementFor(w.partner.id);
    expect(settlement.changedById).toBeNull();
    expect((await as(approver).post(`/admin/settlements/${settlement.id}/approve`)).json.settlement.status).toBe("approved");
  });

  it("lets team leads switch payout approval on for others, never for themselves", async () => {
    const lead = await createStaff(db, "ops_lead");
    expect((await as(lead).patch(`/admin/staff/${finance.id}`, { canApprovePayouts: true })).json.staff.canApprovePayouts).toBe(true);
    await as(lead).patch(`/admin/staff/${finance.id}`, { canApprovePayouts: false });
    expect((await as(lead).patch(`/admin/staff/${lead.id}`, { canApprovePayouts: true })).json.error.code).toBe("cannot_change_self");
    expect((await as(lead).get("/admin/me")).json.staff.canApprovePayouts).toBe(false);
  });
});
