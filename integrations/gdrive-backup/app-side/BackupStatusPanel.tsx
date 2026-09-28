import { db } from "@/lib/db";

/**
 * Admin dashboard panel: database keepalive + Google Drive backup status.
 * Reads the SystemStatus key/value table written by integrations/gdrive-backup.
 * Server component — place inside the admin dashboard layout.
 */
export default async function BackupStatusPanel() {
  let entries: { key: string; value: string; updatedAt: Date }[] = [];
  let error: string | null = null;
  try {
    entries = await db.systemStatus.findMany({ orderBy: { key: "asc" } });
  } catch {
    error = "SystemStatus table not reachable (migration not applied yet?).";
  }

  const get = (key: string) => entries.find((e) => e.key === key)?.value ?? "—";
  const fmtTime = (v: string) => {
    if (v === "—") return v;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
  };

  const backupOk = get("backup.status") === "ok";
  const dbOk = get("keepalive.db_ok") === "true";
  const appOk = get("keepalive.app_ok") === "true";

  const dot = (ok: boolean) => (
    <span
      aria-label={ok ? "healthy" : "attention"}
      className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`}
    />
  );

  const rows: [string, string][] = [
    ["Database keepalive", `${dbOk ? "reachable" : "UNREACHABLE"} · ${get("keepalive.db_latency_ms")} ms`],
    ["Last keepalive check", fmtTime(get("keepalive.last_at"))],
    ["App health endpoint", `${appOk ? get("keepalive.app_status") : "UNREACHABLE"}`],
    ["Last backup", `${get("backup.last_kind")} · ${fmtTime(get("backup.last_at"))}`],
    ["Backup file", get("backup.last_file")],
    ["Backup rows", get("backup.last_rows")],
    ["Backup SHA-256", `${get("backup.last_sha256").slice(0, 16)}…`],
    ["Last restore", fmtTime(get("restore.last_at"))],
  ];

  return (
    <section aria-label="Backup and keepalive status" className="rounded-xl border p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold">System · Backups</h2>
        <span className="flex items-center gap-1.5 text-sm">{dot(dbOk && appOk && backupOk)} Live</span>
      </div>
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b py-1.5">
              <dt className="text-gray-500">{k}</dt>
              <dd className="truncate font-mono text-xs" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-xs text-gray-500">
        Snapshots are stored as JSON in the private Google Drive folder “OnsiteDumpstersDB”. Details and restore
        runbook: <code>integrations/gdrive-backup/README.md</code>.
      </p>
    </section>
  );
}
