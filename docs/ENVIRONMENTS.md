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
- Migrations 0008–0010 (22 Oct 2026) move benefits, offers and redemptions onto the catalogue in three steps: add nullable columns, load the taxonomy and backfill (with an audit row per redemption), then set NOT NULL and drop the old `benefit_type` enum; 0011 drops the partner pipeline columns; 0012 adds plan costing and the `fx_rates` table. They run through the automatic staging job below.
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
