/**
 * Database backup core: export all application tables to a JSON snapshot and
 * restore a snapshot back into PostgreSQL.
 *
 * Used by:
 *  - src/app/api/backup/export/route.ts  (Apps Script calls this over HTTPS)
 *  - scripts/restore-backup.ts           (manual restore runbook)
 *
 * Design notes:
 *  - Export uses raw `SELECT *` so every column is captured without hand-
 *    maintained field lists. Values are serialized to JSON-safe forms.
 *  - Import truncates all tables (CASCADE) then inserts in topological
 *    (FK-safe) order inside a single transaction.
 *  - No BigInt/bytea columns exist in the schema today; both are still
 *    handled defensively with tagged markers.
 */

import { timingSafeEqual } from "crypto";

export const BACKUP_FORMAT_VERSION = 1;

/** Tables in FK-safe INSERT order (parents before children). */
export const BACKUP_TABLES = [
  { table: "User", delegate: "user" },
  { table: "VerificationToken", delegate: "verificationToken" },
  { table: "FeeSchedule", delegate: "feeSchedule" },
  { table: "AdPlacement", delegate: "adPlacement" },
  { table: "SystemStatus", delegate: "systemStatus" },
  { table: "Account", delegate: "account" },
  { table: "Session", delegate: "session" },
  { table: "ProviderProfile", delegate: "providerProfile" },
  { table: "FleetOwnerProfile", delegate: "fleetOwnerProfile" },
  { table: "Container", delegate: "container" },
  { table: "Listing", delegate: "listing" },
  { table: "AdCampaign", delegate: "adCampaign" },
  { table: "Order", delegate: "order" },
  { table: "AdInvoice", delegate: "adInvoice" },
  { table: "OrderEvent", delegate: "orderEvent" },
  { table: "EvidencePhoto", delegate: "evidencePhoto" },
  { table: "Adjustment", delegate: "adjustment" },
  { table: "Dispute", delegate: "dispute" },
  { table: "Review", delegate: "review" },
  { table: "SavedJob", delegate: "savedJob" },
  { table: "VerificationDoc", delegate: "verificationDoc" },
  { table: "AuditLog", delegate: "auditLog" },
  { table: "Notification", delegate: "notification" },
  { table: "Payout", delegate: "payout" },
  { table: "AdEvent", delegate: "adEvent" },
  { table: "LedgerEntry", delegate: "ledgerEntry" },
] as const;

export const BACKUP_TABLE_NAMES: Set<string> = new Set(BACKUP_TABLES.map((t) => t.table));

/** SystemStatus keys — must match integrations/gdrive-backup/app-side/BackupStatusPanel.tsx */
export const STATUS_KEYS = {
  backupStatus: "backup.status",
  backupLastKind: "backup.last_kind",
  backupLastAt: "backup.last_at",
  backupLastFile: "backup.last_file",
  backupLastRows: "backup.last_rows",
  backupLastSha256: "backup.last_sha256",
  keepaliveDbOk: "keepalive.db_ok",
  keepaliveDbLatencyMs: "keepalive.db_latency_ms",
  keepaliveLastAt: "keepalive.last_at",
  keepaliveAppOk: "keepalive.app_ok",
  keepaliveAppStatus: "keepalive.app_status",
  restoreLastAt: "restore.last_at",
} as const;

export const BACKUP_KINDS = ["daily", "weekly", "manual"] as const;
export type BackupKind = (typeof BACKUP_KINDS)[number];

export interface SnapshotTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

export interface DatabaseSnapshot {
  version: number;
  generator: string;
  exportedAt: string;
  kind: string;
  tables: Record<string, SnapshotTable>;
}

// ── Serialization ────────────────────────────────────────────────

function serializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(v))
    return { __type: "buffer", data: v.toString("base64") };
  if (typeof v === "bigint") return { __type: "bigint", data: v.toString() };
  if (typeof v === "number") {
    if (!Number.isFinite(v))
      throw new Error("Refusing to back up non-finite number (NaN/Infinity)");
    return v;
  }
  if (Array.isArray(v)) return v.map(serializeValue);
  if (typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>))
      o[k] = serializeValue(val);
    return o;
  }
  return v;
}

function deserializeValue(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(deserializeValue);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.__type === "buffer" && typeof o.data === "string")
      return Buffer.from(o.data, "base64");
    if (o.__type === "bigint" && typeof o.data === "string") return BigInt(o.data);
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) out[k] = deserializeValue(val);
    return out;
  }
  // ISO-8601 strings are passed through as-is: Prisma accepts them for
  // DateTime fields, and converting eagerly could corrupt plain text that
  // merely looks like a date.
  return v;
}

export function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = serializeValue(v);
  return out;
}

export function deserializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = deserializeValue(v);
  return out;
}

// ── Export ───────────────────────────────────────────────────────

type PrismaLike = {
  $queryRawUnsafe: (sql: string) => Promise<unknown>;
};

export async function exportDatabase(
  prisma: PrismaLike,
  opts?: { kind?: string; tables?: string[] },
): Promise<DatabaseSnapshot> {
  const wanted = opts?.tables ?? BACKUP_TABLES.map((t) => t.table);
  for (const name of wanted) {
    if (!BACKUP_TABLE_NAMES.has(name))
      throw new Error(`Unknown table in backup request: ${name}`);
  }
  const tables: Record<string, SnapshotTable> = {};
  for (const name of wanted) {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT * FROM "${name}"`,
    )) as Record<string, unknown>[];
    tables[name] = {
      columns: rows.length > 0 ? Object.keys(rows[0]) : [],
      rows: rows.map(serializeRow),
    };
  }
  return {
    version: BACKUP_FORMAT_VERSION,
    generator: "onsite-dumpsters-marketplace",
    exportedAt: new Date().toISOString(),
    kind: opts?.kind ?? "manual",
    tables,
  };
}

export function countSnapshotRows(snapshot: DatabaseSnapshot): number {
  return Object.values(snapshot.tables).reduce((n, t) => n + t.rows.length, 0);
}

// ── Import (restore) ─────────────────────────────────────────────

type TxLike = {
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
  [delegate: string]: unknown;
};

function validateSnapshot(snapshot: unknown): asserts snapshot is DatabaseSnapshot {
  if (!snapshot || typeof snapshot !== "object")
    throw new Error("Snapshot is not an object");
  const s = snapshot as Record<string, unknown>;
  if (s.version !== BACKUP_FORMAT_VERSION)
    throw new Error(
      `Unsupported snapshot version ${String(s.version)} (expected ${BACKUP_FORMAT_VERSION})`,
    );
  if (!s.tables || typeof s.tables !== "object")
    throw new Error("Snapshot has no tables object");
  for (const name of Object.keys(s.tables as Record<string, unknown>)) {
    if (!BACKUP_TABLE_NAMES.has(name))
      throw new Error(`Snapshot contains unknown table: ${name}`);
  }
}

export async function importSnapshot(
  prisma: { $transaction: (fn: (tx: TxLike) => Promise<void>, opts?: object) => Promise<void> },
  snapshot: unknown,
): Promise<Record<string, number>> {
  validateSnapshot(snapshot);
  const counts: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      const all = BACKUP_TABLES.map((t) => `"${t.table}"`).join(", ");
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${all} CASCADE`);

      for (const { table, delegate } of BACKUP_TABLES) {
        const entry = snapshot.tables[table];
        const rows = entry ? entry.rows.map(deserializeRow) : [];
        const createMany = (tx[delegate] as {
          createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown>;
        }).createMany;
        if (typeof createMany !== "function")
          throw new Error(`Prisma delegate missing for table ${table}`);
        for (let i = 0; i < rows.length; i += 500) {
          await createMany.call(tx[delegate], { data: rows.slice(i, i + 500) });
        }
        counts[table] = rows.length;
      }
    },
    { maxWait: 30_000, timeout: 300_000 },
  );

  return counts;
}

// ── SystemStatus helpers ─────────────────────────────────────────

type StatusPrisma = {
  systemStatus: {
    upsert: (args: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value: string };
    }) => Promise<unknown>;
  };
};

export async function writeStatus(
  prisma: StatusPrisma,
  entries: Record<string, string>,
): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    await prisma.systemStatus.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
}

// ── Shared-secret auth for the backup HTTP endpoints ─────────────

export function checkBackupAuth(req: Request): boolean {
  const secret = process.env.BACKUP_CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(header.trim());
  if (!m) return false;
  const a = Buffer.from(m[1], "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
