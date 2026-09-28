"use client";

import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";

const ROLES = ["client", "provider", "fleet_owner", "admin"];

interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  role: string;
  phone: string | null;
  createdAt: string;
  providerProfile: { businessName: string; verificationStatus: string } | null;
  fleetProfile: { companyName: string } | null;
  _count: { clientOrders: number; providerOrders: number };
}

interface UsersResponse {
  users: AdminUser[];
  pagination: { page: number; perPage: number; total: number; pages: number };
}

const vTone = (s: string): "green" | "amber" | "red" | "neutral" =>
  s === "approved" ? "green" : s === "pending" ? "amber" : s === "rejected" || s === "suspended" ? "red" : "neutral";

export default function AdminUsersPage() {
  const [filters, setFilters] = useState({ role: "", search: "" });
  const [applied, setApplied] = useState({ role: "", search: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), perPage: "25" });
    if (applied.role) sp.set("role", applied.role);
    if (applied.search) sp.set("search", applied.search);
    fetch(`/api/admin/users?${sp}`)
      .then((r) => r.json())
      .then((d: UsersResponse) => {
        setData(d);
        setLoading(false);
      });
  }, [applied, page]);

  async function changeRole(u: AdminUser) {
    const role = roleDraft[u.id] ?? u.role;
    if (role === u.role) return;
    setBusy(u.id);
    setError(null);
    setNotice(null);
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, role }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      setError(d.error ?? "Role change failed");
      return;
    }
    setNotice(`${u.email} is now ${d.user.role}.`);
    setData((prev) =>
      prev ? { ...prev, users: prev.users.map((x) => (x.id === u.id ? { ...x, role: d.user.role } : x)) } : prev,
    );
  }

  async function suspend(u: AdminUser) {
    if (!confirm(`Suspend provider ${u.email}? They will be unable to accept new bookings.`)) return;
    setBusy(u.id);
    setError(null);
    setNotice(null);
    const r = await fetch("/api/admin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id, decision: "suspended", notes: "Suspended by admin from Users console" }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      setError(d.error ?? "Suspension failed");
      return;
    }
    setNotice(`${u.email} suspended.`);
    setData((prev) =>
      prev
        ? {
            ...prev,
            users: prev.users.map((x) =>
              x.id === u.id && x.providerProfile
                ? { ...x, providerProfile: { ...x.providerProfile, verificationStatus: "suspended" } }
                : x,
            ),
          }
        : prev,
    );
  }

  return (
    <div>
      <PageHeader title="Users" subtitle="Roles, accounts, and provider suspension" />
      {error && <div className="mb-4"><Alert tone="red">{error}</Alert></div>}
      {notice && <div className="mb-4"><Alert tone="green">{notice}</Alert></div>}

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Role">
            <Select value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <Field label="Search">
            <Input placeholder="name or email" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => { setPage(1); setApplied(filters); }}>Apply filters</Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : !data || data.users.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-4">User</th>
                  <th className="py-2 pr-4">Business</th>
                  <th className="py-2 pr-4">Orders</th>
                  <th className="py-2 pr-4">Joined</th>
                  <th className="py-2 pr-4">Verification</th>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b border-stone-100 last:border-0">
                    <td className="py-2 pr-4">
                      <p className="font-medium">{u.name ?? "—"}</p>
                      <p className="text-xs text-stone-500">{u.email}</p>
                    </td>
                    <td className="py-2 pr-4 text-xs text-stone-600">
                      {u.providerProfile?.businessName ?? u.fleetProfile?.companyName ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs text-stone-600">
                      {u._count.clientOrders} as client · {u._count.providerOrders} as provider
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-xs text-stone-500">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4">
                      {u.providerProfile ? (
                        <Badge tone={vTone(u.providerProfile.verificationStatus)}>{u.providerProfile.verificationStatus}</Badge>
                      ) : (
                        <span className="text-xs text-stone-400">n/a</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <Select
                        value={roleDraft[u.id] ?? u.role}
                        onChange={(e) => setRoleDraft({ ...roleDraft, [u.id]: e.target.value })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === u.id || (roleDraft[u.id] ?? u.role) === u.role}
                          onClick={() => changeRole(u)}
                        >
                          {busy === u.id ? "Saving…" : "Save role"}
                        </Button>
                        {u.role === "provider" && u.providerProfile && u.providerProfile.verificationStatus !== "suspended" && (
                          <Button size="sm" variant="danger" disabled={busy === u.id} onClick={() => suspend(u)}>
                            Suspend
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
            <span>
              Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} users
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
