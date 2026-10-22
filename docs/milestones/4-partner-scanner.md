# Milestone 4 — Partner scanner (the intu scanner)

## What was built

**Signed, rotating passes** (`packages/qr`)
- The server signs a *pass certificate* for one device: the membership, plan, dates, the member's name and the device's public key, valid 36 hours. The member's device signs the certificate plus the current 30-second window with its own key. A code works for at most 90 seconds, so a screenshot stops working within a minute or so.
- A scanner checks both signatures with only the server's public key, so it works offline. Ed25519 (`@noble/curves`), the same code in the API, the scanner and later the member app.
- Keys: `QR_SIGNING_KEY` signs (make one with `pnpm --filter @intu/qr keygen`); `QR_PUBLIC_KEYS` keeps retired keys trusted until their passes expire.

**The intu scanner** (`apps/partner`, an installable web app for partner staff)
- Sign in with the venue's or service's sign-in code and a personal 6-digit PIN; stay signed in for the 16-hour shift on the venue's phone.
- Full-screen camera scanning (the browser's built-in QR reader on Android, jsQR elsewhere). Pick the offer and party size; the result shows in large type: Approved or Declined with the reason, the member's name, the offer and what's left. Partners see name only (and the photo once members have one).
- Backup: type the member's 6-digit code when the camera can't read the pass (needs signal).
- **Offline:** a service worker keeps the whole app on the phone. With no signal, the scanner checks the pass's signatures and time, the revocation list and the cached rules (the same rules engine as the server), allows one offline approval per member per venue per day, and stores the visit. A banner shows it's offline and how many visits are waiting; they sync when signal returns. The revocation list refreshes every 15 minutes, the venue's offers and plans with it.
- **Today:** bookings expected, visits recorded and declines with reasons, plus visits still on the phone. **Report** sends a problem with a visit (wrong person, behaviour, dispute) to intu.

**API**
- `POST /partner/session`, `GET /partner/venue` (everything the scanner caches), `GET /revocations`, `POST /scan`, `POST /scan/sync`, `GET /partner/visits`, `POST /partner/visits/:id/report`.
- Synced offline visits keep the id the phone gave them, so a batch sent twice is recorded once. If the rules decline one, it stays approved and is flagged to ops with the reason; it draws on the allowance only if there's room. A scanner whose clock is off is corrected for. A device revoked before the visit gets flagged.
- A code is only ever approved once (also enforced in the database). Two scans of one code at the same moment give exactly one approval.

**Admin console**
- Venue page: **intu scanner** card with the sign-in code (make or change it), partner staff, add staff with a PIN, reset PINs, remove staff (their session stops working at once).
- Member page: **TEST pass** for TEST members, which turns the browser into the member's phone: it shows the live rotating QR and today's backup code. **Devices** lists phones holding the pass, with Revoke.
- **Visits to review**: offline rule breaks and venue reports, each closed with a note (audited).

## Added: visiting services (chauffeurs, home beauty)

- A venue is either **a place members visit** or **a service that comes to them**. A visiting service has no address (its area is where it serves) and its staff scan members on their own phones when they meet.
- A visiting service can only be scanned against a **confirmed booking** for the day, for the booked offer if one was chosen. The scan uses the booking (shown as Done on the scanner's Today list) and draws the allowance. Without one: "No booking for today", offline too, from bookings the scanner cached.
- Ops book a service from the member's page (**Bookings** card: pass, service, what's booked, date, party size, notes for the partner) and can cancel an unused booking.
- **Reverse** on a visit (member page) undoes a job that didn't happen: the allowance comes back, the booking is cancelled, and the visit stays on record as reversed so it's never paid.
- TEST data: Coastal Rides is now a visiting chauffeur service, and TEST Ada has an airport pickup booked for 14 December, the day she lands.

## How to run it

1. `pnpm db:migrate && pnpm db:seed` (migration 0015 adds sign-in codes, backup codes and review fields; 0016 visiting services and booked offers).
2. API: `pnpm --filter @intu/api dev`. Add the scanner's address to `CORS_ORIGINS`, e.g. `http://localhost:3001,http://localhost:3002`.
3. Scanner: `pnpm --filter @intu/partner build && pnpm --filter @intu/partner start`, then open http://localhost:3002. The camera needs https or localhost.
4. Sign in with any TEST venue's sign-in code (e.g. `ATLONI` for TEST Atlantic Shore Oniru, `COASTL` for the Coastal Rides chauffeurs) and the TEST PIN `246810`.
5. In the admin console, open a TEST member, then **TEST pass**, and scan the screen with the scanner. TEST passes run 1 Dec–10 Jan and venues have opening hours, so outside those you'll see the right decline.

## What was tested

- `packages/qr`: round trip, 30-second rotation and 90-second limit, untrusted keys, codes from another device, expired passes, tampering, malformed input, long names.
- Rules: a code already approved; every offline check, including the one-per-venue-per-day limit.
- API (13 tests): PIN sign-in and the wrong-PIN limit; the offline bundle; approve, repeat, concurrent scans; old, forged and revoked codes; backup codes and their guessing limit; other venues' offers; offline sync recorded once with rule breaks flagged and reviewed; clock correction and revoked devices; today's list and reports; door staff management; TEST passes for TEST members only.
- Playwright, scanner on an emulated Pixel 7 against the real API: sign-in and staying signed in, installable manifest; online approve and repeat; **result in under 2 seconds on throttled 3G with a 4x slower CPU** (about 0.6 s locally); backup code; offline scan, reload with no signal, sync on reconnect; an offline approval the server flags; today's list and reporting.
- Playwright, admin: venue code and door staff, a TEST pass shown and scanned, and reviewing the visit it produced.

## Left open

- Hosting: the scanner is a static site (any static host, e.g. Vercel); the API needs hosting before venues can use it.
- Member photos arrive with the member app (milestone 5).
- The venue manager portal (staff, statements, bookings) is later; intu ops manage door staff for now.
- Whether venues are paid for flagged offline visits: settlements, milestone 7.
- The assumptions marked in `docs/DECISIONS.md` (backup code rules, PIN rules).
