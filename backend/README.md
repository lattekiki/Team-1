# HojiiGO backend

Express API. Local: http://localhost:4000. Vercel: set this folder as the project **Root Directory**.

## Local

```powershell
npm install
Copy-Item .env.example .env
npm run migrate
npm run seed
npm run dev
```

`WEB_ORIGIN` must match the frontend origin so CORS and login cookies work.

## Vercel

Root Directory `backend`. Required env: `DATABASE_URL`, `WEB_ORIGIN`, `PUBLIC_API_URL`, `NODE_ENV=production`.

Build runs migrations. The serverless entry is `api/index.ts` (all `/api/*` routes).
