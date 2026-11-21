# Team-1 — Jimma flexible work marketplace (pilot)

A marketplace connecting people who want flexible work with households and businesses in Jimma, Ethiopia.
Product spec: `SRS.docx`. Build plan, scope, data model and API: [`docs/PLAN.md`](docs/PLAN.md).

## Stack

npm workspaces monorepo, TypeScript throughout.

- `apps/web` — React + Vite (http://localhost:5173, proxies `/api` to the API)
- `apps/api` — Node + Express 5 (http://localhost:4000), PostgreSQL via `pg`, SQL migrations in `apps/api/migrations`
- `packages/shared` — Zod schemas and enums used by both

## Setup

Requires Node 22+ and PostgreSQL 16+ (local service, or `docker compose up -d` for one on port 5433).

```powershell
npm install
Copy-Item apps/api/.env.example apps/api/.env   # then set your Postgres password in DATABASE_URL
npm run db:migrate                               # creates the database if missing, applies migrations
npm run db:seed                                  # demo users: admin / abebe_worker / jimma_shop
npm run dev                                      # API + web together
```

Open http://localhost:5173. The home page shows whether the API can reach the database.

## Sign-in during development

SMS is not wired up yet. Request a code with any Ethiopian mobile number (for example `0911000002`)
and read the 6-digit code from the API terminal output.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode) and web dev server |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Insert demo accounts |
| `npm run typecheck` | Type-check every workspace |
| `npm test` | API tests (uses `TEST_DATABASE_URL`) |
