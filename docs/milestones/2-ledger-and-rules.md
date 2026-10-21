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

## Questions answered (21 Oct 2026)

All four questions are settled and recorded in `docs/DECISIONS.md`:

1. **Re-scans.** Answer: tell staff it was already claimed, and when. Built: the duplicate check now runs before the allowance and caps checks, and returns `claimedAt`. The scanner shows it in Lagos time (milestone 4).
2. **Top-tier venues.** Answer: configurable. Built: already supported by `venues.tier` and `benefits.allowed_venue_tiers`; the admin screens come in milestone 3.
3. **Last night of a pass.** Answer: yes, a 01:00 visit on 11 January counts as the 10th. Built: already behaves this way (tested).
4. **Per-person benefits.** Answer: yes. Built: `benefits.draw_per_person`. When it's on, a scan for a party of three draws three units, and is declined if fewer are left. The offer's daily cap still counts visits, not people.

## Not yet (later milestones)

- `POST /scan` and the QR code itself: milestones 4 and 5. `redeem()` is ready for the endpoint to call.
- Allowance resets: allowances are created for every period up front when a membership is granted, so no reset job is needed for passes. Annual plans may still want a job later.
- Offline sync and flagging (milestone 4); eSIM draw-down (milestone 8); settlements (milestone 7).
