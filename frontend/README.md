# HojiiGO frontend

React + Vite. Local: http://localhost:5173. Vercel: set this folder as the project **Root Directory**.

## Local

Run the backend first, then:

```powershell
npm install
npm run dev
```

Leave `VITE_API_URL` unset locally. Vite proxies `/api` to http://localhost:4000.

## Vercel

Root Directory `frontend`. Set `VITE_API_URL` to the backend origin, for example `https://hojiigo-api.vercel.app` (no trailing slash, no `/api`).
