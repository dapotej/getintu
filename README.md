# intu platform

Monorepo for the intu member app, partner app, admin console and the API behind them. Read `CLAUDE.md` and `docs/SPEC.md` before changing anything.

## Layout

```
apps/
  api/        Hono API (Node)              — milestone 1
  member/     Expo app                     — milestone 5
  partner/    Next.js scanner and portal   — milestone 4
  admin/      Next.js admin console        — milestone 3
packages/
  config/     TypeScript and ESLint presets
  db/         Drizzle schema, migrations, TEST seed data
  rules/      Entitlement rules as pure functions
  qr/         Rotating QR signing           — milestone 4/5
  ui/         Shared web components, brand  — milestone 3
docs/         Specs and milestone notes
```

## Run it locally

You need Node 22.13+, pnpm 10 and Docker (or any local Postgres 16).

```sh
cp .env.example .env
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev            # API on http://localhost:8787/health
```

`pnpm db:reset` drops and rebuilds a local database (it refuses to touch anything that isn't localhost).

## Checks

```sh
pnpm check          # lint, type checks and tests across every workspace
```

Database tests run when `DATABASE_URL` is set and skip otherwise. CI (`.github/workflows/ci.yml`) runs everything against a Postgres 16 service.

## Changing the schema

Edit `packages/db/src/schema/*`, then `pnpm db:generate --name <what-changed>` and commit the generated SQL in `packages/db/drizzle/`.
