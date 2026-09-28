# Deploy — Vercel (frontend) + Render (Postgres)

## 1. Render — PostgreSQL

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **PostgreSQL**.
2. Name: `onsite-dumpsters-db`; region closest to your users (Oregon/Ohio are fine for
   a Florida launch); plan: **Basic** (or Free to start — note Free spins down when idle).
3. After creation, open the database → **Info**:
   - Copy the **Internal Database URL** (`postgres://…@…/…`) — use this if anything else
     runs on Render.
   - Copy the **External Database URL** — use this for Vercel (public internet).
4. Keep both somewhere safe (Render dashboard only — never in git).

## 2. Vercel — import and configure

1. [vercel.com](https://vercel.com) → **Add New…** → **Project** → import the GitHub repo
   (`onsitedumpsters` account).
2. Framework preset: **Next.js** (auto-detected). Leave the install/build defaults except
   the build command below.
3. **Build command** (override):
   ```
   prisma generate && prisma migrate deploy && next build
   ```
   - `prisma generate` builds the Prisma client for the deploy image.
   - `prisma migrate deploy` applies pending migrations (safe, non-interactive; for the
     very first deploy you can use `prisma db push` locally instead — see below).
   - `next build` is the standard Next.js production build.
4. **Environment variables** (Production + Preview as appropriate):

   | Variable | Value / source |
   |---|---|
   | `DATABASE_URL` | Render **External** Database URL |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console OAuth client (optional) |
   | `STRIPE_SECRET_KEY` | `sk_test_…` → `sk_live_…` at go-live |
   | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_…` → `pk_live_…` at go-live |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the production webhook endpoint |
   | `NEXT_PUBLIC_APP_URL` | `https://<your-app>.vercel.app` |
   | `NODE_ENV` | `production` (Vercel sets this automatically) |

   Absent Stripe keys are intentional in early deploys: the app builds and runs in
   DEMO payments mode (CI proves this path — see `.github/workflows/ci.yml`).

5. Deploy. The repo ships a baseline migration (`prisma/migrations/20260928170000_init/`,
   generated from the schema via `prisma migrate diff`), so the build command's
   `prisma migrate deploy` creates all tables — including `SystemStatus`, which the
   Google Drive backup / Apps Script keepalive integration writes to (see
   `integrations/gdrive-backup/README.md` for the one-time Apps Script setup).
   After this migration lands, run once as the DB owner:
   ```sql
   GRANT SELECT ON TABLE "SystemStatus" TO backup_reader;
   ```
   (the `backup_reader` least-privilege role from `integrations/gdrive-backup/sql/backup-roles.sql`
   predates this table, so it needs the explicit grant to keep reading backup/keepalive status).
   Seed demo data once (optional, skip for production):
   ```bash
   DATABASE_URL="<redacted>" npm run db:seed   # demo data only — skip for production
   ```
   If you later change the schema, generate a new migration locally with
   `prisma migrate dev` (never against production) and commit it; the build
   command picks it up automatically.

## 3. Health check

After deploy, verify:

```bash
curl https://<your-app>.vercel.app/api/health
```

Expected:

```json
{
  "status": "ok",
  "service": "onsite-dumpsters-marketplace",
  "database": "ok",
  "stripe": "configured"
}
```

`status: "degraded"` + HTTP 503 means the database is unreachable — check
`DATABASE_URL` (External URL, SSL) and that the Render DB isn't suspended.
`"stripe": "not_configured"` means DEMO payments mode is active.

> **Route check (2026-09-28):** `/api/health` is implemented and verified in the tree.
> All other page/API paths referenced across these docs are intended paths from the
> build spec — sibling tracks build them in parallel. Re-verify before wiring monitors
> or webhooks to any path other than `/api/health`.

## 4. Ongoing deploys

- Push to `main` → Vercel auto-deploys (CI runs typecheck + tests + build first).
- Prisma migrations run automatically via `prisma migrate deploy` in the build command.
  Never run `prisma migrate dev` against the production database.
- Seed script (`npm run db:seed`) **deletes all rows** — never run it against production.
