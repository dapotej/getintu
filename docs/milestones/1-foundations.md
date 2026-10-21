# Milestone 1 — Foundations

## What was built

- **Monorepo**: pnpm workspaces and Turborepo, TypeScript 6.0 in strict mode everywhere (plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`).
- **`packages/config`**: shared tsconfig and ESLint preset. The preset bans `parseFloat` and `toFixed` as a guard against money ever becoming a float.
- **`packages/db`**: Drizzle schema for `members`, `partners` and `venues` (UUID keys, UTC timestamps, soft deletes), first migration, migrate/seed/reset scripts.
- **TEST seed data**: 4 partners, 7 venues (beach, hotel pool and gym, spa, golf, nightclub, members' club) and 5 members. Every name starts with `TEST`, phones come from fiction-reserved ranges (UK 07700 900xxx, US 555-01xx), emails use example.com. A test enforces this.
- **`packages/rules`**: started with the Lagos-time helper every rule will use.
- **`apps/api`**: Hono on Node with `GET /health`, which checks the database and returns 503 if it's down. Env vars validated with Zod.
- **CI**: GitHub Actions runs install, migrate, seed, lint, type checks and tests against Postgres 16.
- **Dev environment**: `docker-compose.yml` Postgres, `.env.example`, README.

## How to run it

See `README.md`: `cp .env.example .env`, `docker compose up -d postgres`, `pnpm install`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm dev`, then open http://localhost:8787/health.

## What was tested

- `pnpm check` passes locally: lint, type checks and tests across all four workspaces (9/9 tasks).
- Seed runs twice without duplicating rows; seed data is TEST-only.
- `/health` returns 200 with a live database and 503 without one; checked by test and by hand.

## Left open

- **CI has not run on GitHub yet**: there is no repository. Once Dapo creates the GitHub organisation and an `intu` repo, push and confirm the workflow is green.
- **Staging environment**: needs the Supabase project and an API host (accounts Dapo creates). Once they exist: point `DATABASE_URL` at Supabase, run migrations from CI, deploy the API. The API host choice (EU/UK region) is still open.
- **Local Supabase**: dev uses plain Postgres 16 for now, which is enough for milestones 1–2. Supabase's local stack (auth, storage) comes in with milestone 3, where phone auth and staff login start.
- **Brand assets**: `brand/` is empty; the logo SVGs from the brand kit need adding.
- **Version notes**: TypeScript is pinned to 6.0.3 because typescript-eslint doesn't support 7.x yet.
- The other apps and packages (`member`, `partner`, `admin`, `qr`, `ui`) are scaffolded at their own milestones rather than as empty shells now.
