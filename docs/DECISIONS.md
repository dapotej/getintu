# Product decisions

Rules Dapo has settled where the spec was silent or ambiguous. The code follows these; change them here first.

| Date | Question | Decision | Where it lives |
| --- | --- | --- | --- |
| 21 Oct 2026 | "Yes" benefits (guest list, priority dining) | Scanned and logged at the door like any benefit. Each plan sets an allowance for them; unlimited is allowed (quantity left empty). | `benefits.quantity` (null = unlimited) |
| 21 Oct 2026 | "One per day per benefit" cap | Per venue: one use of a benefit per venue per day. The same benefit at a different venue the same day is fine. Matches the pilot rule. | `evaluate()` check 5, `VENUE_DAILY_LIMIT` |
| 21 Oct 2026 | Visits after midnight | Count against the night they started: 01:30 Sunday inside a window that opened Saturday is Saturday. Used for daily caps, offer dates and membership dates. | `serviceDate()` |
| 21 Oct 2026 | Crew shared perks | One allowance for the whole group, redeemable by any member, with party size recorded. Applies to the hosted night and to arrival meet-and-assist. | `benefits.shared_by_group`, `allowances.group_id` |
| 21 Oct 2026 | Re-scan within 10 minutes | Staff are told the visit has already been claimed and at what time. This check runs before the allowance and caps checks so it isn't masked by them. | `evaluate()`, `DUPLICATE_SCAN` with `claimedAt` |
| 21 Oct 2026 | Top-tier venues | Configurable in the back end: each venue has a tier, and each plan benefit lists the tiers it may use. Admin screens for both come in milestone 3. | `venues.tier`, `benefits.allowed_venue_tiers` |
| 21 Oct 2026 | Last night of a pass | A pass ending 10 January still works at a club at 01:00 on 11 January (the night it started). | `serviceDate()` |
| 21 Oct 2026 | One unit per person | Some benefits draw one unit per person in the party; others one per visit. Set per benefit. | `benefits.draw_per_person` |
| 22 Oct 2026 | Benefit types | Replaced by an editable catalogue: categories → subcategories → service types, seeded from the "Category Taxonomy" tab. A plan benefit can sit at any level and covers everything under it; each venue offer delivers exactly one service type. Admins rename, hide, turn off and add entries in the console. | `categories`, `packages/db/src/taxonomy.ts`, `covers()` / `benefitFor()` |
| 22 Oct 2026 | Credits | No credits. intu does not run a credit wallet. Pipeline rows marked "Credits" import as "Included in the pass", with a warning so someone can check them. | `offer_model` enum, `src/import/pipeline.ts` |
| 22 Oct 2026 | Markup | Not entered. Worked out from cost and retail wherever both exist. | `markup()` in the console |
| 22 Oct 2026 | Healthcare | The product is "Doctor on call" (C08-S02). "Doctor home visit" (C08-S03-T01) is a separate product. The pipeline's "Healthcare Assistance" label maps to Doctor on call. No health data is stored. | `taxonomy.ts`, `RENAMED` in `pipeline.ts` |
| 22 Oct 2026 | Costs | Placeholder prices until real rates are agreed: ₦25,000 cost where the sheet has none, retail at cost × 1.5 where missing, and a "placeholder" flag shown beside them. | `PLACEHOLDER_COST_MINOR`, `prices_are_placeholders` |
| 22 Oct 2026 | Names | "intu" and "December Pass" stay. "Global Access" and "December Explore" are not used. | — |
| 22 Oct 2026 | December Pass gaps in the taxonomy | Added so existing benefits have a home: C01-S01-T03 Departure lounge visit, C04-S01-T02 Hotel pool and gym day pass, C04-S08 Golf with C04-S08-T01 Golf round or lesson, C06-S01-T03 Guest list and priority entry. 24-hour chauffeur moved to C01-S03-T04 (the sheet had a wrong ID). | `taxonomy.ts` (`added: true`) |
