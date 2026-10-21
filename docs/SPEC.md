# intu — Platform Tech Spec (member, partner and admin apps)

Oct 21, 2026 · @Dapo Tejuoso

> Exported from the Claude Doc at https://claude.ai/artifact/QoQZ5p4aj6EQTUwVzNF4LB (revision 24). The doc is the living version; two embedded diagrams (architecture, roadmap) are not reproduced here.

## Summary

The intu platform is one backend serving three products at launch: a member app, a partner app and an admin console. A client portal for corporate and bank buyers follows once there is demand. The target is resident annual membership live in Lagos by the end of Q2 2027, with the December 2027 pass sold through the app.

The design rule is that every product reads and writes the same entitlements ledger: who is allowed what, how much is left and what has been used. Partner payouts, member allowances and reports all come from it, so it is the part to build first and get right.

This spec assumes the December 2026 pilot passes its 31 January gate (see the [POC tech spec](https://claude.ai/artifact/WkkQSpGb9PHjr1TJ1o88Dc)). Pilot data on benefit use, scan problems and concierge load should adjust the scope below before the build starts.

## Products

Four products, built in this order. The partner app is one web app with two roles, so door staff never need an app store.

| Product | Users | Form | Core job | Release |
| --- | --- | --- | --- | --- |
| Member app | Pass holders and annual members | iOS and Android app | Show the live pass, track allowances, find venues, book, chat to the concierge, renew | Phase 1 |
| Partner app: scanner | Venue door and front-desk staff | Web app on the venue phone | Scan, check photo, record the visit, in under 10 seconds | Phase 1 |
| Partner app: portal | Venue managers | Same web app, manager login | Visit history, statements, payouts, staff logins, offers | Phase 1 (basic), Phase 2 (full) |
| Admin console | intu ops, concierge, finance | Web app | Run members, venues, benefits, bookings, payments, payouts and reports | Phase 1 |
| Client portal | Companies, banks, promoters buying for others | Web app | Buy and manage memberships in bulk, see usage | Phase 3, if demand |

The marketing site at getintu.com stays separate from the apps. It sells, then hands buyers into the app to finish sign-up.

## Architecture

[embedded content: platform architecture · four products, one API]

No app talks to the database or to a payment provider directly. Every scan, booking and payment goes through the API, so the rules engine is the only place that decides what a member may use.

## Data model

A membership links a person to a plan for a period; the plan's benefits create allowances; every redemption draws down one allowance at one venue. The pilot sheet's tabs map one-to-one onto these records.

| Record | What it is | Key fields | Links to |
| --- | --- | --- | --- |
| Member | A person | Name, phone (login), email, photo, country, consent flags | Memberships, bookings, devices |
| Plan | A product sold | Name (December Pass Plus, Gold…), price per currency, duration, active dates | Benefits |
| Benefit | One perk within a plan | Type (beach, gym, golf, spa, hosted night, lounge, eSIM data…), quantity, period (per pass, per month, per year), caps (once per venue per month), venue tier allowed | Plan, venue categories |
| Membership | A member on a plan for a period | Start, end, status, payment source (direct, client, gift), group ID for Crew | Member, plan, allowances, client account |
| Allowance | Remaining quantity of a benefit for one membership period | Benefit, granted, used, resets at | Membership, redemptions |
| Partner | A business | Legal name, contacts, contract, bank details (encrypted), settlement terms | Venues, partner users |
| Venue | A place a member can visit | Name, area, city, category, opening hours, capacity rules, photos | Partner, offers, redemptions |
| Offer | What a venue gives for a benefit | Benefit type, rate paid by intu (₦), days and times valid, daily cap | Venue, benefit |
| Redemption | One use at the door | Time, member, venue, offer, allowance, staff user, result, reason, method (online, offline, manual) | Allowance, venue, settlement |
| Booking | A reservation made in advance | Venue or event, date, party size, status, allowance held | Member, venue, redemption |
| Settlement | What intu owes a partner for a period | Period, lines (redemptions), total, status, paid date, reference | Partner, payout |
| Client account | A company or bank buying for others | Name, contract, seats, billing | Memberships |
| Staff user | Anyone logging into partner app or admin | Role, venue(s), permissions, 2FA | Redemptions, audit log |

**eSIM order** is one more record: membership, provider order ID, plan (data and days), ICCID, install status, activated at, data used, cost to intu (USD). It links to the allowance it draws down, like a redemption.

Every change to memberships, allowances, redemptions and settlements is also written to an append-only audit log, so any figure on a statement can be traced to the scans behind it.

## Entitlements and redemption

One server-side rules engine answers a single question for every scan and booking: may this member use this offer at this venue right now? Apps never decide this themselves.

**Checks, in order** (the first failure is the reason shown to staff)

1. Membership is active and today is inside its dates.
2. The venue is active and open, and the offer is valid today and at this time.
3. The plan includes the benefit, and the venue's tier is allowed for this tier (for example, top-tier venues for Black only).
4. The member has allowance remaining for the current period.
5. Caps pass: once per venue per month, one per day per benefit, the venue's daily cap.
6. No identical redemption in the last 10 minutes (stops double scans).

**Online scan flow**

1. The member app shows a QR code that changes every 30 seconds, next to the member's photo. The code is signed with a key tied to the member's device, so a screenshot stops working within a minute.
2. The partner app scans it and sends the code, venue and offer to the server.
3. The server checks the signature and time, runs the rules, writes the redemption and draws down the allowance in one transaction.
4. Staff see Approved or Declined with the reason, the photo and name. The member gets a push notification with the remaining balance.

**Offline scan flow** (for venues with patchy signal)

1. The partner app holds the server's public key and a list of revoked passes refreshed every 15 minutes.
2. It checks the QR signature and time locally, applies the cached rules, and stores the redemption on the device.
3. Offline approvals are limited to one per member per venue per day, and are marked as such.
4. Stored redemptions upload when signal returns; any that break a rule are flagged to ops rather than reversed at the door.

**Allowance periods** reset by the plan's rule: per pass (December Pass), per calendar month, or per membership year. Unused allowances don't roll over.

**Digital benefits** are fulfilled by the system, not at a door. The travel eSIM is ordered from the provider automatically 7 days before the member's arrival date (or at purchase if arrival is sooner), shown in the app to install, and counts as used once installed. Top-ups are sold separately and never draw on an allowance.

## Member app

The first release does five things well: get in, see what's left, find somewhere to go, book it, and reach a person. Everything else waits for usage data.

| Area | Phase 1 | Later |
| --- | --- | --- |
| Sign-up and login | Phone number with a one-time code by WhatsApp or SMS; photo capture with a liveness check; buy a plan in GBP, USD or NGN | Gift a pass; family and Crew accounts with their own logins |
| Pass | Live rotating QR with photo; works offline for 24 hours; Apple and Google Wallet copy as backup | Tap-to-validate with NFC |
| Allowances | Remaining balance per benefit, reset date, history of visits | Upgrade mid-term; buy top-ups |
| Discover | Venues by day and night, area and benefit; map; opening hours; photos | Personalised picks; what's on this week |
| Book | Request a booking for venues and hosted nights; confirmation and reminders | Instant booking where venues share availability; event presales and ticketing |
| Concierge | WhatsApp hand-off from the app, with membership details attached | In-app chat with the same inbox |
| Travel | Airport meet-and-assist request with flight number; departure lounge access; Nigeria travel eSIM with one-tap install and data remaining | Flight tracking for pick-ups; paid eSIM top-ups; eSIMs for onward trips |
| Doctor on call | One button that opens the medical partner's line | |
| Account | Membership, renewal, receipts, notification settings, delete account | Referral rewards |

The app supports English only at launch, prices in the member's paying currency, and times in Lagos time.

## Partner app

One installable web app with two roles. Door staff get a single scan screen; managers also see the business side.

**Scanner (door staff)**

- Log in with a venue code and personal PIN; stay signed in for the shift on the venue's device
- Full-screen camera scanner; result in large type with the member's photo, name, benefit and party size
- Manual entry of a 6-digit backup code when the camera fails
- Works offline as described in Entitlements and redemption, with a visible offline banner
- Today's list: bookings expected, visits recorded, declines with reasons
- Report a problem with a visit (wrong person, behaviour, dispute) straight to intu ops

**Portal (venue managers)**

| Area | Phase 1 | Phase 2 |
| --- | --- | --- |
| Visits | Daily and monthly visits by benefit, export to CSV | Busiest times, repeat members |
| Money | Monthly statements, payout status and history | Dispute a line in the app |
| Staff | Add and remove staff, reset PINs | Per-staff activity |
| Venue | Edit hours, photos, description | Set daily caps, blackout dates, live availability for instant booking |
| Bookings | See and confirm booking requests | Accept and decline in-app with messages |
| Offers | View agreed offers | Propose new offers and member-only events |

Partners never see a member's phone or email, only name, photo and the visit details.

## Admin console

The console replaces the pilot sheet. Each team role sees only what it needs, and every change is logged.

| Area | What the intu team can do | Main role |
| --- | --- | --- |
| Members | Search, view memberships and allowances, suspend or reinstate, issue goodwill credits, resend pass, reissue or refund an eSIM | Ops, concierge |
| Plans and benefits | Create plans, set prices per currency, define benefits, periods and caps, schedule sales windows (December Pass) | Founder, ops lead |
| Partners and venues | Onboard partners, add venues and offers, set rates, upload contracts, manage partner logins | Partnerships |
| Bookings | Queue of booking requests, assign to a concierge, confirm with the venue, track status | Concierge |
| Concierge inbox | Shared WhatsApp inbox with each member's profile and allowances beside the chat | Concierge |
| Redemptions | Live feed of scans, declines by reason, offline flags to review, disputes | Ops |
| Settlements and payouts | Generate monthly statements, approve, send naira payouts, record references | Finance |
| Payments | Orders, refunds, failed renewals, currency totals | Finance |
| Clients | Client accounts, seats, invoices (once the client portal exists) | Partnerships |
| Reports | Sales, active members, benefit use against forecast, cost per member, venue performance | Founder |
| Settings | Team users and roles, two-step login, audit log, notification templates | Ops lead |

Refunds, payouts and manual allowance changes above a set amount need a second person to approve.

## Client portal

Build the client portal only once a paying client signs. Until then, the admin console can set up client memberships by hand, because the data model already supports a membership paid for by a client account.

| Client type | What they buy | What the portal needs |
| --- | --- | --- |
| Employers | Memberships as a perk for senior staff or visiting executives | Add and remove staff by email, seat count, invoices, usage summary (no personal visit detail) |
| Banks and fintechs | intu bundled into a premium account or card, as banks do with Priority Pass | API to enrol and remove customers, monthly usage and billing files, their branding on the pass |
| Event promoters and hotels | Bulk December Passes for guests and artists | Buy a batch of pass codes, assign names, see redemption rate |

The bank model is the largest opportunity and the hardest: it needs the enrolment API, uptime commitments and the bank's security review. Plan for it in Phase 3 rather than designing the first release around it.

## Integrations

intu builds the ledger, the rules and the apps, and buys everything else. Each integration sits behind its own module in the backend, so a provider can be swapped without touching the apps.

| Need | Provider options | How it's used |
| --- | --- | --- |
| Card payments in GBP and USD | Stripe | Checkout, subscriptions for annual plans, refunds, webhooks to activate memberships |
| Payments in naira | Paystack or Flutterwave | Card, bank transfer and USSD for residents |
| Payouts to venues in naira | Paystack or Flutterwave transfers | Pay approved settlements to partners' Nigerian bank accounts |
| Travel eSIM | [Airalo Partner API](https://partners.airalo.com/solutions/integrations) (REST, sandbox, Node SDK, 200+ destinations), or eSIM Go | Order a Nigeria data eSIM per member, return the install QR and code, track usage, sell top-ups |
| Login codes | WhatsApp Business Platform, with SMS fallback (Twilio or Termii) | One-time codes and transactional messages |
| Concierge chat | WhatsApp Business Platform through a shared-inbox provider | Inbox embedded in the admin console |
| Wallet backup pass | Apple Wallet and Google Wallet APIs, or PassKit | Backup pass that updates when the membership changes |
| Photo and liveness check | An identity check SDK (for example Smile ID, which covers Nigeria) | Confirms the photo is a real, live face at sign-up |
| Doctor on call | Medical partner's phone, video or app link | Deep link only; no health data stored by intu |
| Push and email | Expo push notifications; Postmark or SendGrid for email | Visit receipts, booking confirmations, renewal reminders |
| Maps | Google Maps Platform | Venue map and directions |
| Analytics and errors | PostHog or Mixpanel; Sentry | Product analytics and crash reporting |

For scale on eSIM cost: Airalo's retail Nigeria plans run from $7.50 for 1 GB over 3 days to $30 for 5 GB over 30 days ([eSIMDB](https://esimdb.com/nigeria/airalo)). Partner prices are lower and need quoting. Plans are data-only, with no Nigerian phone number.

## Security, privacy and compliance

intu holds UK and Nigerian members' personal data, takes payments and pays businesses, so UK GDPR and the Nigeria Data Protection Act 2023 both apply. Have both reviewed by a lawyer before launch; the points below are the technical baseline.

**Data protection**

- Collect only name, phone, email, photo, country and dates. No ID document numbers, and no health data: the medical partner holds that.
- Show partners name and photo only. Show client accounts usage totals, never individual visits, unless the member agrees.
- Members can download and delete their data in the app; deletion keeps anonymised redemption records for settlements.
- Delete photos and personal details 12 months after a membership ends, unless renewed.
- Publish a privacy notice and keep a record of processing; check whether intu must register with the Nigeria Data Protection Commission and appoint a data protection officer.

**Security**

- Encrypt data in transit and at rest; partner bank details encrypted at field level.
- Card details never touch intu's servers: Stripe and Paystack handle them.
- Two-step login for every admin and partner manager account; role-based permissions; audit log on all changes.
- QR signing keys rotated on a schedule and revocable per device.
- Rate limits on login codes and scans; alerts on unusual scan patterns.
- A penetration test before launch, and before any bank client goes live.

**Payments and money**

- Taking payments through Stripe and Paystack, and paying venues for services, should not need a payments licence. Confirm this with a lawyer for both the UK and Nigeria, especially before holding any member credit or wallet balance.

## Non-functional requirements

The door scan is the moment that makes or breaks intu in front of the member's friends, so most of these targets protect it.

| Requirement | Target |
| --- | --- |
| Scan to result, online | Under 2 seconds on a mid-range Android phone on 3G |
| Scan to result, offline | Under 1 second |
| Scan availability | 99.9% during 10:00–04:00 Lagos time; offline mode covers the rest |
| Member app start to visible pass | Under 3 seconds, including with no signal |
| Devices | Android 9 and later, iOS 16 and later; partner app in current Chrome and Safari |
| Data use | Member app under 5 MB per week of normal use; images compressed for Nigerian networks |
| Scale for 2027 | 5,000 members, 100 venues, 1,000 scans an hour at December peak |
| Currencies | Prices in GBP, USD and NGN; settlements and payouts in NGN; reports in GBP with the rate used |
| Time zone | All rules and resets run on Lagos time (WAT) |
| Backups | Daily database backups kept 30 days; point-in-time restore |
| Accessibility | Member app meets WCAG 2.1 AA for contrast, text size and screen readers |

## Tech stack and hosting

One language (TypeScript) across every product, and managed services wherever possible, so a small team or a single agency can build and run it.

| Layer | Choice | Why |
| --- | --- | --- |
| Member app | React Native with Expo | One codebase for iOS and Android; over-the-air updates for fixes |
| Partner app | Next.js progressive web app, installable, with offline storage | No app store for venue staff; works on any phone |
| Admin console and client portal | Next.js, sharing components with the partner app | One web codebase, role-based screens |
| Backend API | TypeScript (NestJS or tRPC on Node) | Shared types with the apps; rules engine in one place |
| Database | PostgreSQL (Supabase or a managed Postgres) | Transactions for redemptions; mature tooling |
| Auth | Supabase Auth or Clerk with phone login | One-time codes, roles, two-step login for staff |
| File storage | Supabase Storage or S3, behind signed links | Member photos, venue images, contracts |
| Background jobs | A queue for allowance resets, settlements, payouts, reminders | Runs on schedule in Lagos time |
| Hosting | Vercel for the web apps; the backend and database in an EU or UK region | Closest major region with good latency to both London and Lagos |
| Monitoring | Sentry, uptime checks on the scan endpoint, logs | Alerts the on-call person before venues notice |

The pilot sheet's data imports into Postgres with a one-off script, so pilot members keep their history.

## Roadmap

[embedded content: roadmap · pilot and three phases, three gates]

Phase 1 starts the week after the 31 January decision, so agency quotes should be in hand by mid-January. If the pilot misses its gate, the December 2027 pass can run again on the pilot tools while the offer is reworked.

## Team, build approach and open questions

Recommended: one agency or a small contract team for Phase 1, with intu owning product, the code repository and the cloud accounts from day one. Hire a senior engineer in-house once members are paying, so knowledge of the ledger stays in the company.

**Phase 1 team (estimate)**

| Role | Who | Time |
| --- | --- | --- |
| Product owner | Dapo | Part-time throughout |
| Product designer | Contract | Weeks 1–6, then light |
| Tech lead and backend engineer | Agency or contract | Full-time |
| Mobile engineer (React Native) | Agency or contract | Full-time |
| Web engineer (partner app and admin) | Agency or contract | Full-time |
| QA and release | Part-time, including real venue testing in Lagos | From week 8 |

A team like this typically needs four to five months for Phase 1. Ask three agencies to quote Phase 1 against this spec, with the POC data attached, before committing.

**How to brief an agency**

1. Share this spec, the POC spec and pilot results.
2. Ask for a fixed-scope quote for Phase 1 and a day rate for later changes.
3. Require weekly demos on real phones, a staging environment, and code in intu's own repository.
4. Make the redemption flow (scan, rules, offline) the first thing built and tested at a real venue.

**Open questions**

- [ ] Confirm or change the locked defaults in the build brief before the build starts
- [ ] Airalo or eSIM Go: compare partner prices for a Nigeria 5 GB, 30-day plan, and decide which tiers include an eSIM
- [ ] Which identity check provider, and is liveness needed at launch or only for annual tiers?
- [ ] In-house hire timing: before or after Phase 1 launch?
- [ ] Does the December 2027 pass sell only in the app, or on the website too?
- [ ] Legal review of payments licensing and data protection registration in the UK and Nigeria

## Build brief for Claude Code

This section turns the spec into instructions a coding agent can follow without guessing. Where earlier sections offer options, the defaults below apply unless Dapo changes them before the build starts.

**Locked defaults**

| Area | Default |
| --- | --- |
| Repository | One monorepo, pnpm workspaces and Turborepo, TypeScript in strict mode everywhere |
| API | Hono on Node, deployed to an EU or UK region; Drizzle ORM; Zod for every request and response |
| Database, auth, files | Supabase: Postgres, phone-number auth, storage with signed URLs |
| Member app | Expo (React Native) with Expo Router |
| Partner app and admin console | Two Next.js apps (App Router), Tailwind, sharing a UI package |
| Payments | Stripe for GBP and USD; Paystack for NGN and for naira payouts |
| eSIM | Airalo Partner API, sandbox first |
| Messages | WhatsApp Business Platform for codes and concierge; Termii for SMS fallback; Postmark for email; Expo push |
| Tests | Vitest for logic, Playwright for web flows, Maestro for the member app |
| Brand | Colours ink #0D0B1A, cream #FFF5E6, day #FFB020, night #2EE6D6, pop #FF6B6B; Plus Jakarta Sans; logo SVGs from the intu brand kit |

**Repository layout**

```
intu/
  apps/
    api/        Hono API: rules engine calls, webhooks, scheduled jobs
    member/     Expo app for iOS and Android
    partner/    Next.js installable web app: scanner and manager portal
    admin/      Next.js admin console
  packages/
    db/         Drizzle schema, migrations, seed data
    rules/      Entitlement rules as pure functions, fully unit-tested
    qr/         Rotating QR signing and verification, shared by api, member, partner
    ui/         Shared web components and intu brand tokens
    config/     TypeScript, ESLint and Tailwind presets
```

**Conventions the code must follow**

- Money is stored as whole minor units (pence, cents, kobo) with an ISO currency code, never as floats.
- Timestamps are stored in UTC; every rule, reset and report runs on Africa/Lagos time.
- Every table uses UUID keys, created and updated timestamps, and soft deletes where records are referenced by money.
- All entitlement decisions happen in the API using `packages/rules`; apps only display results.
- Every write to memberships, allowances, redemptions, eSIM orders and settlements also writes an audit log row in the same transaction.
- Webhooks are idempotent: the same event received twice changes nothing the second time.
- Secrets live in environment variables; the repo has a complete `.env.example` and never a real key.
- Third-party services run in sandbox or test mode until Dapo says otherwise.
- Seed data is clearly marked TEST and never uses real people's details.

**Core API surface**

| Group | Endpoints |
| --- | --- |
| Auth | `POST /auth/code` (send code), `POST /auth/verify` |
| Member | `GET /me`, `GET /me/memberships`, `GET /me/allowances`, `GET /me/visits`, `POST /me/devices` (register the device key for QR signing), `DELETE /me` |
| Discover and book | `GET /venues`, `GET /venues/:id`, `POST /bookings`, `GET /bookings` |
| Checkout | `POST /checkout` (plan, currency) returns a Stripe or Paystack session |
| eSIM | `GET /me/esim` (install code, data left), `POST /me/esim/topup` |
| Partner | `POST /scan`, `POST /scan/sync` (offline batch), `GET /revocations`, `GET /partner/visits`, `GET /partner/statements`, `POST /partner/staff` |
| Admin | CRUD for members, plans, benefits, partners, venues, offers; `POST /admin/settlements/run`, `POST /admin/settlements/:id/approve`, `POST /admin/settlements/:id/pay`; `GET /admin/redemptions`; `GET /admin/esim-orders` |
| Webhooks | `POST /webhooks/stripe`, `POST /webhooks/paystack`, `POST /webhooks/airalo` |

**Milestones and acceptance criteria** (build in this order; each ends with CI green and a short demo note)

1. **Foundations.** Monorepo, CI running lint, type checks and tests, dev and staging environments, seed data with TEST venues and members.
2. **Ledger and rules.** Full schema and migrations; `packages/rules` covers every check in Entitlements and redemption, with a test for each decline reason; a redemption and its allowance change commit in one transaction; two simultaneous scans of the same code produce exactly one redemption.
3. **Admin console core.** Staff login with two-step verification and roles; manage plans, benefits, partners, venues, offers and members; import the pilot sheet from CSV.
4. **Partner scanner.** Installable web app; staff PIN login; scan result in under 2 seconds on throttled 3G; offline mode verifies signed codes and the revocation list, stores visits and syncs them later, flagging rule breaks to admin; Playwright tests for online, offline and sync.
5. **Member app.** Phone-code login; photo capture; rotating QR every 30 seconds beside the photo, readable with no signal for 24 hours; allowances and history; venue list and map; booking requests; WhatsApp hand-off; doctor-on-call button.
6. **Payments.** Stripe and Paystack checkout; webhooks activate memberships and create allowances; refunds from admin with a second approver above a set amount.
7. **Settlements and payouts.** Monthly statements per partner from redemptions; second-person approval; Paystack transfers; statements visible in the partner portal.
8. **eSIM and notifications.** Airalo sandbox order 7 days before arrival; install screen with QR and manual code; data used shown in the app; top-up purchase; push and email templates for visits, bookings, eSIM and renewals.
9. **Hardening.** Sentry, rate limits on codes and scans, load test of 1,000 scans an hour, data export and account deletion, fixes from the penetration test.

**Accounts Dapo creates before the build** (the agent cannot): GitHub organisation, Supabase, Vercel, a host for the API, Stripe, Paystack, Airalo Partners, Apple Developer, Google Play Console, Expo, Meta WhatsApp Business, Termii, Postmark, Sentry.

**Not for the agent to build:** the marketing site (already live), the client portal (Phase 3), legal documents, app store listings and submissions.
