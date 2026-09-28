"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { formatCents } from "@/lib/fees";

interface Placement {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  durationDays: number;
  maxSlots: number;
  active: boolean;
  liveCampaigns: number;
  pendingCampaigns: number;
}

interface CampaignStat {
  id: string;
  title: string;
  status: string;
  owner: { name: string | null; email: string };
  placement: { code: string; name: string };
  listingTitle: string | null;
  startsAt: string;
  endsAt: string;
  paidAt: string | null;
  impressions: number;
  clicks: number;
  ctrPct: number;
  attributedBookings: number;
  revenueCents: number;
}

export default function AdminAdsPage() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignStat[]>([]);
  const [moderationQueue, setModerationQueue] = useState<CampaignStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Placement form (create)
  const [pForm, setPForm] = useState({ code: "", name: "", description: "", priceCents: 4900, durationDays: 7, maxSlots: 3, active: true });
  // Placement edit state: id -> draft
  const [editing, setEditing] = useState<Record<string, Partial<Placement>>>({});
  // Moderation state: campaignId -> reason
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([fetch("/api/admin/ads/placements"), fetch("/api/admin/ads/stats")])
      .then(async ([pr, cr]) => {
        const pd = await pr.json();
        const cd = await cr.json();
        setPlacements(pd.placements ?? []);
        setCampaigns(cd.campaigns ?? []);
        setModerationQueue(cd.moderationQueue ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load ads data");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createPlacement(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const r = await fetch("/api/admin/ads/placements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pForm),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error ?? "Failed to create placement");
      return;
    }
    setNotice(`Placement "${d.placement.name}" created.`);
    setPForm({ code: "", name: "", description: "", priceCents: 4900, durationDays: 7, maxSlots: 3, active: true });
    load();
  }

  async function savePlacement(p: Placement) {
    const draft = editing[p.id];
    if (!draft || Object.keys(draft).length === 0) return;
    setError(null);
    const r = await fetch(`/api/admin/ads/placements/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error ?? "Failed to update placement");
      return;
    }
    setEditing((prev) => ({ ...prev, [p.id]: {} }));
    setNotice(`Placement "${p.code}" updated.`);
    load();
  }

  async function moderate(c: CampaignStat, decision: "active" | "rejected") {
    const reason = reasons[c.id] ?? "";
    if (decision === "rejected" && !reason.trim()) {
      setError("A rejection reason is required");
      return;
    }
    setError(null);
    setNotice(null);
    const r = await fetch(`/api/admin/ads/campaigns/${c.id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reason: reason || undefined }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error ?? "Moderation failed");
      return;
    }
    setNotice(`Campaign "${c.title}" ${decision === "active" ? "approved and live" : "rejected"}.`);
    load();
  }

  const statusTone = (s: string): "green" | "amber" | "red" | "blue" | "neutral" =>
    s === "active" ? "green" : s === "pending_approval" ? "amber" : s === "rejected" ? "red" : s === "ended" ? "blue" : "neutral";

  return (
    <div>
      <PageHeader title="Ads & Promote" subtitle="Ad inventory, creative moderation, and campaign performance" />
      {error && <div className="mb-4"><Alert tone="red">{error}</Alert></div>}
      {notice && <div className="mb-4"><Alert tone="green">{notice}</Alert></div>}

      {loading ? (
        <Spinner />
      ) : (
        <>
          <h2 className="mb-3 text-lg font-bold text-stone-900">Moderation queue ({moderationQueue.length})</h2>
          {moderationQueue.length === 0 ? (
            <EmptyState title="Nothing awaiting approval" />
          ) : (
            <div className="space-y-4">
              {moderationQueue.map((c) => (
                <Card key={c.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-stone-900">{c.title}</p>
                      <p className="text-sm text-stone-500">
                        {c.owner.name} · {c.owner.email} · {c.placement.name}
                        {c.listingTitle ? ` · listing: ${c.listingTitle}` : ""}
                      </p>
                      <p className="text-xs text-stone-400">
                        {new Date(c.startsAt).toLocaleDateString()} → {new Date(c.endsAt).toLocaleDateString()}
                        {c.paidAt ? " · paid" : " · unpaid"}
                      </p>
                    </div>
                    <Badge tone="amber">pending_approval</Badge>
                  </div>
                  <div className="mt-3">
                    <Field label="Rejection reason (required to reject)">
                      <Textarea
                        rows={2}
                        value={reasons[c.id] ?? ""}
                        onChange={(e) => setReasons({ ...reasons, [c.id]: e.target.value })}
                        placeholder="Why is this creative being rejected?"
                      />
                    </Field>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => moderate(c, "active")}>Approve → active</Button>
                    <Button size="sm" variant="danger" onClick={() => moderate(c, "rejected")}>Reject</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <h2 className="mb-3 mt-8 text-lg font-bold text-stone-900">Ad placements</h2>
          <Card className="mb-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Price</th>
                    <th className="py-2 pr-4">Duration</th>
                    <th className="py-2 pr-4">Max slots</th>
                    <th className="py-2 pr-4">Live</th>
                    <th className="py-2 pr-4">Active</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {placements.map((p) => {
                    const draft = editing[p.id] ?? {};
                    return (
                      <tr key={p.id} className="border-b border-stone-100 last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs">{p.code}</td>
                        <td className="py-2 pr-4">
                          <Input
                            value={draft.name ?? p.name}
                            onChange={(e) => setEditing({ ...editing, [p.id]: { ...draft, name: e.target.value } })}
                            className="min-w-[140px]"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            type="number"
                            min={0}
                            value={draft.priceCents ?? p.priceCents}
                            onChange={(e) => setEditing({ ...editing, [p.id]: { ...draft, priceCents: Number(e.target.value) } })}
                            className="w-28"
                          />
                          <p className="mt-0.5 text-xs text-stone-400">{formatCents(draft.priceCents ?? p.priceCents)}</p>
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            type="number"
                            min={1}
                            value={draft.durationDays ?? p.durationDays}
                            onChange={(e) => setEditing({ ...editing, [p.id]: { ...draft, durationDays: Number(e.target.value) } })}
                            className="w-20"
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            type="number"
                            min={1}
                            value={draft.maxSlots ?? p.maxSlots}
                            onChange={(e) => setEditing({ ...editing, [p.id]: { ...draft, maxSlots: Number(e.target.value) } })}
                            className="w-20"
                          />
                        </td>
                        <td className="py-2 pr-4">{p.liveCampaigns} live · {p.pendingCampaigns} pending</td>
                        <td className="py-2 pr-4">
                          <Select
                            value={String(draft.active ?? p.active)}
                            onChange={(e) => setEditing({ ...editing, [p.id]: { ...draft, active: e.target.value === "true" } })}
                          >
                            <option value="true">active</option>
                            <option value="false">disabled</option>
                          </Select>
                        </td>
                        <td className="py-2">
                          <Button size="sm" variant="outline" onClick={() => savePlacement(p)}>Save</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="mb-8">
            <h3 className="mb-3 font-bold text-stone-900">New placement</h3>
            <form onSubmit={createPlacement} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Code" hint="lowercase_underscore">
                <Input required value={pForm.code} onChange={(e) => setPForm({ ...pForm, code: e.target.value })} />
              </Field>
              <Field label="Name">
                <Input required value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} />
              </Field>
              <Field label="Price (cents)" hint={formatCents(pForm.priceCents)}>
                <Input type="number" min={0} value={pForm.priceCents} onChange={(e) => setPForm({ ...pForm, priceCents: Number(e.target.value) })} />
              </Field>
              <Field label="Duration (days)">
                <Input type="number" min={1} value={pForm.durationDays} onChange={(e) => setPForm({ ...pForm, durationDays: Number(e.target.value) })} />
              </Field>
              <Field label="Max slots">
                <Input type="number" min={1} value={pForm.maxSlots} onChange={(e) => setPForm({ ...pForm, maxSlots: Number(e.target.value) })} />
              </Field>
              <Field label="Description" hint="shown to advertisers">
                <Input value={pForm.description} onChange={(e) => setPForm({ ...pForm, description: e.target.value })} />
              </Field>
              <div className="flex items-end lg:col-span-2">
                <Button type="submit">Create placement</Button>
              </div>
            </form>
          </Card>

          <h2 className="mb-3 text-lg font-bold text-stone-900">Campaign performance</h2>
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet" body="Fleet owners and providers can buy placements from the Promote dashboard." />
          ) : (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                      <th className="py-2 pr-4">Campaign</th>
                      <th className="py-2 pr-4">Placement</th>
                      <th className="py-2 pr-4">Owner</th>
                      <th className="py-2 pr-4 text-right">Impr.</th>
                      <th className="py-2 pr-4 text-right">Clicks</th>
                      <th className="py-2 pr-4 text-right">CTR</th>
                      <th className="py-2 pr-4 text-right">Bookings</th>
                      <th className="py-2 pr-4 text-right">Revenue</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.id} className="border-b border-stone-100 last:border-0">
                        <td className="py-2 pr-4 font-medium">{c.title}</td>
                        <td className="py-2 pr-4 text-xs text-stone-500">{c.placement.name}</td>
                        <td className="py-2 pr-4 text-xs text-stone-500">{c.owner.email}</td>
                        <td className="py-2 pr-4 text-right">{c.impressions.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{c.clicks.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right">{c.ctrPct}%</td>
                        <td className="py-2 pr-4 text-right">{c.attributedBookings}</td>
                        <td className="py-2 pr-4 text-right font-medium">{formatCents(c.revenueCents)}</td>
                        <td className="py-2"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
