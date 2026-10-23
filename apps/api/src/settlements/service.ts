// Partner statements and payouts (spec milestone 7). Each month's approved visits become a
// statement per partner; finance adjusts it, a payout approver who didn't change it approves it,
// and it is paid by Paystack transfer (or recorded as paid another way). Every change commits with
// its audit row; the rules in @intu/rules decide what's settleable, approvable and payable.
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { approvalCheck, editable, lineAmount, payoutCheck, settleable, statementPeriod, type SettlementStatus } from "@intu/rules";
import { audit, one, schema, type Db, type Tx } from "@intu/db";
import { fail } from "../http.ts";
import { ProviderError, type Payments, type TransferStatus } from "../payments/providers.ts";
import type { Sealer } from "./sealed.ts";

const { benefits, offers, partners, redemptions, settlementAdjustments, settlements, staffUsers, venues } = schema;
type Settlement = typeof settlements.$inferSelect;
export type SettlementActor = { type: "staff"; id: string } | { type: "system" };
const SYSTEM: SettlementActor = { type: "system" };

export const CANNOT_APPROVE = {
  not_draft: "Only a draft statement can be approved",
  not_an_approver: "You can't approve payouts. A team lead can switch this on for you under Team.",
  changed_it_yourself: "You made or last changed this statement, so someone else has to approve it",
  nothing_to_pay: "There's nothing to pay on this statement. Void it instead.",
} as const;

export const CANNOT_PAY = {
  not_approved: "Only an approved statement can be paid",
  no_bank_account: "Add the partner's bank account first",
  not_naira: "Payouts are in naira only",
  nothing_to_pay: "There's nothing to pay on this statement",
} as const;

/** Paystack references: letters, digits, - and _. One per attempt, so a retry never pays twice. */
const transferReference = (id: string, attempt: number) => `intu_stl_${id.replace(/-/g, "")}_${attempt}`;

/** Brings a statement's totals up to date with its lines and adjustments. */
async function recompute(tx: Tx, id: string) {
  const [lines] = await tx
    .select({ total: sql<number>`coalesce(sum(${redemptions.settledAmountMinor}), 0)`.mapWith(Number), count: sql<number>`count(*)`.mapWith(Number) })
    .from(redemptions)
    .where(and(eq(redemptions.settlementId, id), isNull(redemptions.deletedAt)));
  const [adj] = await tx
    .select({ total: sql<number>`coalesce(sum(${settlementAdjustments.amountMinor}), 0)`.mapWith(Number) })
    .from(settlementAdjustments)
    .where(and(eq(settlementAdjustments.settlementId, id), isNull(settlementAdjustments.deletedAt)));
  const linesMinor = lines?.total ?? 0;
  return one(await tx.update(settlements).set({ linesMinor, lineCount: lines?.count ?? 0, totalMinor: linesMinor + (adj?.total ?? 0) }).where(eq(settlements.id, id)).returning());
}

/**
 * A transfer's outcome, from Paystack's webhook, a check with Paystack, or the send itself. Only a
 * statement waiting on that transfer changes, so a repeat changes nothing.
 */
export async function applyTransferResult(tx: Tx, result: { reference: string; transferCode: string | null; status: TransferStatus; reason?: string | undefined }, clock: () => Date) {
  if (result.status === "pending") return null;
  const [before] = await tx.select().from(settlements).where(eq(settlements.transferReference, result.reference)).for("update");
  if (!before || (before.status !== "paying" && !(before.status === "failed" && result.status === "success"))) return null;
  const after = one(
    await tx
      .update(settlements)
      .set(
        result.status === "success"
          ? { status: "paid", paidAt: clock(), paymentReference: result.transferCode ?? result.reference, transferCode: result.transferCode ?? before.transferCode, failureReason: null }
          : { status: "failed", transferCode: result.transferCode ?? before.transferCode, failureReason: result.reason ?? "The transfer failed" },
      )
      .where(eq(settlements.id, before.id))
      .returning(),
  );
  await audit(tx, SYSTEM, { action: result.status === "success" ? "settlement.paid" : "settlement.payout_failed", entity: "settlement", entityId: before.id, before, after });
  return after;
}

export function settlementService(deps: { db: Db; payments: Payments; sealer: Sealer | null; clock: () => Date }) {
  const { db } = deps;

  const lockDraft = async (tx: Tx, id: string) => {
    const [s] = await tx.select().from(settlements).where(and(eq(settlements.id, id), isNull(settlements.deletedAt))).for("update");
    if (!s) fail(404, "not_found", "Statement not found");
    if (!editable(s.status)) fail(409, "not_draft", "Only a draft statement can be changed. Send it back to draft first.");
    return s;
  };

  const touched = (tx: Tx, id: string, staffId: string) => tx.update(settlements).set({ changedById: staffId }).where(eq(settlements.id, id));

  /**
   * Builds each partner's statement for a month from its settleable visits: a new draft, or more
   * lines on the month's draft. Visits synced late from earlier months join it too. A partner whose
   * statement for the month is already approved or paid keeps its late visits for next month.
   */
  async function run(month: string, actor: SettlementActor) {
    const { start, end } = statementPeriod(month);
    const candidates = await db
      .select({
        id: redemptions.id,
        result: redemptions.result,
        settlementId: redemptions.settlementId,
        serviceDate: redemptions.serviceDate,
        flagged: redemptions.flagged,
        flagReviewedAt: redemptions.flagReviewedAt,
        settlementHoldReason: redemptions.settlementHoldReason,
        deletedAt: redemptions.deletedAt,
        partySize: redemptions.partySize,
        partnerId: venues.partnerId,
        rateMinor: offers.rateMinor,
        rateCurrency: offers.rateCurrency,
        drawPerPerson: benefits.drawPerPerson,
      })
      .from(redemptions)
      .innerJoin(venues, eq(venues.id, redemptions.venueId))
      .innerJoin(offers, eq(offers.id, redemptions.offerId))
      .leftJoin(benefits, eq(benefits.id, redemptions.benefitId))
      .where(and(eq(redemptions.result, "approved"), isNull(redemptions.settlementId), isNull(redemptions.deletedAt), lte(redemptions.serviceDate, end)));
    const byPartner = new Map<string, typeof candidates>();
    for (const c of candidates) {
      if (!settleable(c, end).ok || c.rateCurrency !== "NGN") continue;
      byPartner.set(c.partnerId, [...(byPartner.get(c.partnerId) ?? []), c]);
    }

    const made: { settlementId: string; partnerId: string; added: number; totalMinor: number; created: boolean }[] = [];
    const waiting: { partnerId: string; visits: number; status: SettlementStatus }[] = [];
    for (const [partnerId, lines] of byPartner) {
      const outcome = await db.transaction(async (tx) => {
        const partner = one(await tx.select().from(partners).where(eq(partners.id, partnerId)));
        let [statement] = await tx
          .select()
          .from(settlements)
          .where(and(eq(settlements.partnerId, partnerId), eq(settlements.periodStart, start), sql`${settlements.status} <> 'void'`, isNull(settlements.deletedAt)))
          .for("update");
        if (statement && statement.status !== "draft") return { waiting: { partnerId, visits: lines.length, status: statement.status } };
        const created = !statement;
        if (!statement) {
          statement = one(
            await tx
              .insert(settlements)
              .values({ partnerId, periodStart: start, periodEnd: end, totalMinor: 0, currency: "NGN", changedById: actor.type === "staff" ? actor.id : null, isTest: partner.isTest })
              .returning(),
          );
        } else if (actor.type === "staff") await touched(tx, statement.id, actor.id);
        let added = 0;
        for (const line of lines) {
          const amount = lineAmount({ rateMinor: line.rateMinor, partySize: line.partySize, drawPerPerson: line.drawPerPerson ?? false });
          // Only if still unsettled: a run alongside this one can't put a visit on two statements.
          const rows = await tx.update(redemptions).set({ settlementId: statement.id, settledAmountMinor: amount }).where(and(eq(redemptions.id, line.id), isNull(redemptions.settlementId))).returning({ id: redemptions.id });
          added += rows.length;
        }
        const after = await recompute(tx, statement.id);
        await audit(tx, actor, { action: created ? "settlement.created" : "settlement.lines_added", entity: "settlement", entityId: statement.id, before: created ? null : statement, after: { ...after, linesAdded: added } });
        return { made: { settlementId: statement.id, partnerId, added, totalMinor: after.totalMinor, created } };
      });
      if (outcome.made) made.push(outcome.made);
      if (outcome.waiting) waiting.push(outcome.waiting);
    }
    return { month, periodStart: start, periodEnd: end, statements: made, waiting };
  }

  async function addAdjustment(id: string, input: { amountMinor: number; reason: string }, staffId: string) {
    return db.transaction(async (tx) => {
      await lockDraft(tx, id);
      const row = one(await tx.insert(settlementAdjustments).values({ settlementId: id, amountMinor: input.amountMinor, reason: input.reason, createdById: staffId }).returning());
      await touched(tx, id, staffId);
      const after = await recompute(tx, id);
      await audit(tx, { type: "staff", id: staffId }, { action: "settlement.adjustment_added", entity: "settlement", entityId: id, after: { adjustment: row, totalMinor: after.totalMinor } });
      return after;
    });
  }

  async function removeAdjustment(id: string, adjustmentId: string, staffId: string) {
    return db.transaction(async (tx) => {
      await lockDraft(tx, id);
      const [adj] = await tx.select().from(settlementAdjustments).where(and(eq(settlementAdjustments.id, adjustmentId), eq(settlementAdjustments.settlementId, id), isNull(settlementAdjustments.deletedAt)));
      if (!adj) fail(404, "not_found", "Adjustment not found");
      await tx.update(settlementAdjustments).set({ deletedAt: deps.clock() }).where(eq(settlementAdjustments.id, adj.id));
      await touched(tx, id, staffId);
      const after = await recompute(tx, id);
      await audit(tx, { type: "staff", id: staffId }, { action: "settlement.adjustment_removed", entity: "settlement", entityId: id, before: { adjustment: adj }, after: { totalMinor: after.totalMinor } });
      return after;
    });
  }

  /** Takes a visit off a draft statement and keeps it off statements (a dispute, say) until released. */
  async function holdLine(id: string, redemptionId: string, reason: string, staffId: string) {
    return db.transaction(async (tx) => {
      await lockDraft(tx, id);
      const [line] = await tx.select().from(redemptions).where(and(eq(redemptions.id, redemptionId), eq(redemptions.settlementId, id))).for("update");
      if (!line) fail(404, "not_found", "That visit isn't on this statement");
      const held = one(await tx.update(redemptions).set({ settlementId: null, settledAmountMinor: null, settlementHoldReason: reason }).where(eq(redemptions.id, line.id)).returning());
      await audit(tx, { type: "staff", id: staffId }, { action: "redemption.settlement_held", entity: "redemption", entityId: line.id, before: { settlementId: line.settlementId, settledAmountMinor: line.settledAmountMinor }, after: { settlementHoldReason: held.settlementHoldReason } });
      await touched(tx, id, staffId);
      const after = await recompute(tx, id);
      await audit(tx, { type: "staff", id: staffId }, { action: "settlement.line_held", entity: "settlement", entityId: id, after: { redemptionId, reason, totalMinor: after.totalMinor } });
      return after;
    });
  }

  /** Lets a held visit go on the next statement run (or a re-run of a month still in draft). */
  async function releaseHold(redemptionId: string, staffId: string) {
    return db.transaction(async (tx) => {
      const [line] = await tx.select().from(redemptions).where(eq(redemptions.id, redemptionId)).for("update");
      if (!line?.settlementHoldReason) fail(404, "not_found", "That visit isn't held");
      await tx.update(redemptions).set({ settlementHoldReason: null }).where(eq(redemptions.id, line.id));
      await audit(tx, { type: "staff", id: staffId }, { action: "redemption.settlement_released", entity: "redemption", entityId: line.id, before: { settlementHoldReason: line.settlementHoldReason }, after: { settlementHoldReason: null } });
    });
  }

  async function approve(id: string, staffId: string) {
    return db.transaction(async (tx) => {
      const [s] = await tx.select().from(settlements).where(and(eq(settlements.id, id), isNull(settlements.deletedAt))).for("update");
      if (!s) fail(404, "not_found", "Statement not found");
      const approver = one(await tx.select({ id: staffUsers.id, canApprovePayouts: staffUsers.canApprovePayouts }).from(staffUsers).where(eq(staffUsers.id, staffId)));
      const check = approvalCheck(s, approver);
      if (!check.ok) fail(check.reason === "not_an_approver" ? 403 : 409, check.reason, CANNOT_APPROVE[check.reason]);
      const after = one(await tx.update(settlements).set({ status: "approved", approvedBy: staffId, approvedAt: deps.clock() }).where(eq(settlements.id, id)).returning());
      await audit(tx, { type: "staff", id: staffId }, { action: "settlement.approved", entity: "settlement", entityId: id, before: s, after });
      return after;
    });
  }

  /** An approved statement (or one whose transfer failed) back to draft, to change it; it needs approving again. */
  async function sendBack(id: string, note: string, staffId: string) {
    return db.transaction(async (tx) => {
      const [s] = await tx.select().from(settlements).where(and(eq(settlements.id, id), isNull(settlements.deletedAt))).for("update");
      if (!s) fail(404, "not_found", "Statement not found");
      if (s.status !== "approved" && s.status !== "failed") fail(409, "not_approved", "Only an approved statement, or one whose payout failed, can go back to draft");
      const after = one(await tx.update(settlements).set({ status: "draft", approvedBy: null, approvedAt: null, changedById: staffId }).where(eq(settlements.id, id)).returning());
      await audit(tx, { type: "staff", id: staffId }, { action: "settlement.sent_back", entity: "settlement", entityId: id, before: s, after: { ...after, note } });
      return after;
    });
  }

  /** Cancels a statement that isn't paid or being paid; its visits go on the next run. */
  async function voidStatement(id: string, reason: string, staffId: string) {
    return db.transaction(async (tx) => {
      const [s] = await tx.select().from(settlements).where(and(eq(settlements.id, id), isNull(settlements.deletedAt))).for("update");
      if (!s) fail(404, "not_found", "Statement not found");
      if (s.status === "paid" || s.status === "paying" || s.status === "void") fail(409, "cannot_void", `A ${s.status} statement can't be voided`);
      const released = await tx.update(redemptions).set({ settlementId: null, settledAmountMinor: null }).where(eq(redemptions.settlementId, id)).returning({ id: redemptions.id });
      const after = one(await tx.update(settlements).set({ status: "void", voidReason: reason, changedById: staffId, lineCount: 0, linesMinor: 0 }).where(eq(settlements.id, id)).returning());
      await audit(tx, { type: "staff", id: staffId }, { action: "settlement.voided", entity: "settlement", entityId: id, before: s, after: { ...after, visitsReleased: released.length } });
      return after;
    });
  }

  /**
   * Sends the payout by Paystack transfer. The statement is marked as paying, with this attempt's
   * reference, before Paystack is called: a crash part-way leaves a reference to check, never a
   * second transfer.
   */
  async function pay(id: string, staffId: string) {
    const payouts = deps.payments.payouts;
    if (!payouts) fail(503, "payouts_not_set_up", "Payouts aren't set up: add the Paystack key");
    const sent = await db.transaction(async (tx) => {
      const [s] = await tx.select().from(settlements).where(and(eq(settlements.id, id), isNull(settlements.deletedAt))).for("update");
      if (!s) fail(404, "not_found", "Statement not found");
      const partner = one(await tx.select().from(partners).where(eq(partners.id, s.partnerId)));
      const check = payoutCheck(s, partner);
      if (!check.ok) fail(409, check.reason, CANNOT_PAY[check.reason]);
      const attempt = s.transferAttempts + 1;
      const after = one(
        await tx
          .update(settlements)
          .set({ status: "paying", transferReference: transferReference(s.id, attempt), transferAttempts: attempt, transferCode: null, failureReason: null, paidById: staffId })
          .where(eq(settlements.id, s.id))
          .returning(),
      );
      await audit(tx, { type: "staff", id: staffId }, { action: "settlement.payout_sent", entity: "settlement", entityId: s.id, before: s, after });
      return { statement: after, recipientCode: partner.payoutRecipientCode ?? "", partnerName: partner.tradingName };
    });
    const reference = sent.statement.transferReference ?? "";
    let result: Awaited<ReturnType<typeof payouts.transfer>>;
    try {
      result = await payouts.transfer({ amountMinor: sent.statement.totalMinor, recipientCode: sent.recipientCode, reference, reason: `intu statement ${sent.statement.periodStart.slice(0, 7)} ${sent.partnerName}`.slice(0, 100) });
    } catch (err) {
      // Paystack refused it outright, so no transfer exists: it can be sent again.
      if (!(err instanceof ProviderError) || err.status >= 500) return sent.statement;
      result = { transferCode: null, status: "failed", reason: err.message };
    }
    const applied = await db.transaction((tx) => applyTransferResult(tx, { reference, ...result }, deps.clock));
    return applied ?? one(await db.select().from(settlements).where(eq(settlements.id, id)));
  }

  /** Records a payout made outside Paystack (a bank transfer from the business account, say). */
  async function recordPaid(id: string, reference: string, staffId: string) {
    return db.transaction(async (tx) => {
      const [s] = await tx.select().from(settlements).where(and(eq(settlements.id, id), isNull(settlements.deletedAt))).for("update");
      if (!s) fail(404, "not_found", "Statement not found");
      if (s.status !== "approved" && s.status !== "failed") fail(409, "not_approved", CANNOT_PAY.not_approved);
      const after = one(await tx.update(settlements).set({ status: "paid", paidAt: deps.clock(), paidById: staffId, paymentReference: reference, failureReason: null }).where(eq(settlements.id, id)).returning());
      await audit(tx, { type: "staff", id: staffId }, { action: "settlement.recorded_paid", entity: "settlement", entityId: id, before: s, after });
      return after;
    });
  }

  /** When each paying statement was last checked with Paystack, so a busy page doesn't flood it. */
  const lastChecked = new Map<string, number>();

  /** The safety net for a late or lost transfer webhook: asks Paystack how the transfer went. */
  async function reconcile(id: string, opts: { force?: boolean } = {}) {
    const [s] = await db.select().from(settlements).where(eq(settlements.id, id));
    if (!s || s.status !== "paying" || !s.transferReference || !deps.payments.payouts) return false;
    const now = deps.clock().getTime();
    if (!opts.force && now - (lastChecked.get(id) ?? 0) < 8_000) return false;
    if (lastChecked.size > 5_000) lastChecked.clear();
    lastChecked.set(id, now);
    let result;
    try {
      result = await deps.payments.payouts.verifyTransfer(s.transferReference);
    } catch (err) {
      // Paystack never made a transfer with this reference: it can be sent again.
      if (err instanceof ProviderError && err.status === 404) result = { transferCode: null, status: "failed" as const, reason: "Paystack has no transfer with this reference" };
      else return false;
    }
    const reference = s.transferReference;
    return (await db.transaction((tx) => applyTransferResult(tx, { reference, ...result }, deps.clock))) !== null;
  }

  // ------------------------------------------------------------------ The partner's bank account

  /**
   * Sets where a partner is paid: the bank confirms the account holder's name, Paystack makes a
   * transfer recipient, and the account number is kept only encrypted. Approved statements not yet
   * paid go back to draft, so a changed account is always looked at by an approver before money goes.
   */
  async function setBankAccount(partnerId: string, input: { bankCode: string; accountNumber: string }, staffId: string) {
    const payouts = deps.payments.payouts;
    if (!payouts) fail(503, "payouts_not_set_up", "Payouts aren't set up: add the Paystack key");
    if (!deps.sealer) fail(503, "bank_details_not_set_up", "Bank details can't be saved until BANK_DETAILS_KEY is set on the API");
    const [partner] = await db.select().from(partners).where(and(eq(partners.id, partnerId), isNull(partners.deletedAt)));
    if (!partner) fail(404, "not_found", "Partner not found");
    const bank = (await payouts.banks()).find((b) => b.code === input.bankCode);
    if (!bank) fail(422, "unknown_bank", "Pick the partner's bank from the list");
    let accountName: string;
    try {
      ({ accountName } = await payouts.resolveAccount(input.accountNumber, input.bankCode));
    } catch (err) {
      if (err instanceof ProviderError) fail(422, "account_not_found", "The bank couldn't find that account number. Check it and the bank.");
      throw err;
    }
    const { recipientCode } = await payouts.createRecipient({ name: accountName, accountNumber: input.accountNumber, bankCode: input.bankCode });
    const sealed = deps.sealer.seal(JSON.stringify({ bankCode: input.bankCode, accountNumber: input.accountNumber }));
    return db.transaction(async (tx) => {
      const before = one(await tx.select().from(partners).where(eq(partners.id, partnerId)).for("update"));
      const after = one(
        await tx
          .update(partners)
          .set({ bankDetailsEncrypted: sealed, payoutBankName: bank.name, payoutAccountLast4: input.accountNumber.slice(-4), payoutAccountName: accountName, payoutRecipientCode: recipientCode })
          .where(eq(partners.id, partnerId))
          .returning(),
      );
      const shown = (p: typeof before) => ({ payoutBankName: p.payoutBankName, payoutAccountLast4: p.payoutAccountLast4, payoutAccountName: p.payoutAccountName, payoutRecipientCode: p.payoutRecipientCode });
      await audit(tx, { type: "staff", id: staffId }, { action: "partner.bank_account_set", entity: "partner", entityId: partnerId, before: shown(before), after: shown(after) });
      const toRecheck = await tx.select().from(settlements).where(and(eq(settlements.partnerId, partnerId), inArray(settlements.status, ["approved", "failed"]), isNull(settlements.deletedAt))).for("update");
      for (const s of toRecheck) {
        const back = one(await tx.update(settlements).set({ status: "draft", approvedBy: null, approvedAt: null, changedById: staffId }).where(eq(settlements.id, s.id)).returning());
        await audit(tx, { type: "staff", id: staffId }, { action: "settlement.sent_back", entity: "settlement", entityId: s.id, before: s, after: { ...back, note: "The partner's bank account changed" } });
      }
      return { partner: after, sentBack: toRecheck.length };
    });
  }

  return { run, addAdjustment, removeAdjustment, holdLine, releaseHold, approve, sendBack, voidStatement, pay, recordPaid, reconcile, setBankAccount };
}

export type SettlementService = ReturnType<typeof settlementService>;
export type { Settlement };
