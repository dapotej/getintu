# intu platform

intu is a lifestyle membership for affluent Nigerians and the diaspora: day-and-night access to Lagos clubs, beaches, golf, gyms, spas and nightlife, plus travel perks (airport meet-and-assist, lounges, a Nigeria travel eSIM). This repo holds the member app, the partner app (venue scanner and manager portal), the admin console and the API behind them.

## Source of truth

- `docs/SPEC.md` is the platform tech spec. Read it fully before starting any milestone. Its "Build brief for Claude Code" section is binding: locked defaults, repository layout, conventions, API surface, milestones and acceptance criteria.
- `docs/POC-SPEC.md` describes the December 2026 pilot that ran on a Google Sheet. Use it to understand the data being imported, not as a build target.
- If the spec is silent or contradicts itself, stop and ask Dapo. Do not invent product rules.

## How to work

- Build milestones in the order the spec lists them. Finish one, with CI green, before starting the next.
- End each milestone with a short demo note in `docs/milestones/<n>-<name>.md`: what was built, how to run it, what was tested, anything left open.
- Ask before changing a locked default, adding a paid service, or adding a dependency that overlaps one already chosen.
- Keep every entitlement decision in `packages/rules` and call it from the API. Apps display results; they never decide.
- Write tests alongside code. Every decline reason in the rules engine has its own test.

## Non-negotiables

- Money is integer minor units plus an ISO currency code. Never floats.
- Store timestamps in UTC; evaluate rules, resets and reports in Africa/Lagos.
- Redemption and allowance changes commit in one transaction, with an audit log row.
- Webhooks are idempotent.
- No secrets in the repo. Keep `.env.example` complete and current.
- Stripe, Paystack, Airalo and WhatsApp stay in sandbox or test mode until Dapo says otherwise.
- Seed data is marked TEST and never uses real people's details.
- Partners see member name and photo only. No health data is stored anywhere.

## Brand

Colours: ink #0D0B1A, cream #FFF5E6, day #FFB020, night #2EE6D6, pop #FF6B6B. Typeface: Plus Jakarta Sans. Logo SVGs live in `brand/`. The look is a dark "Lagos after dusk" base, amber for day benefits, teal for night benefits, coral for urgency.

## Not in scope

The marketing site at getintu.com (already live), the client portal (Phase 3), legal documents, and app store listings and submissions.
