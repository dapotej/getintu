# Milestone 3 — Admin console core

## What was built

**Staff sign-in with two-step verification and roles**
- Staff sign in with Supabase Auth (email and password), then two-step verification with an authenticator app (TOTP). The first sign-in enrols the app with a QR code; later sign-ins ask for the 6-digit code.
- The API checks every admin request itself: the Supabase token's signature against the project's published signing keys, its issuer and expiry, that two-step was completed in this session (`aal2`), and that the person is an active intu staff member. Venue staff and managers are refused here (they use the partner app).
- Roles and what they can do (`apps/api/src/auth/permissions.ts`):

  | Role | Members | Plans | Partners and venues | Team | Pilot import |
  | --- | --- | --- | --- | --- | --- |
  | Founder, ops lead | change | change | change | manage | yes |
  | Ops | change | view | view | – | – |
  | Partnerships | view | view | change | – | – |
  | Concierge, finance | view | view | view | – | – |

- Inviting someone sends a Supabase invitation email. They choose a password at `/set-password`, then enrol two-step. Removing someone's access also blocks their Supabase login.
- `pnpm --filter @intu/api create:founder -- --email … --name …` creates the first account, since nobody exists yet to send invitations.

**Managing the catalogue and members** (`apps/admin`, Next.js; `apps/api/src/admin`)
- **Plans:** details, season or duration, sales window, prices per currency (entered in pounds/dollars/naira, stored in minor units), and benefits. Each benefit sets its quantity (blank = unlimited), period, caps, Crew sharing, one-per-person draw-down and **which venue tiers it can use**.
- **Partners and venues:** partners (bank details are never shown, only whether they're on file), venues with **tier**, category, and opening hours that can run past midnight, and offers with the naira rate per visit, daily cap and dates.
- **Members:** search by name, phone, email or pass number; profile with every membership, its allowances (own and Crew-shared) and the last 50 visits in Lagos time. Add members, edit details, add a membership by hand (gift, client or paid outside checkout) which grants its allowances, and suspend or reinstate with a reason.
- Every change writes an audit row naming the staff member, with before and after values, in the same transaction.

**Pilot sheet import**
- Upload each tab of the pilot Google Sheet as CSV (Partners, Members, Allowances, Visits, Bookings), choose which plan each pilot tier becomes and how the sheet writes dates, then **dry run**. The report lists what would be created, every error and warning with its tab and line number, and what isn't imported. **Import** only unlocks after a clean dry run of those exact files.
- All or nothing: any error and nothing is written. Running it again is safe: rows already imported are recognised and skipped.
- Column names are matched loosely (case, spacing and punctuation don't matter), so small header differences in the real sheet still work; unknown columns are reported, not guessed.
- What it does with each tab:
  - **Partners:** each row becomes a partner, a venue (keeping the pilot venue ID) and an offer per benefit.
  - **Members:** each row becomes a member (matched on WhatsApp number) and a membership with the pass number, travel dates, status and Crew group; allowances are granted from the plan.
  - **Allowances:** the sheet's totals and used counts become the truth. A Crew's shared hosted night combines the group's rows.
  - **Visits:** each row becomes a redemption, approved or declined, with its Lagos time and method; pilot decline reasons are mapped where there's an equivalent.
  - **Bookings:** each row becomes a booking, linked to a venue or kept as an event name.
- Also available from the command line: `pnpm --filter @intu/api import:pilot -- --dir ./export --tier Plus=<planId> … [--commit]`.

**Shared UI** (`packages/ui`): intu brand colours as Tailwind theme tokens, Plus Jakarta Sans, form/table/card components, and money and date formatting. Amounts are formatted from minor units without passing through floats.

**Staging:** TEST data is loaded into Supabase (see `docs/ENVIRONMENTS.md`), and migrations 0006–0007 are applied. The schema fingerprint matches local exactly.

## How to run it

```sh
cp .env.example .env        # fill in the Supabase values for real sign-in
pnpm db:reset
pnpm --filter @intu/api dev        # http://localhost:8787
pnpm --filter @intu/admin dev      # http://localhost:3001
```

To sign in locally against the real Supabase project, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then run `create:founder` with your email.

## What was tested

- **API (54 tests):**
  - **Sign-in checks:** no token, wrong key, wrong issuer, expired and malformed tokens are refused; a password-only session is refused; non-staff, deactivated staff, door staff and venue managers are refused.
  - **Roles and safety:** each role's permissions hold; CORS only allows the admin origin; staff secrets never leave the API.
  - **Catalogue:** plans, prices and benefits work, with audit rows naming the staff member; bad input is refused (duplicate codes, floats for money, unknown benefit types, bad hours, inverted dates); a benefit members already hold can't be deleted. Venue tiers are tested end to end: a top-tier venue declines a plan until its benefit allows top tier, then approves.
  - **Members:** search on every field; profiles include Crew-shared allowances; duplicate and badly formatted phones are refused; a hand-added membership grants its allowances; a suspended pass is declined at the door and works again once reinstated.
  - **Team:** invitations go through Supabase; deactivating someone bans their login; you can't remove your own access.
  - **Pilot import:**
    - The CSV parser handles quotes, commas, newlines and BOMs; dates read day-first, month-first and ISO; times are read in Lagos time.
    - Naira converts to kobo without floats; WhatsApp numbers are normalised.
    - A dry run writes nothing; a full import keeps the right counts, Crew groups and history; a re-run only finds existing rows.
    - Errors give the line and block the whole commit; missing columns are named.
    - The API endpoint enforces roles; imported members carry on correctly under the rules.
- **End to end (10 Playwright tests).** These use a real browser, the real API, real Postgres, and the real built admin app.
  - First sign-in enrols two-step (wrong password and wrong code both rejected).
  - A password alone never reaches the console.
  - A non-staff account sees no data, and a concierge only sees their role's screens.
  - Find a member, then suspend and reinstate them.
  - Add a member with a gifted pass.
  - Create and price a plan, opening a benefit to top-tier venues with per-person draw-down.
  - Add a partner, plus a late-night top-tier venue with a ₦ offer.
  - Import the pilot sheet (dry run, then commit) and see the visit on the member's profile.
  - An import with errors can't be committed.
- `pnpm check` is green; the full API suite passed 4 runs in a row and the end-to-end suite passed both runs.

## Left open

1. **Real Supabase sign-in hasn't been exercised from here.** This session can't reach `supabase.co` (network policy) and has no Docker for a local Supabase stack. So the end-to-end tests fake Supabase Auth in the browser. The API still verifies the real ES256 signatures, issuer and expiry, but tokens come from a TEST key. Before relying on it, sign in once on staging: set the env values, run `create:founder` with your email, accept the invitation and enrol two-step. In Supabase, check that **Authentication → Multi-Factor → TOTP** is enabled, and set the **Site URL** and redirect URL to the admin app's address plus `/set-password`.
2. **Role permissions are my reading of the spec's "Main role" column.** In particular, finance and partnerships can see members, and concierge can't change them. Change `ROLE_PERMISSIONS` if that's wrong.
3. **Not in this milestone**, as in the spec:
   - Goodwill credits and manual allowance changes, which come with the second-person approval in milestones 6 and 7.
   - The bookings queue, concierge inbox, redemptions feed, payments, settlements and reports screens (later milestones).
   - Audit log viewing (the data is there; there's no screen yet).
4. **Pilot import against the real sheet.** It was built from the POC spec's column list. When you have the real export, do a dry run first: the report will name any columns or values it doesn't recognise.
5. **Hosting.** The admin app and API run locally and in CI. Deploying them needs the hosts from the spec's account list (Vercel for the admin app, an EU/UK host for the API).
