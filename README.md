# HojiiGO — Jimma flexible work marketplace (pilot)

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
npm run db:seed                                  # demo users and six published demo jobs
npm run dev                                      # API + web together
```

Open http://localhost:5173.

## Sign-in during development

Default `OTP_PROVIDER=console` logs the code and returns it as `devCode` for the login UI. Set
`OTP_PROVIDER=africastalking` or `twilio` (plus API keys in `apps/api/.env`) to send real SMS;
`devCode` is then withheld unless `OTP_EXPOSE_DEV_CODE=true`.

Payments default in `.env.example` to `PAYMENTS_MODE=mock_escrow` (simulated hold/release — no real money).
Use `off` to settle only outside the app, or `manual` to record cash/bank payments without a hold step.

| Demo account | Phone | Role |
|---|---|---|
| `admin` | `0911000001` | Admin console |
| `abebe_worker` | `0911000002` | Worker |
| `jimma_shop` | `0911000003` | Business employer (3 demo jobs) |
| `kochi_family` | `0911000004` | Household employer (3 demo jobs, including a VIP childcare job) |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode) and web dev server |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Insert demo accounts and jobs (safe to re-run) |
| `npm run typecheck` | Type-check every workspace |
| `npm test` | API tests (uses `TEST_DATABASE_URL`) |
