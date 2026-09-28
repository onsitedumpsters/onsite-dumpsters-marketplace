# Google Drive DB Backups + Apps Script Keepalive

Automated safety net for the marketplace database: **JSON snapshots in Google
Drive** (daily + weekly, with retention), a **10-minute keepalive** that keeps
the app warm and detects outages, one shared **SystemStatus** table so the
app, the script, and the admin dashboard agree on the state of the world — and
a tested **restore path** if the free database ever goes away.

## How the pieces fit

```
Apps Script (Google)                        Vercel app                    Postgres
─────────────────                           ──────────                    ────────
keepalive() every 10 min
  └─► GET /api/health ──────────────────────► health route ──► SELECT 1 ──► DB
  └─► POST /api/backup/ping ────────────────► ping route writes keepalive.* keys
        (Bearer BACKUP_SHARED_SECRET)         into SystemStatus (DB latency measured
                                              server-side)
dailyBackup() 02:00 ET / weeklyBackup() Sun 03:00 ET
  └─► GET /api/backup/export?kind=… ────────► export route ──► SELECT * all tables
        (Bearer BACKUP_SHARED_SECRET)         (hashes canonical bytes, writes
                                              backup.* keys into SystemStatus)
  ◄── snapshot JSON bytes ───────────────────┘
  └─► uploads EXACT bytes to Drive (backups/{kind}/), updates
      backup-manifest.json, prunes retention
  └─► POST /api/backup/ping {backup_file, backup_sha256}
                                              ──► verifies hash === export hash,
                                                  writes backup.last_file
                                                      │
Google Drive: OnsiteDumpstersDB/              │      ▼
  backup-manifest.json ◄── index + SHA-256    │   Admin dashboard
  backups/daily/*.json                        │   (BackupStatusPanel.tsx)
  backups/weekly/*.json                       │   reads SystemStatus
```

**Why the app does the export:** Apps Script's JDBC driver cannot negotiate
the SSL connection Render Postgres requires — it rejects both the `sslmode`
and `ssl` connection parameters (verified empirically 2026-09-28), so a
direct script→database connection is impossible. The export therefore runs
inside the app (which connects via Prisma normally); the script remains the
scheduler, the Drive storage layer, and the alerter. No database credentials
exist in Google at all.

**Restore** is manual and lives in the repo, not in Apps Script:
`npx tsx scripts/restore-backup.ts <snapshot.json>` (see runbook below).

## One-time setup

### 1. Deploy the app and set the backup secret

The two backup endpoints authenticate with a shared bearer token:

1. Generate one: `openssl rand -hex 32`
2. Add it as `BACKUP_CRON_SECRET` in the Vercel project environment.
3. Add the **same value** as the `BACKUP_SHARED_SECRET` Script Property below.

Without the secret, both endpoints return `503` — backups stay inert rather
than open.

### 2. Create the Apps Script project

1. Go to <https://script.google.com> → **New project**.
2. Rename it to `OnsiteDumpsters DB Backup`.
3. Replace the contents of `Code.gs` with `Code.gs` from this folder.
4. Add `appsscript.json`: Project Settings → check **"Show appsscript.json
   manifest file in editor"**, then paste the manifest contents.
5. Project Settings → **Script properties** → add each row (no quotes):

| Property              | Value |
|-----------------------|-------|
| `APP_URL`             | leave **empty** until the app is deployed (e.g. `https://onsitedumpsterservice.com`). While empty, keepalive and backups skip quietly; set it after the Vercel deploy and everything activates automatically |
| `BACKUP_SHARED_SECRET`| the bearer token from step 1 |
| `ADMIN_EMAIL`         | where failure alerts go |
| `DRIVE_FOLDER_ID`     | optional: reuse an existing Drive folder id (otherwise the script creates `OnsiteDumpstersDB` once and stores its id here automatically) |

There are intentionally **no database credentials** here — the script never
connects to Postgres.

### 3. Authorize and verify

Run **`testConnections()`** once from the editor. Accept the OAuth prompts
(scopes are minimal — see Security below). The log should show `OK` for the
app `/api/health`, the backup API ping, Drive, and the alert email. Fix
anything red before continuing. (The backup-API lines stay `SKIPPED` until
`APP_URL` is set — expected before deploy.)

### 4. Create the triggers

Run **`setupAll()`** once. It creates:

| Function       | Trigger                          |
|----------------|----------------------------------|
| `keepalive`    | every 10 minutes                 |
| `dailyBackup`  | every day 02:00 America/New_York |
| `weeklyBackup` | Sundays 03:00 America/New_York   |

Triggers → executions are visible under **Executions** in the Apps Script
dashboard. There is no restore function and no trigger that can wipe data.

### 5. Wire the app side (already in this repo)

- `prisma/schema.prisma` includes the `SystemStatus` model (migration
  `20260928170000_init`).
- `src/lib/backup.ts` — export/import/serialization core (unit-tested).
- `src/app/api/backup/export/route.ts` — authenticated snapshot export.
- `src/app/api/backup/ping/route.ts` — keepalive + backup-completion reporter.
- `scripts/restore-backup.ts` — manual restore CLI.
- `integrations/gdrive-backup/app-side/BackupStatusPanel.tsx` — admin
  dashboard panel reading `SystemStatus` (mounted in the admin page).

## Restoring (disaster runbook)

1. Provision a fresh Postgres (Render or anywhere) and run the app's Prisma
   migrations so the schema exists: `npx prisma migrate deploy`.
2. Download the newest snapshot from Drive
   (`OnsiteDumpstersDB/backups/daily/…` — cross-check its SHA-256 against
   `backup-manifest.json`).
3. From the repo, with `DATABASE_URL` pointing at the **new** database:
   `npx tsx scripts/restore-backup.ts <snapshot.json>`
   The script validates the snapshot version, truncates all tables
   (`CASCADE`), re-inserts in FK-safe order inside one transaction, and
   records `restore.last_at` in `SystemStatus`.
4. Point the app's `DATABASE_URL` at the restored database and redeploy.

Practice this on a scratch database once a quarter. An untested backup is a
hope, not a plan.

## Snapshot JSON format

One file per backup: `onsite-dumpsters-marketplace-{daily|weekly}-YYYYMMDD-HHmmss.json`.

```jsonc
{
  "version": 1,
  "generator": "onsite-dumpsters-marketplace",
  "exportedAt": "2026-09-28T06:00:00.000Z",
  "kind": "daily",
  "tables": {
    "Order": {
      "columns": ["id", "status", "grandTotalCents", "createdAt"],
      "rows": [{ "id": "cm1…", "status": "delivered", "grandTotalCents": 45000,
                 "createdAt": "2026-09-20T…" }]
    }
  }
}
```

`backup-manifest.json` (Drive root) indexes every retained snapshot:

```jsonc
{
  "app": "onsite-dumpsters-marketplace",
  "backupFormatVersion": 1,
  "updatedAt": "…",
  "backups": [
    { "kind": "daily", "fileId": "…", "fileName": "…", "takenAt": "…",
      "tables": ["User", "Order"], "totalRows": 128, "bytes": 90210,
      "sha256": "…" }
  ]
}
```

## Security model

- **Secrets**: only in Script Properties (encrypted at rest by Google) and
  the app's environment (Vercel). Never in code, never in Drive, never in
  git. `.gitignore` excludes `.env*`.
- **No DB credentials in Google**: the script holds only
  `BACKUP_SHARED_SECRET`, a bearer token valid for exactly two endpoints.
  The endpoints do timing-safe comparison and return `401`/`503` otherwise.
- **Integrity**: the export endpoint hashes the canonical response bytes;
  the script uploads those exact bytes and reports the hash back; the ping
  endpoint rejects (`409`, flags `backup.status=hash_mismatch`) unless the
  hashes match. A tampered or truncated upload cannot pass as a good backup.
- **Drive**: private folder created by the script, never shared; script uses
  the full `drive` OAuth scope (required — `DriveApp.createFolder` at Drive
  root is rejected under `drive.file`; verified live 2026-09-28). The
  folder id is persisted after first creation.
- **OAuth scopes** (see `appsscript.json`): `script.storage`,
  `script.external_request` (UrlFetchApp), `drive`, `script.send_mail`,
  `script.scriptapp` (required for trigger management in `setupAll`).
- **Alerts**: every keepalive/backup failure emails `ADMIN_EMAIL` immediately.
- **Data sensitivity**: snapshots contain the same data as the DB, including
  bcrypt password hashes (non-reversible), OAuth tokens (`Account` table),
  and customer/order records. Treat the Drive folder like production data:
  no sharing, no "anyone with the link".
- **Restore is manual**: no Apps Script restore function, no trigger, no
  HTTP endpoint — a local operator script with an explicit file argument.
  There is no code path that wipes the database on a timer.
- **App surface**: `/api/health` returns status flags only. The backup
  endpoints are bearer-token gated and `Cache-Control: no-store`.

## Free-tier honesty (read this)

- The 10-minute keepalive keeps the app warm and pages you fast when
  something breaks. It does **not** stop Render's free-database 30-day expiry.
  When that day comes, the runbook above restores the latest Drive snapshot to
  a new database in minutes — that is the actual safety net.
- Quotas: 6 minutes max per Apps Script execution; 50 MB max UrlFetchApp
  response. Fine for launch scale (thousands of rows). If a daily backup ever
  approaches either limit, the failure email fires — see "Scaling beyond".
- Keep the Drive folder under your account's storage quota; retention pruning
  (30 daily / 12 weekly) bounds growth.

## Scaling beyond

- If snapshots near the 50 MB fetch cap: export per-table (`?tables=` filter
  exists on the export endpoint) into multiple Drive files, or move the whole
  job to a scheduled GitHub Action / Render cron job using `pg_dump`, keeping
  Drive as the sink via a service account.
- For multi-instance app deploys, replace the in-memory rate limiter noted in
  `src/lib/rate-limit.ts` (unrelated to backups, but on the same hardening list).
