# HojiiGO — flexible work marketplace (pilot)

Two Node projects in one GitHub repo: **backend** (API) and **frontend** (web). Render is the easiest hosted deploy (web process + Postgres). Vercel also works as two projects.

Product spec: `SRS.docx`. Plan: [`docs/PLAN.md`](docs/PLAN.md).

## Local

Requires Node 22+ and PostgreSQL (`docker compose up -d` in `backend/` for port 5433).

```powershell
npm install
npm run install:all
Copy-Item backend/.env.example backend/.env   # then set DATABASE_URL
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:5173. The frontend proxies `/api` to http://localhost:4000.

## Deploy on Render

`render.yaml` at the repo root is a Blueprint: API (`team-1-api`), static site (`team-1-web`), and free Postgres (`team-1-db`).

1. Push this repo to GitHub.
2. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → `lattekiki/Team-1`.
3. Apply. The API runs migrations and demo seed on start (free web services cannot use a pre-deploy command). After the API is live, the frontend build needs `VITE_API_URL` (wired from the API URL). If the first static build ran too early, click **Manual Deploy** on `team-1-web`.

Check `https://team-1-api.onrender.com/api/health`, then open the `team-1-web` URL and sign in. OTP codes are returned in the UI (`OTP_EXPOSE_DEV_CODE=true`) and also appear in API logs.

Free web services sleep after 15 minutes idle; the first request can take about a minute. Free Postgres expires after 30 days unless you upgrade.

## Deploy on Vercel (two projects, one repo)

Use **this** GitHub repo twice. Do not set the Root Directory to the repo root.

### 1. Backend project

- New Vercel project → this repo
- **Root Directory:** `backend`
- **Framework preset:** Other
- Environment variables:
  - `DATABASE_URL` — hosted Postgres (Neon, Supabase, Vercel Postgres). Use a pooler URL.
  - `WEB_ORIGIN` — `https://<frontend>.vercel.app,https://*.vercel.app`
  - `PUBLIC_API_URL` — `https://<backend>.vercel.app`
  - `NODE_ENV` — `production`
  - Copy any other keys you use from `backend/.env.example` (`PAYMENTS_MODE`, `OTP_PROVIDER`, …)
- Build runs `npm run migrate`. After the first deploy, copy the backend URL.

Local disk uploads do not persist on Vercel. Set `STORAGE_BACKEND=s3` (and bucket keys) if you need verification files in production.

### 2. Frontend project

- New Vercel project → **the same repo**
- **Root Directory:** `frontend`
- **Framework preset:** Vite
- Environment variables:
  - `VITE_API_URL` — `https://<backend>.vercel.app` (no `/api` suffix)

Redeploy the frontend after `VITE_API_URL` is set (Vite bakes it in at build time).

### Check

Open `https://<backend>.vercel.app/api/health`. Then open the frontend URL and sign in.

## Demo accounts

| Account | Phone | Role |
|---|---|---|
| `admin` | `0911000001` | Admin console |
| `abebe_worker` | `0911000002` | Worker |
| `merkato_shop` | `0911000003` | Business employer |
| `kochi_family` | `0911000004` | Household employer |

OTP in development is printed by the API (`OTP_PROVIDER=console`).
