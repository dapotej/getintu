# Milestone 7 — Settlements and payouts

## What was built

**Statements** (spec: Admin console, Settlements and payouts; main role Finance)
- A **statement** per partner per month, built from approved visits at each offer's rate. When the plan's benefit counts per person, the rate is paid per person in the party; otherwise once per visit. The amount is fixed on the visit when it joins a statement, so later rate changes don't move it.
- Visits **synced late** from an earlier month join the next statement. **Flagged** offline visits wait until ops closes the flag. Finance can **hold** a disputed visit off the statement (with a reason) and **release** it later; it then joins the next statement built.
- **Adjustments**: finance adds lines by hand (a flat monthly fee such as doctor on call or unlimited gym, a correction as a minus amount, goodwill), each with a reason the partner sees.
- **Built on the 1st** as drafts by a monthly job (07:17 Lagos), or by finance from **Console → Statements → Build statements** for any past month. Building again only adds visits not already on a statement; a partner whose statement for that month is already approved keeps late visits for the next month.

**Approval** (Dapo: "configurable, depending on the user's permissions")
- Finance (and the founder and ops lead) prepare statements, set partners' bank accounts and pay. Partnerships can look.
- **Approving** needs the person's own **Approves payouts** switch (Console → Settings → Team), set by a team lead and never by the person themselves. Founders have it from the start.
- The spec's second person still applies: whoever built or last changed a statement can't approve it. A statement built by the monthly job can be approved by any approver.
- An approved statement can be **sent back to draft** (it then needs approving again) or **voided**, which frees its visits for the next statement.

**Payouts** (Paystack Transfers, naira only)
- **Payout account** on the partner's page: pick the bank and type the 10-digit account number. The bank confirms the account holder's name, Paystack makes a transfer recipient, and the account number is **encrypted** (AES-256-GCM with `BANK_DETAILS_KEY`). The console only ever shows the bank, the last four digits and the confirmed name, and the audit log never holds the number.
- **Changing the account sends any approved, unpaid statement back to draft**, so an approver looks again before money goes to a new account.
- **Pay by Paystack transfer**: the statement is marked "Transfer sent" with a reference for this attempt before Paystack is called, so a crash or a double click can't pay twice. Paystack's `transfer.success`, `transfer.failed` and `transfer.reversed` webhooks finish it, idempotently, through the same webhook handling as payments. Opening the statement also asks Paystack (at most every 8 seconds) in case the webhook is late. A failed or refused transfer (no balance, OTP still on) says why and can be sent again under a new reference.
- **Record a payment made another way** (a bank transfer from the business account) with its reference.

**Partner portal** (spec: Partner app portal, Money): venue **managers** get a **Statements** tab in the partner app. It shows each month intu has approved, the total, "Approved, payment on its way" or "Paid" with the reference, adjustments with their reasons, and each visit (date, service, party size, venue, amount) with the member's **name only**. Drafts and voided statements aren't shown, and door staff don't get the tab. Partner staff can now be added as **Manager** on a listing's page.

**Rules** (`packages/rules/src/settlements.ts`): the month a statement covers, what a visit is worth, what's settleable (each reason it isn't: not approved, already on a statement, after the period, flag open, on hold, deleted), who can approve (not a draft, not an approver, changed it yourself, nothing to pay) and what can be paid (not approved, no bank account, not naira, nothing to pay). Each has its own test.

**Database:** migration 0023 adds `settlement_adjustments`; on `settlements` the line totals, who last changed, approved and paid it, the transfer reference, code and attempts, failure and void reasons, and one live statement per partner per month; `redemptions.settled_amount_minor` and `settlement_hold_reason`; the partner's payout bank, last four digits, account name and Paystack recipient; and `staff_users.can_approve_payouts` (on for founders). Settlement statuses gain "paying" and "failed".

## How to run it

- Locally: nothing to set. Payouts are TEST payouts (no money). Console → Statements → Build, open a statement, add the payout account on the partner's page (TEST Bank, any 10 digits), approve as a second person with the switch on, then Pay.
- Staging: see ENVIRONMENTS.md → Partner payouts (Paystack transfer OTP off, `BANK_DETAILS_KEY`, `JOBS_SECRET`). `.env.example` lists both.

## What was tested

- Rules (Vitest): periods, line amounts, every reason a visit isn't settleable, every reason a statement can't be approved or paid.
- Encryption (Vitest): sealed details open back, differ each time, and are refused when tampered with, under another key, or with a short key.
- API with the database (Vitest, Paystack faked at the network): building a month (per person, once per visit, late September visits, declined, flagged and November visits left off; a reviewed flag added on a re-run; audit rows); approval (not an approver, changed it yourself, a founder approves, no changes once approved, send back; ops can't see statements); holds, release and void; the payout account (bank not found, unknown bank, stored encrypted and never in the audit log, approved statements sent back, partnerships refused); paying (pending then paid by webhook, a repeat webhook changes nothing, partnerships can't pay); a failed transfer sent again under a new reference; a late webhook picked up by asking Paystack; a refused transfer and an OTP; no bank account; recording a payment made another way; the partner portal (manager sees approved statements with names only, door staff refused, another partner's statement not found); the monthly job's secret; team leads switching approval on for others but not themselves.
- Console end to end: finance builds last month's statements, adds a flat fee, can't approve, adds the payout account; the founder approves in their own session and pays by TEST transfer.
- Partner app end to end: a manager sees the approved September statement (not October's draft), its adjustment and visits with the member's name and no phone; door staff have no Statements tab.

## Left open

- **Withholding tax and VAT** on partner payments aren't deducted or shown. Ask an accountant whether intu must withhold (often 5–10% in Nigeria) and how to show it; it would be an adjustment line today.
- **Disputes in the partner app** (spec Phase 2): partners report a visit to ops from the Today tab; finance holds it here.
- **Live transfers** need Paystack's business verification and a funded balance; staging stays in test mode until Dapo says otherwise.
- Statement **PDF or CSV export** for partners isn't built yet.
