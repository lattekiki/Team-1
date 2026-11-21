# HojiiGO — flexible work marketplace (pilot)

A marketplace connecting people who want flexible work with households and businesses.
Product spec: `SRS.docx`. Build plan, scope, data model and API: [`docs/PLAN.md`](docs/PLAN.md).

## Stack

npm workspaces monorepo, TypeScript throughout.

- `frontend` — React + Vite (http://localhost:5173, proxies `/api` to the API)
- `backend` — Node + Express 5 (http://localhost:4000), PostgreSQL via `pg`, SQL migrations in `backend/migrations`
- `packages/shared` — Zod schemas and enums used by both

## Setup

Requires Node 22+ and PostgreSQL 16+ (local service, or `docker compose up -d` for one on port 5433).

```powershell
npm install
Copy-Item backend/.env.example backend/.env   # then set your Postgres password in DATABASE_URL
npm run db:migrate                               # creates the database if missing, applies migrations
npm run db:seed                                  # demo users and six published demo jobs
npm run dev                                      # API + web together
```

Open http://localhost:5173. Organizations that want many workers on a monthly agreement use **Contact us** (`/contact`); requests show on the admin Organizations tab (example fee 5,000 ETB/month). Workers who finish 30 jobs get an Active worker badge and can request VIP; an admin still decides.

Signed-in workers see **suggested jobs** on Home and Dashboard (skills, area, similar completed work).
Employers can tap **Suggest from title** when posting; applicant lists show the same fit chips without hiding new workers.
**Help me write** on post-job and apply uses local templates by default (`LLM_PROVIDER=template`). Set `openai` plus `LLM_API_KEY` for a live model.

## Sign-in during development

Default `OTP_PROVIDER=console` logs the code and returns it as `devCode` for the login UI. Set
`OTP_PROVIDER=africastalking` or `twilio` (plus API keys in `backend/.env`) to send real SMS;
`devCode` is then withheld unless `OTP_EXPOSE_DEV_CODE=true`.

Payments default in `.env.example` to `PAYMENTS_MODE=mock_escrow`, which only records the payment. No money is transferred until Chapa is connected. The employer pays first (job pay plus 2.5%); phone numbers stay hidden until that record is held; an admin confirms the work is done, then records the worker's payout (job pay minus 2.5%). HojiiGO keeps 5%. Signed-in people can message an admin from Contact us; the same page still takes organization monthly-agreement requests.
Use `off` to settle only outside the app, `manual` to record cash/bank payments without a hold step, or
`chapa` with `CHAPA_SECRET_KEY` for hosted Chapa checkout (Telebirr/cards/banks). Set `PUBLIC_API_URL` so
Chapa can reach `/api/payments/chapa/callback` and `/api/payments/webhooks/chapa`.

Verification documents default to local disk (`STORAGE_BACKEND=local`). Set `STORAGE_BACKEND=s3` plus
`S3_BUCKET` / `S3_REGION` / keys (and optional `S3_ENDPOINT` for R2 or MinIO) to store them in the cloud.

Browser push: set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (see `.env.example`, or `npx web-push generate-vapid-keys`),
then enable push on the Notifications page. Optional `NOTIFY_SMS=true` also texts high-priority alerts via `OTP_PROVIDER`.

| Demo account | Phone | Role |
|---|---|---|
| `admin` | `0911000001` | Admin console |
| `abebe_worker` | `0911000002` | Worker |
| `merkato_shop` | `0911000003` | Business employer (3 demo jobs) |
| `kochi_family` | `0911000004` | Household employer (3 demo jobs, including a VIP childcare job) |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode) and web dev server |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:seed` | Insert demo accounts and jobs (safe to re-run) |
| `npm run typecheck` | Type-check every workspace |
| `npm test` | API tests (uses `TEST_DATABASE_URL`) |
