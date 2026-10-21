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
