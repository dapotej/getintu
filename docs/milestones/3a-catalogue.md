# Milestone 3a — Catalogue, offer pricing and partner pages

An addition to milestone 3, from the "Global Access Categories and Partner Database" sheet (22 Oct 2026). Decisions are in `docs/DECISIONS.md`.

## What was built

**Catalogue instead of fixed benefit types**
- A three-level catalogue: 8 categories, 55 subcategories, 90 service types (`packages/db/src/taxonomy.ts`), seeded in every environment.
- Plan benefits point at any level and cover everything below it (Beach Clubs covers Entry only, Entry + F&B credit and Cabana). Each venue offer is exactly one service type. When several benefits cover an offer, the most specific one is used (`benefitFor` in `packages/rules`). Night benefits are anything under Nightlife & Social.
- **Catalogue** screen in the console: expand the tree, rename, hide from members, turn off (not while something under it is still on), and add a category, subcategory or service type. Codes are generated. Every change is audited.
- Migrations 0008–0010 move existing data across with no loss: every benefit, offer and redemption is mapped, and each moved redemption gets an audit row.

**Offer pricing**
- Each offer has a cost (what intu pays per use), an optional retail price, how it's offered (included, included or add-on, add-on, member privilege) and a placeholder flag. Markup is worked out, never typed.

**Partners and their venues**
- **Partners** lists the businesses intu works with, their contact and their venues.
- A partner's page shows its venues and business details, and is where venues are added.
- A venue's page sits under its partner (`/partners/:id/venues/:venueId`) and holds its hours, tier and offers.
- Deal tracking from the sheet's pipeline tab is not part of the platform (migration 0011 removes the columns briefly added for it).

## How to run it

`pnpm db:migrate && pnpm db:seed`, then the API and console as in milestone 3. The click-through demo is rebuilt with `pnpm --filter @intu/admin demo`.

## What was tested

- Rules: `covers`, `benefitFor`, most-specific benefit wins, caps per matched benefit.
- API: categories routes (codes, services can't have children, can't turn off a parent with active children, audit), offers must be a service type, a partner returns its venues, a venue returns its partner.
- Seed: the SQL seed matches the TypeScript seed by category code; the catalogue in the database matches `taxonomy.ts`.
- End to end: catalogue editing; adding a partner, then a venue from the partner's page, then a priced offer, and finding the venue back under the partner.

## Left open

- "Body scrub" appears twice (Spa & Massage and Body Treatments), as in the sheet.
- Packages and destinations from the sheet are deferred.

## Added: plan cost and margin

- Each plan's page has a **Cost and margin** panel: one row per benefit (uses, cost per use and where it came from, cost if fully used, expected use, expected cost), the fixed costs per member, totals, and the margin at each price in naira, at expected use and if every allowance is used. Placeholder prices and unpriced benefits are flagged.
- The benefit editor sets how it's paid (per use or flat fee per member), an optional planning cost and the expected use. The plan's details set its fixed costs per member.
- **Exchange rates for margins** on the Plans page: naira per £1 and per $1, used only for the margin.
- The calculation is `costPlan()` in `packages/rules`, with its own tests; the API returns it with each plan. Migration 0012 adds the fields and the `fx_rates` table.
- TEST data: ₦30,000 fixed costs per member, planning costs for meet-and-assist (₦100,000, always used) and the departure lounge (₦35,000), and rates of ₦1,770/£ and ₦1,400/$.

## Added: venue kinds from the catalogue, and fresh TEST data

- A venue's "kind of place" is now picked from the catalogue (categories and subcategories only); the old fixed list is gone (migrations 0013–0014 map existing venues from their first offer). The pilot import does the same.
- TEST data rebuilt around the December Pass in `docs/CONCEPT.md`:
  - Plans: Essential, Plus and Crew (4 people), with the concept's benefits, prices, ₦42,000 fixed costs per member, arrival services at 100% expected use, and doctor on call as a flat ₦9,000 per member. WhatsApp concierge sits in the fixed costs; event presales have no catalogue entry yet.
  - Partners and venues: airport protocol, departure lounge, airport transfers, two beach clubs, two hotel pool and gym venues, golf, spa, a members' club, two nightclubs and two restaurants, plus a doctor-on-call partner with no venue. All names fictional and marked TEST.
  - Offers: placeholder costs from the concept's wholesale estimates (e.g. beach entry ₦15,000–₦22,000, golf ₦40,000, spa ₦45,000–₦60,000); guest list and reservations are free.
- `packages/db/sql/reset-test-data.sql` removes every TEST row (partners, venues, offers, plans, members, passes, allowances, visits) so the seed can load the current set. A test checks reset then reseed gives the same data.
