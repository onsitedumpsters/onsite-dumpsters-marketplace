import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { STATUS_KEYS, checkBackupAuth, writeStatus } from "@/lib/backup";

export const dynamic = "force-dynamic";

/**
 * POST /api/backup/ping
 *
 * Authenticated (Bearer BACKUP_CRON_SECRET) heartbeat + backup-completion
 * reporter, called by the Google Apps Script jobs.
 *
 * Body: {
 *   app_ok: boolean,        // what the script observed on GET /api/health
 *   app_status: number,     // HTTP status the script observed
 *   backup_file?: string,   // Drive file name of the snapshot just uploaded
 *   backup_sha256?: string, // SHA-256 of the uploaded bytes
 *   backup_error?: string,  // set when the script's backup attempt failed
 * }
 *
 * When backup_file/backup_sha256 are present, the hash is compared against
 * the SHA-256 the export endpoint recorded for the canonical payload. A
 * mismatch is rejected (409) and flagged — this proves the bytes in Drive
 * are identical to what the app exported.
 */
export async function POST(req: Request) {
  if (!process.env.BACKUP_CRON_SECRET) {
    return NextResponse.json({ error: "backup not configured" }, { status: 503 });
  }
  if (!checkBackupAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const appOk = body.app_ok === true;
  const appStatus = Number(body.app_status ?? 0);

  const t0 = Date.now();
  let dbOk = true;
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbOk = false;
  }
  const latencyMs = Date.now() - t0;

  const entries: Record<string, string> = {
    [STATUS_KEYS.keepaliveDbOk]: String(dbOk),
    [STATUS_KEYS.keepaliveDbLatencyMs]: String(latencyMs),
    [STATUS_KEYS.keepaliveLastAt]: new Date().toISOString(),
    [STATUS_KEYS.keepaliveAppOk]: String(appOk),
    [STATUS_KEYS.keepaliveAppStatus]: String(appStatus),
  };

  if (typeof body.backup_error === "string" && body.backup_error) {
    entries[STATUS_KEYS.backupStatus] = "error";
  } else if (
    typeof body.backup_file === "string" &&
    typeof body.backup_sha256 === "string"
  ) {
    const expected = await db.systemStatus.findUnique({
      where: { key: STATUS_KEYS.backupLastSha256 },
    });
    if (!expected || expected.value !== body.backup_sha256) {
      entries[STATUS_KEYS.backupStatus] = "hash_mismatch";
      await writeStatus(db, entries);
      return NextResponse.json(
        { ok: false, error: "sha256 mismatch: Drive bytes differ from export" },
        { status: 409 },
      );
    }
    entries[STATUS_KEYS.backupLastFile] = body.backup_file;
    // A verified backup clears any previous failure/mismatch flag.
    entries[STATUS_KEYS.backupStatus] = "ok";
  }

  await writeStatus(db, entries);
  return NextResponse.json({ ok: true });
}
