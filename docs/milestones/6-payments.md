# Milestone 6 — Payments

## What was built

**Buying in the member app**
- **Get a pass** (Pass tab when there's none, and Account): the plans on sale today with what each includes, its dates, and its price in naira, pounds or dollars (naira first for Nigerian numbers, pounds for UK ones).
- **Checkout**: the member confirms an email for the receipt and pays on the provider's own page (Stripe for pounds and dollars by card; Paystack for naira by card, bank transfer or USSD). intu never sees card details. The app waits while the payment is confirmed, then shows the pass.
- The pass is only made when the provider's **webhook** says the money arrived, with the amount and currency checked against the order. A season pass (December Pass) runs for its season, from today if bought once it has started. A yearly plan starts today and **renews automatically** (spec: subscriptions for annual plans).
- **Account → Membership**: auto-renew on or off (the pass runs to its end), and a note when a renewal payment failed. **Payments and receipts** lists every payment and any refund.
- **Crew passes**: the buyer pays for the whole crew, gets their pass at once, and invites the others by phone from Account → Your crew. An invite shows on the invitee's Pass tab when they sign in with that number; joining gives them a pass in the crew with the same dates and the shared allowances. Pending invites can be withdrawn.

**Webhooks** (`POST /webhooks/stripe`, `POST /webhooks/paystack`): signatures checked; each event recorded with the change it makes, in one transaction, so the same event twice changes nothing. Renewals make the next year's pass from the day after the current one ends; failed renewals mark the subscription past due; a cancelled subscription is recorded; refunds are settled when the provider confirms them.

**Safety net for late webhooks**: while the app waits after the payment page, the API also asks Stripe (the checkout session) or Paystack (verify transaction) whether the order is paid, at most every 8 seconds, and applies the answer exactly as the webhook would. Whichever arrives first makes the pass; the other changes nothing. In the console, a pending order has **Check with Stripe / Paystack**.

**Console → Payments** (finance, founder, ops lead; ops can look)
- Money taken this month and in all, by currency, after refunds (TEST payments shown apart until there is real money).
- Every order, searchable and filtered by status, with its refunds; **failed renewals**.
- **Refunds**: amount (part or all), reason, and whether to end the pass (for a Crew pass, the whole crew's; auto-renew stops too). Over **₦150,000 / £75 / $100** a refund waits in **Refunds waiting for approval** until a different person approves (or rejects with a reason); smaller ones go straight to the provider. Everything is audited.
- The member page shows their payments, with Refund.

**TEST payments**: without a provider's keys (and never in production), checkout opens the API's own TEST page instead, where "Pay (TEST)" makes the pass and no money moves. Staging uses this until the Stripe and Paystack test keys are added.

**Rules** (`packages/rules/src/sales.ts`): which provider takes a currency, the member's first currency, whether a plan is on sale, a pass's dates, renewal dates, when a refund needs approval, and how much is still refundable.

**Database:** migration 0022 adds `orders`, `refunds`, `subscriptions`, `crew_invites`, and `plan_prices.paystack_plan_code` (Paystack's yearly plan for a price, made on first sale). Webhook events reuse `webhook_events`. The TEST reset clears TEST payments.

## How to run it

- Locally: nothing to set; payments use the TEST page on the API. Get a pass in the member app → Pay → "Pay (TEST)".
- Real providers in test mode: see ENVIRONMENTS.md → Payments (Stripe and Paystack keys, webhook URLs, test cards). `.env.example` lists every setting; live keys are refused unless `PAYMENTS_LIVE=yes`.

## What was tested

- Rules (Vitest): providers, first currency, sale windows, pass and renewal dates, refund limits and what's refundable.
- Providers (Vitest, network faked): Stripe checkout request, events read from webhooks (paid, renewed, failed, ended, refunds, ignored), forged and stale signatures refused, refunds and auto-renew; Paystack plan made once and reused, checkout in naira, first payment, subscription start, renewal by customer and plan, failed renewal, refunds, forged signature, email token for auto-renew.
- API with the database: plans on sale; a Stripe payment makes one pass even when the webhook arrives twice; a wrong amount makes none; a yearly pass renews into the next year, auto-renew off reaches Stripe, a failed renewal shows to finance, and an ended subscription is recorded; Paystack in naira end to end; Crew invites (full crew, only the buyer invites, joining with the same dates and shared allowance, withdrawing); refunds (straight through under the limit, waiting above it, not by the person who asked, settled by webhook, ending the pass; rejection; nothing over what was paid; ops can't refund; the concierge can't see payments); the TEST page.
- Member app end to end: someone with no pass buys one on the TEST payment page and the pass appears, with the receipt.
- Console end to end: finance refunds over the limit; it waits; the founder approves in their own session; the pass ends.

## Left open

- **Real Stripe and Paystack test accounts** (Dapo): until their keys are in Vercel, staging uses TEST payments. Steps in ENVIRONMENTS.md.
- **Receipt emails** come with milestone 8 (Postmark); receipts are in the app meanwhile.
- **Updating a card** after a failed renewal: for now the member asks the concierge; a self-serve link (Stripe's billing portal, Paystack's manage link) can follow.
- **Crew passes that renew** (yearly Crew plans): the renewal renews the buyer's pass only; the crew would be invited again. None are on sale yet.
- **Refund limits** are fixed in `packages/rules` (₦150,000 / £75 / $100); a settings screen can come if they change often.
- Whether refunds and payouts need a **payments licence** in the UK and Nigeria is for the lawyer (spec: Payments and money).
