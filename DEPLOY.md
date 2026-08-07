# Deploying ChronoBooks to Railway (alongside ChronoSync)

ChronoBooks deploys as **one Railway service** plus a Postgres database, matching
ChronoSync's own setup: a single Node process serves the built frontend as static files
*and* answers `/api/*` on the same origin (confirmed against ChronoSync's own deploy
logs — `chronosync-app` runs one container that logs "Serving frontend from
/app/frontend" alongside the API). There's no separate frontend service, no CORS to
configure, and no cross-site cookie concerns.

## 1. Add a Postgres database

In your ChronoSync Railway project: **New → Database → PostgreSQL**. Give it its own
volume, separate from ChronoSync's own Postgres, so the two apps' schemas never mix.

## 2. Add the ChronoBooks service

1. **New → GitHub Repo** (or **Empty Service** + connect the repo), pointed at wherever
   this code lives.
2. Leave **Root Directory** as `/` (the repo root) — Railway will detect the `Dockerfile`
   at the root and build with it automatically (confirmed via `railway.json`'s
   `"builder": "DOCKERFILE"`). The Dockerfile builds the frontend in one stage, then
   copies its static output into the backend image at `backend/frontend/`, which is
   exactly what `chronosync-app`'s own log line describes doing.
3. Under **Variables**, add:
   - `DATABASE_URL` — reference the Postgres service you just added:
     `${{Postgres.DATABASE_URL}}` (use whatever you named that service if not
     "Postgres").
   - `NODE_ENV=production` — Railway does not set this for you.
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `AI_KEY_ENCRYPTION_SECRET` — random
     strings, different from ChronoSync's own secrets.
   - `PLATFORM_OPENAI_API_KEY` — optional, only if you want the AI Assistant working out
     of the box for every company (see `backend/.env.example`).
   - `CHRONOSYNC_API_URL` / `CHRONOSYNC_API_TOKEN` — optional, only if you want Payroll to
     pull real posted runs from your live ChronoSync instance instead of the built-in
     demo mock (which auto-dates itself to the current month, so it won't look stale).
   - Leave `PORT`, `CORS_ORIGIN`, and `VITE_API_URL` unset — none of them are needed in
     this single-origin setup (see `.env.example` in each folder for why).
4. Deploy. Watch the build/deploy logs — you should see the frontend build finish, then
   on container start: `Serving frontend from /app/frontend (API base: /api, relative)`,
   `[auto-migrate] starting...`, a list of applied migration files, `[auto-migrate]
   done.`, then `ChronoBooks backend listening on port <PORT>`.

Migrations run automatically on every deploy (tracked in a `schema_migrations` table, so
re-running an already-applied one is a no-op) — there's no separate migrate step to run
by hand.

## 3. Seed the first company (one-time)

Seeding demo data is intentionally **not** automatic (unlike ChronoSync's idempotent
reference-data seeding, ChronoBooks' seed creates a brand-new demo company + admin user
every time it runs, so auto-running it on every boot would create duplicates). After the
first successful deploy, run once via the Railway CLI:

```
railway run npm run seed
```

This creates the demo company, an Administrator login (`admin@demo-sme.com` /
`ChronoBooks!123`), the Super Administrator login, and posts an opening balance journal
entry. For a real rollout in front of actual customers, you'd replace this with your own
onboarding flow rather than the demo seed.

## What's in this deploy setup

- **`/Dockerfile`** — two-stage build: builds `frontend/` with Vite, then copies
  `frontend/dist` into `backend/frontend/` in the final image. `backend/src/app.js`
  serves that directory as static files when it's present (locally, where it isn't
  present, this is a no-op and the Vite dev server handles the frontend as usual).
- **`/railway.json`** — tells Railway to build with the Dockerfile and healthcheck
  `/health`.
- **`backend/src/server.js`** — runs migrations automatically before starting the HTTP
  server (blocking, so a cold/empty database can't be hit by a request before its tables
  exist). Set `AUTO_MIGRATE=false` to opt out.
- **`backend/src/controllers/auth.controller.js`** — the refresh-token cookie switches to
  `SameSite=None; Secure` in production. Not strictly required for this same-origin
  setup, but kept as a no-cost safeguard in case this ever does get split into separate
  frontend/backend services later.
- **`backend/src/services/chronosync.client.js`** — the built-in demo payroll run used to
  be hardcoded to July 2026 and would silently stop showing up in "this month's"
  dashboard numbers once real time moved past July; it now generates itself for whatever
  the current month actually is.
- **`backend/package-lock.json`, `frontend/package-lock.json`** — added so the
  Dockerfile's `npm ci` (which requires a lockfile) actually works; there wasn't one
  checked in before.
