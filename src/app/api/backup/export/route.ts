import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  BACKUP_KINDS,
  BACKUP_TABLE_NAMES,
  STATUS_KEYS,
  checkBackupAuth,
  countSnapshotRows,
  exportDatabase,
  writeStatus,
} from "@/lib/backup";

export const dynamic = "force-dynamic";
// Full-table export can take a while on first runs; stay within Vercel limits.
export const maxDuration = 60;

/**
 * GET /api/backup/export?kind=daily|weekly|manual&tables=a,b,c
 *
 * Authenticated (Bearer BACKUP_CRON_SECRET) full-database JSON export.
 * Called by the Google Apps Script backup job over HTTPS — this keeps all
 * database credentials server-side instead of inside Google's script runtime.
 *
 * Writes backup.* keys to SystemStatus and returns the canonical snapshot
 * bytes. The caller uploads those exact bytes to Drive, hashes them, and
 * reports back via /api/backup/ping so we can verify end-to-end integrity.
 */
export async function GET(req: Request) {
  if (!process.env.BACKUP_CRON_SECRET) {
    return NextResponse.json({ error: "backup not configured" }, { status: 503 });
  }
  if (!checkBackupAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "manual";
  if (!(BACKUP_KINDS as readonly string[]).includes(kind)) {
    return NextResponse.json({ error: "invalid kind" }, { status: 400 });
  }

  let tables: string[] | undefined;
  const tablesParam = url.searchParams.get("tables");
  if (tablesParam) {
    tables = tablesParam.split(",").map((t) => t.trim()).filter(Boolean);
    if (tables.length === 0 || tables.some((t) => !BACKUP_TABLE_NAMES.has(t))) {
      return NextResponse.json({ error: "invalid tables filter" }, { status: 400 });
    }
  }

  try {
    const snapshot = await exportDatabase(db, { kind, tables });
    const body = JSON.stringify(snapshot);
    const sha256 = createHash("sha256").update(body, "utf8").digest("hex");

    await writeStatus(db, {
      [STATUS_KEYS.backupStatus]: "ok",
      [STATUS_KEYS.backupLastKind]: kind,
      [STATUS_KEYS.backupLastAt]: snapshot.exportedAt,
      [STATUS_KEYS.backupLastRows]: String(countSnapshotRows(snapshot)),
      [STATUS_KEYS.backupLastSha256]: sha256,
    });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[backup/export] failed:", err);
    try {
      await writeStatus(db, { [STATUS_KEYS.backupStatus]: "error" });
    } catch {
      /* status write is best-effort */
    }
    return NextResponse.json({ error: "export failed" }, { status: 500 });
  }
}
