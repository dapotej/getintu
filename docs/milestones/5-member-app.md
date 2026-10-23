# Milestone 5 — Member app

## What was built

**The app** (`apps/member`, Expo SDK 58 with Expo Router, for iPhone and Android)
- **Sign in** with a phone number and a one-time code (Supabase phone auth). The first sign-in links to the member with the same number, whether ops added them, the pilot import brought them in, or (from milestone 6) checkout made them. Someone new sets up a profile: name, email, country, marketing choice, and agreeing to the terms and privacy notice.
- **Photo:** a selfie with the front camera, shrunk to about 600 px (40–80 KB) for Nigerian networks. Stored in a private bucket and only ever served by short-lived signed links: to the member, to intu staff (member page), and to partner staff with each online scan result. No liveness check yet (open question in the spec).
- **Pass:** the photo beside a QR code that changes every 30 seconds, signed on the phone with a key kept in the phone's keychain. The pass is renewed whenever there's signal and less than 30 hours are left, so it always works with no signal for at least a day. Shows today's 6-digit backup code, the pass dates, and why it won't scan when it's suspended, not started or ended. The screen stays on while the pass is open.
- **Benefits:** what's left on each benefit (day amber, night teal) and when it resets; visit history in its own tab.
- **Discover:** a row per catalogue category with venue cards that scroll sideways; search, day or night, "In my plan", and a map (Apple Maps on iPhone, Google Maps on Android). Venue page: what it offers and whether the plan includes each offer (decided by the API with the same rules a scan uses), today's hours, directions, and **Request a booking**.
- **Bookings:** requests and their status (Requested, Confirmed, Not available, Cancelled, Done).
- **Concierge** opens WhatsApp with the member's name and pass number filled in. **Doctor on call** dials the medical partner, shown only to members whose plan includes it.
- Works with no signal: the profile, passes, benefits, venues and bookings are kept on the phone and shown with an "Offline" badge.

**API** (`apps/api/src/member`)
- `GET/PUT /me`, `PUT /me/photo`, `GET /me/memberships` (with what's left), `GET /me/visits`, `POST /me/devices` (register the phone's pass key, get the signed pass), `POST /me/devices/:id/pass` (renew), `GET /venues`, `GET /venues/:id`, `GET/POST /bookings`.
- `POST /auth/sms-hook`: Supabase's Send SMS hook, signature-checked. Delivery is behind a sender; only the TEST sender exists (sends nothing) until WhatsApp or Termii are set up.
- Rules: `includes()` in `packages/rules` decides what a plan includes at a venue, with the same benefit and tier checks as a scan.

**Admin console**
- **Bookings** queue: requests from the app, confirmed once the venue agrees or declined with a reason (both audited). The concierge can answer them (new permission `bookings.manage`).
- Member page shows the member's photo. Venues have a **Map location** (paste latitude, longitude from Google Maps).

**Database:** migration 0017 adds `members.auth_user_id` and `venues.latitude/longitude`; TEST venues have rough area coordinates.

## How to run it

- Locally: `pnpm --filter @intu/member dev`, then open it in Expo Go on a phone on the same network, or press `w` for the browser. Set `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`).
- On your phone from staging: the **Member app to Expo Go (staging)** workflow publishes each change to intu's Expo project once `EXPO_TOKEN` and `EXPO_PROJECT_ID` are set; open the staging update in Expo Go.

## What was tested

- API (Vitest): first sign-in linking and its audit row; staff tokens refused; sign-up needs the terms and can't take a number already in use; photo stored privately, refused unless it's a JPEG; passes with what's left; visits; device registration and renewal, someone else's device refused, revoked device stops renewing; venues marked included by plan and tier; doctor on call only with the benefit; booking requests within the pass's dates only; the concierge queue (confirm, decline with a reason, once only, finance can't answer); the SMS hook's signature, body and timestamp checks. 103 API tests in all.
- Rules: `includes()` (3 tests). App logic (Vitest): which pass to show, when to renew, labels, Lagos dates and hours, bookable days, WhatsApp link, phone numbers (10 tests).
- Member app end to end (Playwright on the web build, real API and database, Supabase sign-in faked): an existing member signs in, takes a photo and shows a pass whose code a scanner verifies for that membership and phone; benefits, discover filters, a booking request; a new sign-up; and with no signal the pass keeps making valid new codes.
- Console end to end: the booking queue (confirm one, decline another).
- The iPhone and Android bundles compile (`expo export`).
- Maestro flows for a real device are in `apps/member/.maestro`; they need an app build (see below).

## Left open

- **Login codes** are TEST mode: nothing is sent. Supabase needs the Send SMS hook pointed at the API and TEST phone numbers with fixed codes (see ENVIRONMENTS.md). WhatsApp or Termii delivery comes when those accounts exist.
- **Liveness check:** none until a provider is chosen.
- **Maestro in CI:** the flows need a native build of the app (EAS), which needs the Expo account; until then they run by hand on a device.
- **Apple and Google Wallet** backup pass (spec Phase 1, not in this milestone's criteria) and **venue photos** (none stored yet).
- **One phone per member?** A member can set up their pass on more than one phone; ops can revoke devices. Whether a new phone should replace the old one automatically is for Dapo to decide.
- **Android map key:** Expo Go supplies its own; a store build of the app will need a Google Maps key for Android (the Maps SDK for Android has no usage charge).
