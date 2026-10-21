# intu — POC Tech Spec (December Pass pilot)

Oct 21, 2026 · @Dapo Tejuoso

## Summary

The pilot runs 100 intu December Passes from 1 December 2026 to 10 January 2027 on off-the-shelf tools, with no custom app. It has one job: prove that diaspora visitors will pay for day-and-night access and that venues will honour it, before money goes into building apps.

Everything runs from one Google Sheet. Members carry an Apple or Google Wallet pass with a QR code. Venue staff validate it on a scan page in their phone's browser. The concierge runs on WhatsApp Business. If the pilot passes its January gate, the [platform tech spec](https://claude.ai/artifact/QoQZ5p4aj6EQTUwVzNF4LB) replaces these tools from early 2027, and the sheet's data moves across.

## Goals and success criteria

On 31 January 2027 the pilot goes to a go/no-go decision on building the apps. These are the measures, taken from the concept doc, plus what the tech must prove.

| Measure | Target | Where it's measured |
| --- | --- | --- |
| Passes sold | 75 or more of 100 | Members tab |
| Benefit use | 40–70% of entitlements used | Visits tab vs allowances |
| Partner renewal | 4 or more venues agree to continue | Partner calls in January |
| Door validation works | 95% of scans approved first time, under 10 seconds | Visits tab, staff feedback |
| Fraud and sharing | No confirmed shared or copied passes | Visits tab, venue reports |
| Member satisfaction | Average 4 out of 5 or better | Survey on 11 January |
| Concierge load | Requests per member per week, and response time | WhatsApp Business stats |

The first three rows decide go/no-go. The rest check the pilot ran safely, size the concierge team and set targets for the apps.

## Scope

The pilot covers selling, issuing, validating and settling 100 passes, run by hand where that is cheaper than building.

**In scope**

- Landing page with reservation and waitlist forms (built)
- Payment by link in pounds and dollars
- Wallet pass per member with a QR code and photo check
- Browser-based scan page for venue staff
- Google Sheet as the database: members, allowances, visits, partners
- WhatsApp Business concierge for bookings and support
- Airport meet-and-assist and transfers booked by the concierge with a supplier
- Doctor on call through a medical partner's own line
- Monthly partner statements produced from the sheet
- End-of-pilot survey and data export

**Out of scope until the apps**

- Native member app and in-app booking
- Self-service partner portal and automated payouts
- Naira pricing and resident annual tiers
- Corporate, bank or promoter (client) portal
- Automated allowance resets and renewals
- Abuja venues, unless a partner signs before 15 November

## System overview

&#91;embedded content: pilot system · one sheet, six connected parts\]

The member only ever touches the website, a Wallet pass and WhatsApp. Everything they do lands in the sheet, which ops, Stripe confirmations and venue scans keep up to date.

## Tools

Every tool below is either already set up or can be live within a day, and most are free at pilot volume. Costs are estimates to confirm on each provider's pricing page.

| Job | Tool | Notes | Cost (estimate) |
| --- | --- | --- | --- |
| Website | getintu.com on Netlify | Site already built; upload the folder | Free |
| Database | Google Sheet "intu — Sign-ups" | Tabs in the Data section below | Free |
| Forms, scan and verify logic | Google Apps Script web app on the same sheet | Extends the script already written | Free |
| Payments | Stripe Payment Links, one per pass tier, GBP and USD | Card fees per transaction | Stripe's standard card rates |
| Membership card | Apple and Google Wallet passes via PassKit or Passcreator | One pass per member; QR holds the verify link | Paid plan sized to 100 passes |
| Member photo | Upload field on the onboarding form | Shown to staff at every scan | Free |
| Concierge | WhatsApp Business on a dedicated intu number | Move to a shared-inbox tool if more than one agent | Free, then a monthly fee |
| Email | Google Workspace mailbox, hello@getintu.com | Payment links, confirmations | One user licence |
| Airport service | Meet-and-assist supplier at Lagos airport | Booked by the concierge | Per arrival, in the unit economics |
| Doctor on call | Medical partner's phone and video line | intu shares only the member's name and pass number | Flat fee per pass |
| Survey | Google Forms | Sent 11 January | Free |
| Analytics | Plausible or Google Analytics on the site | Tracks visits to reservations | Free to low |

**Travel eSIM (if the pass includes one).** For the pilot, buy Nigeria data eSIMs by hand through an eSIM partner dashboard such as [Airalo Partners](https://partners.airalo.com/solutions/integrations), and email each member the install QR code a week before they fly. Retail Nigeria plans run from $7.50 for 1 GB over 3 days to $30 for 5 GB over 30 days ([eSIMDB](https://esimdb.com/nigeria/airalo)); partner prices are lower. Plans are data-only, with no Nigerian phone number.

## Key flows

Four flows carry the pilot. Each step names who does it and where the record lands.

**1. Buy and issue a pass** (target: within 24 hours of reservation)

1. Visitor reserves on getintu.com. A row lands in Reservations.
2. Ops emails the matching Stripe Payment Link from hello@getintu.com.
3. Stripe confirms payment. Ops marks the row Paid, which creates the member's row in Members with a pass number (INTU-0001) and a random token.
4. Ops sends the onboarding form: photo, arrival and departure dates, group names for Crew passes.
5. Ops issues the Wallet pass. Its QR code holds the verify link with the member's token.
6. Concierge sends the welcome on WhatsApp and books the airport meet-and-assist. If the tier includes an eSIM, ops emails the install QR 7 days before arrival and logs it in the member's row.

**2. Validate at the door** (target: under 10 seconds)

1. Member opens the Wallet pass and shows the QR code.
2. Staff scan it with the phone camera. The link opens the verify page, which asks for the venue's staff PIN once per shift.
3. The page shows the member's photo, name, pass status and remaining allowance for that venue's benefit.
4. Staff compare the photo with the person, then tap Record visit. If the benefit isn't allowed, the page says why: used up, wrong venue, pass not active, or outside dates.
5. A row lands in Visits and the allowance updates at once.
6. If the page won't load, staff text the pass number to the ops WhatsApp line, which approves or declines and logs the visit by hand.

**3. Concierge booking**

1. Member messages the intu WhatsApp number.
2. Concierge checks the member's row, books the venue or event, and confirms in the chat.
3. Bookings that use an allowance (hosted night, golf, spa) are logged in Bookings, then confirmed by the scan on the day.

**4. Partner settlement**

1. On 1 January and 11 January, ops filters Visits by venue.
2. A statement per venue lists visits, benefit and agreed rate, and the total.
3. The venue confirms; ops pays by bank transfer in naira and records the payment in Partners.

## Data

The sheet has seven tabs. The column names match what the apps' database will use later, so the data moves across without reworking.

| Tab | One row per | Key columns |
| --- | --- | --- |
| Reservations | Form submission | Submitted at, name, email, WhatsApp, pass tier, flying from, arrival date, consent, status (New / Link sent / Paid / Lapsed) |
| Members | Paid pass holder | Pass number, token, tier, name, email, WhatsApp, photo link, arrival, departure, status (Active / Suspended / Ended), Crew group ID |
| Allowances | Member × benefit | Pass number, benefit (beach, pool and gym, golf, spa, hosted night, lounge), total, used, remaining (formula) |
| Partners | Venue | Venue ID, name, area, benefit(s) offered, rate per visit (₦), contact, bank details reference, active |
| Visits | Scan or manual approval | Timestamp, pass number, venue ID, benefit, result (Approved / Declined + reason), method (Scan / Manual), staff note |
| Bookings | Concierge booking | Pass number, venue or event, date, benefit used (if any), status |
| Waitlist | Resident sign-up | Submitted at, email, city, consent |

**Rules the script enforces on every scan**

- Pass status is Active and today is within 1 December to 10 January.
- The venue offers the benefit, and the member has some remaining.
- No second visit to the same venue for the same benefit on the same day.
- Every attempt is logged in Visits, including declines.

The sheet holds personal data under UK GDPR and the Nigeria Data Protection Act. Share it only with the ops team, keep staff PINs in the script's properties rather than the sheet, and delete member photos 30 days after the pilot ends.

## Pass validation design

At pilot scale, a static QR code plus a photo check is enough. Copying is controlled by people and logging, not cryptography.

**What the QR code holds:** a link to the verify page with the member's token, e.g. `…/exec?v=7Kq2…`. The token is 20 random characters, unique per member, and reveals nothing on its own. The verify page loads only with a valid staff PIN, so a member scanning their own code sees a "Show this to venue staff" screen and nothing else.

**How sharing and copying are limited**

| Risk | Control |
| --- | --- |
| Member shares a screenshot of the QR | Staff check the photo on screen against the person; same-day repeat visits are blocked |
| Member lends the pass to a friend | Photo check; Crew passes list all four names and photos |
| Leaked staff PIN | One PIN per venue, changed weekly and immediately if a member of staff leaves |
| Disputed visit | Every scan logged with time, venue and result; statements reconcile against it |
| Lost or stolen phone | Ops suspends the pass in Members and issues a new token and Wallet pass |

**When the venue has no signal**

1. Staff text the pass number (for example INTU-0042) to the ops WhatsApp line.
2. Ops checks the sheet and replies Approved or Declined within 2 minutes, with the member's photo.
3. Ops logs the visit with method Manual.

The apps replace this with a QR code that refreshes every 30 seconds and can be checked offline (see the [platform tech spec](https://claude.ai/artifact/QoQZ5p4aj6EQTUwVzNF4LB)).

## Build plan

&#91;embedded content: pilot build plan · 22 Oct to 1 Dec\]

Venue signing runs in parallel with the tech from day one, because the verify page can't be tested without real venue IDs and staff. The dry run in the last week of November uses test passes at two venues before any member arrives.

## Risks and open questions

The biggest technical risk is the manual work around payment and pass issue, not the tools. One person handling 100 members over the Christmas peak is tight, so the plan needs a named backup.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Manual steps from payment to pass | Slow onboarding, mistakes in the sheet | Checklist per member; a second person reviews new Members rows daily |
| Apps Script limits or downtime | Verify page doesn't load at the door | WhatsApp fallback; keep scans under the script's daily quotas (far above pilot volume) |
| Venue staff don't scan | Visits go unrecorded, statements disputed | Brief each venue in person; a laminated how-to at the door; spot checks |
| Concierge overload at peak | Slow replies, unhappy members | Second agent from 15 December; saved replies for common requests |
| Personal data in a spreadsheet | Data protection exposure | Restricted sharing, two-step login on the Google account, deletion schedule |

**Open questions**

- [ ] PassKit or Passcreator: which gives the simplest manual issue flow at 100 passes?
- [ ] Who handles ops and concierge over 20 December – 2 January?
- [ ] Pay venues per visit, or a fixed pilot fee per venue?
- [ ] Which meet-and-assist supplier at Lagos airport, and how are bookings confirmed?
- [ ] Refund policy text, needed before the first payment link goes out
