# Product decisions

Rules Dapo has settled where the spec was silent or ambiguous. The code follows these; change them here first.

| Date | Question | Decision | Where it lives |
| --- | --- | --- | --- |
| 21 Oct 2026 | "Yes" benefits (guest list, priority dining) | Scanned and logged at the door like any benefit. Each plan sets an allowance for them; unlimited is allowed (quantity left empty). | `benefits.quantity` (null = unlimited) |
| 21 Oct 2026 | "One per day per benefit" cap | Per venue: one use of a benefit per venue per day. The same benefit at a different venue the same day is fine. Matches the pilot rule. | `evaluate()` check 5, `VENUE_DAILY_LIMIT` |
| 21 Oct 2026 | Visits after midnight | Count against the night they started: 01:30 Sunday inside a window that opened Saturday is Saturday. Used for daily caps, offer dates and membership dates. | `serviceDate()` |
| 21 Oct 2026 | Crew shared perks | One allowance for the whole group, redeemable by any member, with party size recorded. Applies to the hosted night and to arrival meet-and-assist. | `benefits.shared_by_group`, `allowances.group_id` |
