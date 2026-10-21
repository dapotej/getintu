# Environments

| Environment | Database | How migrations get there |
| --- | --- | --- |
| Local dev | Postgres 17 in Docker (`docker-compose.yml`) | `pnpm db:migrate` (or `pnpm db:reset` to rebuild with TEST data) |
| CI | Postgres 17 service container | Every run migrates and seeds a fresh database |
| Staging | Supabase project `intu` (ref `xokexyqjlydjqquownvw`, eu-west-3 Paris, Postgres 17) | The `migrate-staging` CI job on every push to `main`, once the secret below exists |
| Production | Not created yet | — |

## Staging (Supabase)

- API URL: `https://xokexyqjlydjqquownvw.supabase.co`
- Migrations 0000–0005 were applied on 21 Oct 2026 through the Supabase connector and recorded in `drizzle.__drizzle_migrations`, so `pnpm db:migrate` continues from 0006. A fingerprint of columns, constraints, indexes and enums matched local exactly.
- **Locked down.** Every table has row-level security with no policies, and Supabase's `anon` and `authenticated` roles have no grants. Supabase's public API can't read or write anything; only the intu API, which connects as the database owner, can. `packages/db/test/schema.test.ts` fails if a new table is added without RLS. Supabase's advisor reports "RLS enabled, no policy" as information. That's intended.
- **No data yet.** The TEST seed hasn't been loaded into staging. Because the audit log is append-only, seed rows written there are permanent unless the trigger is dropped, so only seed staging on purpose.

### Turning on automatic staging migrations

1. In Supabase: Project Settings → Database → Connection string → **Session pooler** (works over IPv4 from GitHub). Copy it and put in the database password.
2. In GitHub: `dapotej/getintu` → Settings → Environments → New environment `staging`, then add the secret `STAGING_DATABASE_URL` with that string.
3. The next push to `main` runs `migrate-staging` after the checks pass.

Never commit the connection string or put it in `.env.example`.
