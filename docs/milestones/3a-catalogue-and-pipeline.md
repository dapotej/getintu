# Milestone 3a — Catalogue and partner pipeline

An addition to milestone 3, from the "Global Access Categories and Partner Database" sheet (22 Oct 2026). Decisions are in `docs/DECISIONS.md`.

## What was built

**Catalogue instead of fixed benefit types**
- A three-level catalogue: 8 categories, 55 subcategories, 90 service types (`packages/db/src/taxonomy.ts`), seeded in every environment.
- Plan benefits point at any level and cover everything below it (Beach Clubs covers Entry only, Entry + F&B credit and Cabana). Each venue offer is exactly one service type. When several benefits cover an offer, the most specific one is used (`benefitFor` in `packages/rules`). Night benefits are anything under Nightlife & Social.
- **Catalogue** screen in the console: expand the tree, rename, hide from members, turn off (not while something under it is still on), and add a category, subcategory or service type. Codes are generated. Every change is audited.
- Migrations 0008–0010 move existing data across with no loss: every benefit, offer and redemption is mapped, and each moved redemption gets an audit row.

**Partner pipeline**
- Partners carry the deal: status (to identify → live, paused, declined), priority, category, proposed offer, how it's offered (included, included or add-on, add-on, member privilege), cost and retail, a placeholder flag, next action and notes. Markup is worked out, never typed.
- Offers carry retail price, how they're offered and the placeholder flag alongside the cost.
- **Partners and venues** is now a pipeline table with status filters. A partner page shows the deal, business details and venues.
- **Import pipeline**: paste the "Lagos Partner Pipeline" tab as CSV, dry run, then import. Matches existing partners by trading name, all or nothing, and reports created, updated and unchanged.

## How to run it

`pnpm db:migrate && pnpm db:seed`, then the API and console as in milestone 3. The click-through demo is rebuilt with `pnpm --filter @intu/admin demo`; it includes the real pipeline tab only if `apps/admin/demo/pipeline.local.csv` exists (gitignored).

## What was tested

- Rules: `covers`, `benefitFor`, most-specific benefit wins, caps per matched benefit.
- API: categories routes (codes, services can't have children, can't turn off a parent with active children, audit), offers must be a service type, partner pipeline fields, pipeline import (dry run, credits warning, Doctor on call alias, re-import is unchanged).
- Seed: the SQL seed matches the TypeScript seed by category code; the catalogue in the database matches `taxonomy.ts`.
- End to end: catalogue editing, pipeline import and updating a deal.
- The real pipeline tab dry-runs cleanly: 26 partners, warnings only for the credits rows.

## Left open

- The real pipeline is not loaded into staging yet.
- "Body scrub" appears twice (Spa & Massage and Body Treatments), as in the sheet.
- Packages and destinations from the sheet are deferred.
