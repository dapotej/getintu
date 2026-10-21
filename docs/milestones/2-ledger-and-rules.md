# Milestone 2 — Ledger and rules

## What was built

- **Full schema** (`packages/db/src/schema`), migrations `0001_ledger` and `0002_audit_log_append_only`:
  plans and prices per currency, benefits, client accounts, memberships, allowances, devices (QR keys), partners, venues, offers, staff users and their venues, redemptions, bookings, settlements, eSIM orders, webhook events (for idempotency) and the audit log.
  - Money is integer minor units plus a currency code everywhere (`rate_minor`, `amount_minor`, `total_minor`).
  - Database-level guards: allowance `used` can never go below 0 or above `granted`; an allowance belongs to exactly one membership *or* one Crew group; a scanned code can be approved only once (partial unique index); membership and period dates can't be inverted.
  - The audit log rejects updates, deletes and truncates via a trigger.
- **Rules engine** (`packages/rules`), pure functions with no database code:
  - `evaluate()` runs the spec's six checks in order and returns the first failure: `MEMBERSHIP_NOT_ACTIVE`, `OUTSIDE_MEMBERSHIP_DATES`, `VENUE_INACTIVE`, `VENUE_CLOSED`, `OFFER_NOT_VALID_NOW`, `BENEFIT_NOT_IN_PLAN`, `VENUE_TIER_NOT_ALLOWED`, `ALLOWANCE_USED_UP`, `VENUE_MONTHLY_CAP`, `VENUE_DAILY_LIMIT`, `OFFER_DAILY_CAP`, `DUPLICATE_SCAN`.
  - `serviceDate()` puts after-midnight visits on the night they started.
  - `allowancePeriods()` splits a membership into per-pass, per-month or per-year periods.
- **Ledger writes**:
  - `grantAllowances()` (`packages/db`) creates a membership's allowances per benefit per period, with one shared allowance per Crew group for shared benefits.
  - `redeem()` (`apps/api/src/ledger`) is the one path for recording a door attempt. It locks the offer and the allowance, gathers history, calls `evaluate()`, writes the redemption (approved or declined), draws down the allowance and writes audit rows, all in one transaction.
- **TEST seed** now includes the three December Pass tiers from the concept doc (prices and quantities as proposed), offers at each TEST venue (placeholder rates), 8 members including a Crew of four, and their allowances.

## How to run it

```sh
pnpm db:reset      # local only: rebuild, migrate, seed
pnpm check
```

## What was tested

- 41 rules tests: one per decline reason (and a guard test that fails if a new reason is added without one), check order, membership edges, monthly cap across months, after-midnight nights, two-window days, 24:00 closes, and allowance periods (month ends, leap years, membership years).
- 10 database tests on `redeem()`: approval with draw-down and audit rows; declines logged without touching the allowance; **two simultaneous scans of the same code give exactly one approval**; a burst of ten simultaneous scans gives one; concurrent members never exceed an offer's daily cap; a shared Crew allowance is used once across the group; unlimited benefits count uses without running out; a failure mid-transaction leaves no redemption behind; the audit log refuses edits.
- The concurrency tests passed 15 out of 15 repeated runs. The full suite passed 3 out of 3 runs.

## Left open (questions for Dapo)

1. **`DUPLICATE_SCAN` only matters when the per-venue daily cap is switched off.** With the cap on (the default), a second scan within 10 minutes already fails check 5 as `VENUE_DAILY_LIMIT`. I've made the daily cap a per-benefit setting (the spec lists caps on the benefit), so the duplicate check protects benefits where several visits a day are allowed, such as a future unlimited home gym. Should staff see "Already approved at 21:04" instead of a decline for a quick re-scan? That's a scanner display decision for milestone 4.
2. **Venue tiers for the December Pass.** The seed lets December Pass benefits use both standard and top-tier venues. Which venues are top tier, and which plans may use them?
3. **Membership dates use the service day.** Because of the after-midnight rule, a pass ending 10 January still works at a club at 01:00 on 11 January. Confirm that's intended.
4. **Party size doesn't multiply the draw-down.** A Crew hosted night for four uses one unit of the group allowance. That's right for the hosted night; say if any benefit should draw one unit per person.

## Not yet (later milestones)

- `POST /scan` and the QR code itself: milestones 4 and 5. `redeem()` is ready for the endpoint to call.
- Allowance resets: allowances are created for every period up front when a membership is granted, so no reset job is needed for passes. Annual plans may still want a job later.
- Offline sync and flagging (milestone 4); eSIM draw-down (milestone 8); settlements (milestone 7).
