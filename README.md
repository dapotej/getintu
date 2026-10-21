# intu platform

Monorepo for the intu member app, partner app, admin console and the API behind them. Read `CLAUDE.md` and `docs/SPEC.md` before changing anything.

## Layout

```
apps/
  api/        Hono API (Node): rules, ledger, admin endpoints, pilot import
  admin/      Next.js admin console (staff sign-in with two-step)
  member/     Expo app                     — milestone 5
  partner/    Next.js scanner and portal   — milestone 4
packages/
  config/     TypeScript and ESLint presets
  db/         Drizzle schema, migrations, TEST seed data
  rules/      Entitlement rules as pure functions
  ui/         Shared web components and intu brand tokens
  qr/         Rotating QR signing           — milestone 4/5
docs/         Specs and milestone notes
```

## Run it locally

You need Node 22.13+, pnpm 10 and Docker (or any local Postgres 17).

```sh
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm --filter @intu/api dev      # API on http://localhost:8787/health
pnpm --filter @intu/admin dev    # admin console on http://localhost:3001
```

`pnpm db:reset` drops and rebuilds a local database (it refuses to touch anything that isn't localhost).

## Checks

```sh
pnpm check          # lint, type checks and tests across every workspace
```

Database tests run when `DATABASE_URL` is set and skip otherwise. CI (`.github/workflows/ci.yml`) runs everything against a Postgres 17 service.

End-to-end tests for the admin console (real API and database, Supabase Auth faked in the browser):

```sh
pnpm --filter @intu/admin exec playwright install chromium   # once
pnpm --filter @intu/admin test:e2e
```

## Changing the schema

Edit `packages/db/src/schema/*`, then `pnpm db:generate --name <what-changed>` and commit the generated SQL in `packages/db/drizzle/`.
