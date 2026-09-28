"use client";

import { useEffect, useState } from "react";
import { Button, Card, EmptyState, Field, Input, PageHeader, Spinner } from "@/components/ui";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: string;
  actor: { name: string | null; email: string | null } | null;
}

interface AuditResponse {
  logs: AuditEntry[];
  actions: string[];
  pagination: { page: number; perPage: number; total: number; pages: number };
}

export default function AdminAuditPage() {
  const [filters, setFilters] = useState({ action: "", entityType: "", entityId: "" });
  const [applied, setApplied] = useState({ action: "", entityType: "", entityId: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), perPage: "25" });
    if (applied.action) sp.set("action", applied.action);
    if (applied.entityType) sp.set("entityType", applied.entityType);
    if (applied.entityId) sp.set("entityId", applied.entityId);
    fetch(`/api/admin/audit?${sp}`)
      .then((r) => r.json())
      .then((d: AuditResponse) => {
        setData(d);
        setLoading(false);
      });
  }, [applied, page]);

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every admin and money action, who did it, when" />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Action">
            <Input
              list="audit-actions"
              placeholder="e.g. fee_schedule.created"
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            />
            <datalist id="audit-actions">
              {data?.actions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          <Field label="Entity type">
            <Input placeholder="Order, FeeSchedule…" value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })} />
          </Field>
          <Field label="Entity ID">
            <Input placeholder="entity id" value={filters.entityId} onChange={(e) => setFilters({ ...filters, entityId: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => { setPage(1); setApplied(filters); }}>Apply filters</Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : !data || data.logs.length === 0 ? (
        <EmptyState title="No audit entries" body="Admin actions are logged automatically — including the ones you take in this console." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Action</th>
                  <th className="py-2 pr-4">Entity</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id} className="border-b border-stone-100 last:border-0 align-top">
                    <td className="py-2 pr-4 whitespace-nowrap text-xs text-stone-500">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4">{l.actor ? `${l.actor.name ?? "—"} (${l.actor.email ?? "?"})` : <span className="text-stone-400">system</span>}</td>
                    <td className="py-2 pr-4 font-mono text-xs font-semibold">{l.action}</td>
                    <td className="py-2 pr-4 text-xs text-stone-600">
                      {l.entityType ?? "—"}
                      {l.entityId && <span className="block font-mono text-stone-400">{l.entityId}</span>}
                    </td>
                    <td className="py-2">
                      <details className="text-xs">
                        <summary className="cursor-pointer text-emerald-700 hover:underline">metadata</summary>
                        <pre className="mt-1 max-w-[320px] overflow-x-auto rounded bg-stone-50 p-2 text-[11px] text-stone-700">
                          {JSON.stringify(l.metadata ?? {}, null, 2)}
                        </pre>
                      </details>
                      {l.ip && <p className="mt-1 text-[11px] text-stone-400">ip: {l.ip}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
            <span>
              Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} entries
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>Next →</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
