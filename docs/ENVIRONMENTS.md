# Environments

| Environment | Database | How migrations get there |
| --- | --- | --- |
| Local dev | Postgres 17 in Docker (`docker-compose.yml`) | `pnpm db:migrate` (or `pnpm db:reset` to rebuild with TEST data) |
| CI | Postgres 17 service container | Every run migrates and seeds a fresh database |
| Staging | Supabase project `intu` (ref `xokexyqjlydjqquownvw`, eu-west-3 Paris, Postgres 17) | The `migrate-staging` CI job, automatically after checks pass on every push to `main` (live since 21 Oct 2026) |
| Production | Not created yet | — |

## Staging (Supabase)

- API URL: `https://xokexyqjlydjqquownvw.supabase.co`
- Migrations 0000–0007 were applied on 21 Oct 2026 through the Supabase connector and recorded in `drizzle.__drizzle_migrations`, so `pnpm db:migrate` continues from 0008. A fingerprint of columns, constraints, indexes and enums matched local exactly.
- Migrations 0008–0010 (22 Oct 2026) move benefits, offers and redemptions onto the catalogue in three steps: add nullable columns, load the taxonomy and backfill (with an audit row per redemption), then set NOT NULL and drop the old `benefit_type` enum; 0011 drops the partner pipeline columns; 0012 adds plan costing and the `fx_rates` table; 0013–0014 move venue kinds onto the catalogue; 0015 adds venue sign-in codes, daily backup codes and flag reviews for the intu scanner; 0016 adds visiting services and booked offers; 0017 links members to their app sign-in and gives venues map coordinates. To replace TEST data on staging, run the "Reset staging TEST data" workflow (`gh workflow run staging-test-data.yml -f confirm=reset`), which runs `packages/db/sql/reset-test-data.sql` then `seed-test-data.sql`. They run through the automatic staging job below.
- **Locked down.** Every table has row-level security with no policies, and Supabase's `anon` and `authenticated` roles have no grants. Supabase's public API can't read or write anything; only the intu API, which connects as the database owner, can. `packages/db/test/schema.test.ts` fails if a new table is added without RLS. Supabase's advisor reports "RLS enabled, no policy" as information. That's intended.
- **TEST data loaded** on 21 Oct 2026 (Dapo's go-ahead) from `packages/db/sql/seed-test-data.sql`: 4 partners, 7 venues, 7 offers, 3 December Pass plans, 8 members, 58 allowances, each with its audit row. Checked against the local seed row for row. `packages/db/test/sql-seed.test.ts` keeps the SQL seed identical to the TypeScript seed. The audit log is append-only, so these rows are permanent unless the trigger is dropped.

### Automatic staging migrations (set up)

1. In Supabase: **Connect** (top of the project dashboard) → **Session pooler** connection string, which works over IPv4 from GitHub. It starts `postgresql://postgres.xokexyqjlydjqquownvw:` and ends `pooler.supabase.com:5432/postgres`. Put the database password in place of `[YOUR-PASSWORD]`. Not the project URL (`https://…supabase.co`) and not the direct connection (`db.…supabase.co`, IPv6 only).
2. In GitHub: `dapotej/getintu` → Settings → Environments → New environment `staging`, then add the secret `STAGING_DATABASE_URL` with that string.
3. The next push to `main` runs `migrate-staging` after the checks pass.

Never commit the connection string or put it in `.env.example`.

### Staff sign-in (Supabase Auth)

- Authentication → Sign In / Providers: email enabled. Authentication → Multi-Factor: **TOTP enabled** (the console requires it).
- Authentication → URL Configuration: Site URL = the admin console's address; add `<admin address>/set-password` to the redirect URLs, and set the API's `ADMIN_INVITE_REDIRECT_URL` to it.
- The API verifies tokens against `https://xokexyqjlydjqquownvw.supabase.co/auth/v1/.well-known/jwks.json`. If the project still uses the legacy shared JWT secret, set `SUPABASE_JWT_SECRET` instead.
- First account: `pnpm --filter @intu/api create:founder -- --email you@getintu.com --name "Dapo Tejuoso"` with the staging `.env`.

## intu scanner keys

The API needs two more secrets in staging and production (it refuses to start without them):

- `QR_SIGNING_KEY`: signs member passes. Make one with `pnpm --filter @intu/qr keygen`. When rotating, give the new key a new id and keep the old public key in `QR_PUBLIC_KEYS` for 36 hours.
- `PARTNER_SESSION_SECRET`: signs partner staff shift sessions, at least 32 random characters.

The scanner (`apps/partner`) is a static site built with `NEXT_PUBLIC_API_URL` set to the API, and its address must be in the API's `CORS_ORIGINS`.

## Member app on staging

**Phone sign-in (Supabase, once):**
1. Authentication → Sign In / Providers → **Phone**: turn it on.
2. Authentication → **Hooks** → add a **Send SMS** hook of type HTTPS, URL `https://intu-api-staging.vercel.app/auth/sms-hook`. Generate its secret and put it in the API's Vercel settings as `SUPABASE_SMS_HOOK_SECRET` (sensitive), then redeploy the API.
3. In the Phone provider settings, add **test phone numbers** with fixed codes, e.g. a TEST member's number with `123456`. With the TEST sender, nothing is sent: only these numbers can sign in.

**Concierge button:** set `CONCIERGE_WHATSAPP` (E.164) on the API; left blank, the app hides it. **Doctor on call** uses the medical partner's service line: a venue of kind "A service by phone or video" with the doctor-on-call offer (TEST CareLine doctor line in TEST data).

**Expo Go:** create the `intu` project under intu's Expo account, then in GitHub → Settings → Environments → staging add the secret `EXPO_TOKEN` (expo.dev → Access tokens) and the variables `EXPO_PROJECT_ID`, `EXPO_OWNER` and `SUPABASE_PUBLISHABLE_KEY` (the `sb_publishable_…` key). The **Member app to Expo Go (staging)** workflow then publishes every change; open it in the Expo Go app from the project's page on expo.dev.

## Payments (Stripe and Paystack, test mode)

Until the keys are added, staging takes every payment on the API's own **TEST payment page**: the member app opens it, "Pay (TEST)" makes the pass, and no money moves. Production refuses to start without real keys, and live keys (`sk_live_…`) are refused unless `PAYMENTS_LIVE=yes`.

To connect the real providers in **test mode** (Dapo does this; never paste keys into chat):

1. **Stripe** (pounds and dollars): create the account, stay in Test mode.
   - Developers → API keys: copy the **secret key** (`sk_test_…`).
   - Developers → Webhooks → Add endpoint: URL `https://intu-api-staging.vercel.app/webhooks/stripe`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `refund.updated`, `charge.refund.updated`. Set the endpoint's **API version to 2024-06-20** (the API reads events in that shape). Copy its **signing secret** (`whsec_…`).
2. **Paystack** (naira): create the account, stay in Test Mode.
   - Settings → API Keys & Webhooks: copy the **test secret key** (`sk_test_…`) and set the **test webhook URL** to `https://intu-api-staging.vercel.app/webhooks/paystack`.
3. In Vercel → the API project → Settings → Environment Variables (staging), add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `PAYSTACK_SECRET_KEY` as sensitive values, then redeploy. (`API_PUBLIC_URL` is optional: without it the API uses the address members reach it on.)

Test cards: Stripe `4242 4242 4242 4242`, any future date and CVC. Paystack `4084 0840 8408 4081`, CVV `408`, any future date, PIN `0000`, OTP `123456`. A plan only shows a Paystack (naira) option once it has an NGN price.

## Partner payouts (Paystack Transfers, test mode)

Statements are paid with the same Paystack key as naira payments. Without a Paystack key (and never in production), payouts are **TEST payouts**: one "TEST Bank" whose 10-digit accounts all check out, and every transfer succeeds without money moving.

To set up staging (Dapo does this; never paste keys or secrets into chat):

1. **Paystack**: Settings → Preferences → turn **off** "Confirm transfers before sending" (the OTP for transfers), so the API can send them. In Settings → API Keys & Webhooks the test webhook URL stays `https://intu-api-staging.vercel.app/webhooks/paystack`: transfer results arrive there too. In test mode Paystack only checks a few account numbers a day and may not resolve every real account; if "Check and save" says the bank couldn't find the account, try Paystack's test account details from their docs.
2. **Bank details key**: on your own computer run `openssl rand -base64 32` and add the result in Vercel → the API project → Environment Variables (staging) as `BANK_DETAILS_KEY` (sensitive). Keep a copy somewhere safe, such as your password manager: without it, saved bank accounts can't be read and must be entered again. Use a different key for production.
3. **Monthly run**: make another random value (`openssl rand -base64 32`) and add it twice: in Vercel as `JOBS_SECRET` on the API, and in GitHub → Settings → Environments → staging as the secret `JOBS_SECRET`. The **Monthly partner statements (staging)** workflow then builds last month's drafts at 07:17 Lagos time on the 1st; it can also be run by hand from the Actions tab. Without it, finance builds them from Console → Statements.
4. Redeploy the API.

**Who approves:** founders can approve payouts from the start. Anyone else needs the **Approves payouts** switch in Console → Settings → Team, set by a team lead (never by themselves). Whoever built or last changed a statement can't approve it.
