/**
 * Manual database restore from a JSON snapshot produced by /api/backup/export.
 *
 *   npx tsx scripts/restore-backup.ts <snapshot.json>
 *
 * Requires DATABASE_URL in the environment. This is intentionally a local
 * operator script — NOT an HTTP endpoint and NOT on a timer. It truncates
 * every application table (CASCADE) and re-inserts the snapshot rows in
 * FK-safe order inside one transaction, then records restore.last_at in
 * SystemStatus.
 *
 * ALWAYS restore into a disposable database first and verify before touching
 * production. See integrations/gdrive-backup/README.md (restore runbook).
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { STATUS_KEYS, importSnapshot, writeStatus } from "@/lib/backup";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npx tsx scripts/restore-backup.ts <snapshot.json>");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — refusing to run without an explicit target.");
    process.exit(2);
  }

  const snapshot = JSON.parse(readFileSync(file, "utf8")) as unknown;

  const prisma = new PrismaClient();
  try {
    console.log(`Restoring snapshot into database…`);
    const counts = await importSnapshot(prisma, snapshot);
    const total = Object.values(counts).reduce((n, c) => n + c, 0);
    await writeStatus(prisma, { [STATUS_KEYS.restoreLastAt]: new Date().toISOString() });
    console.log(`Restore complete: ${total} rows across ${Object.keys(counts).length} tables.`);
    for (const [table, n] of Object.entries(counts)) {
      if (n > 0) console.log(`  ${table}: ${n}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Restore FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
