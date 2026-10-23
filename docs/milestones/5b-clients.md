# Clients in the console (before milestone 6)

Built ahead of payments at Dapo's request (23 Oct 2026). This is the spec's console **Clients** screen, run by intu's team. The client portal, where clients sign in themselves, is still Phase 3 and not built.

## What was built

- **Clients** in the console (banks and fintechs first; employers and promoters can be recorded too): name, kind, contract reference and dates, seats in the contract, contacts, billing email, notes, TEST flag.
- **People and passes.** Each pass a client pays for is a seat on a plan with dates. Three ways to fill them:
  - **Add a person**: name, phone, email, the client's customer reference, plan and dates.
  - **Upload a list** (CSV with name and phone, optionally email and customer reference): checked first, with each problem shown by line, then everyone is added together. Nothing is added while the list has errors or goes over the contract's seats.
  - **Passes without names**: set up a number of passes now and **Give out** each later.
  Someone already with intu is found by phone and keeps their account; a person can hold only one pass per client. Passes start today (or the contract's start, if later) and run to the contract's end, else the plan's season.
- **Removing someone** (with a reason) ends their pass that day, or cancels it if it hadn't started; the scanner declines it from then on and the seat is free for someone else.
- **Usage** as totals only: passes given out and waiting, visits this month and in all, people who visited this month, and visits by service. The client never sees an individual's visits (spec: Privacy).
- **Invoices** recorded by hand: number, issue and due dates, amount and currency (integer minor units), then marked paid or void.
- A client's passes show "Paid by <client>" on the member's page.
- Permissions: ops and partnerships manage clients and their people; finance and partnerships keep invoices; founder and ops lead do everything; the concierge doesn't see clients.

**Database:** migration 0021 adds client kinds, contract and contact fields to `client_accounts`, and the `client_seats` and `client_invoices` tables. The TEST reset clears TEST clients.

## How to run it

Console → **Clients** → **Add client** (tick "TEST client" on staging) → add people on the client's page.

## What was tested

- API: adding one person (pass paid by the client, allowances granted, shown on the member page, no second pass for the same person); passes without names, the contract's seat limit, giving out, deleting an unused pass; removing someone (pass ends that day, the scanner declines, audited with the reason, seat given to someone new); the list upload (errors by line, duplicates, existing members, missing columns, nothing added until clean, re-upload finds people already holding passes); usage totals; invoices (finance only, unique numbers, whole minor units, marked paid); the concierge can't see clients.
- Console end to end: a bank client from start to finish: add a person, passes without names, give one out, remove someone, upload a list, record and pay an invoice.

## Left open

- **Client portal** (Phase 3): clients signing in, the bank enrolment API, monthly usage and billing files, their branding on the pass.
- **Generated invoices**: amounts are typed in; working them out per seat, and sending them, comes with payments or later.
- Seats are counted against the contract all at once; per-period seat counts (e.g. monthly billing by active seats) aren't tracked yet.
