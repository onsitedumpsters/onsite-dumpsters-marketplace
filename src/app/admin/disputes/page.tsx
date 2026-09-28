"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, EmptyState, Field, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { formatCents } from "@/lib/fees";

interface DisputeItem {
  id: string;
  orderNumber: string;
  grandTotalCents: number;
  createdAt: string;
  client: { name: string | null };
  provider: { name: string | null };
  dispute: {
    id: string;
    reason: string;
    description: string;
    status: string;
    slaDueAt: string | null;
    createdAt: string;
  } | null;
}

const OUTCOMES = [
  { value: "resolved_client", label: "Resolve for client (refund rental)" },
  { value: "resolved_provider", label: "Resolve for provider (release payout)" },
  { value: "resolved_split", label: "Split resolution" },
];

function countdown(slaDueAt: string | null): { text: string; tone: "red" | "amber" | "green" } {
  if (!slaDueAt) return { text: "no SLA set", tone: "green" };
  const ms = new Date(slaDueAt).getTime() - Date.now();
  if (ms <= 0) return { text: "SLA BREACHED", tone: "red" };
  const h = Math.floor(ms / 36e5);
  const d = Math.floor(h / 24);
  const text = d > 0 ? `${d}d ${h % 24}h left` : h > 0 ? `${h}h left` : `${Math.floor(ms / 6e4)}m left`;
  return { text, tone: h < 12 ? "red" : h < 36 ? "amber" : "green" };
}

export default function AdminDisputesPage() {
  const [items, setItems] = useState<DisputeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("resolved_split");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/orders?status=disputed&perPage=100")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.orders ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load disputes");
        setLoading(false);
      });
  }, []);

  async function resolve(disputeId: string, orderNumber: string) {
    setResolving(disputeId);
    setError(null);
    setNotice(null);
    // Owned by a sibling: POST /api/disputes/[id]/resolve
    const r = await fetch(`/api/disputes/${disputeId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome, resolutionNotes }),
    });
    const d = await r.json().catch(() => ({}));
    setResolving(null);
    if (!r.ok) {
      setError(d.error ?? `Resolution failed for ${orderNumber}`);
      return;
    }
    setNotice(`Dispute on ${orderNumber} resolved (${outcome}).`);
    setItems(items.filter((i) => i.dispute?.id !== disputeId));
  }

  return (
    <div>
      <PageHeader title="Dispute center" subtitle="Open disputes — 72h SLA resolution clock" />
      {error && <div className="mb-4"><Alert tone="red">{error}</Alert></div>}
      {notice && <div className="mb-4"><Alert tone="green">{notice}</Alert></div>}

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="No open disputes" body="All quiet — disputed orders will appear here with a 72-hour resolution SLA." />
      ) : (
        <div className="space-y-6">
          {items.map((item) => {
            const cd = countdown(item.dispute?.slaDueAt ?? null);
            return (
              <Card key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/admin/disputes/${item.dispute?.id ?? item.id}`} className="text-lg font-bold text-emerald-700 hover:underline">
                      {item.orderNumber}
                    </Link>
                    <p className="text-sm text-stone-500">
                      {item.client.name} (client) ↔ {item.provider.name} (hauler) · {formatCents(item.grandTotalCents)} ·
                      raised {item.dispute ? new Date(item.dispute.createdAt).toLocaleString() : "—"}
                    </p>
                  </div>
                  <Badge tone={cd.tone}>SLA: {cd.text}</Badge>
                </div>

                {item.dispute && (
                  <div className="mt-3 rounded-lg bg-stone-50 p-4 text-sm">
                    <p className="font-semibold">Reason: {item.dispute.reason}</p>
                    <p className="mt-1 text-stone-600">{item.dispute.description}</p>
                    <p className="mt-1"><Badge>{item.dispute.status}</Badge></p>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <Field label="Resolution outcome">
                    <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                      {OUTCOMES.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <div className="lg:col-span-2">
                    <Field label="Resolution notes">
                      <Textarea
                        rows={2}
                        placeholder="Notes shared with both parties…"
                        value={resolutionNotes}
                        onChange={(e) => setResolutionNotes(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                <div className="mt-3">
                  <Button
                    disabled={resolving === item.dispute?.id}
                    onClick={() => item.dispute && resolve(item.dispute.id, item.orderNumber)}
                  >
                    {resolving === item.dispute?.id ? "Resolving…" : "Resolve via /api/disputes/:id/resolve"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
