"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Badge, Button, Card, Field, PageHeader, Select, Spinner, Textarea, Input } from "@/components/ui";
import { formatCents } from "@/lib/fees";

const OUTCOMES = [
  { value: "resolved_client", label: "Resolve for client (refund rental)" },
  { value: "resolved_provider", label: "Resolve for provider (release payout)" },
  { value: "resolved_split", label: "Split resolution" },
];

interface Detail {
  dispute: {
    id: string;
    reason: string;
    description: string;
    amountCents: number | null;
    status: string;
    resolutionNotes: string | null;
    slaDueAt: string | null;
    createdAt: string;
    resolvedAt: string | null;
    raisedBy: { name: string | null; email: string | null };
    order: {
      id: string;
      orderNumber: string;
      status: string;
      paymentStatus: string;
      escrowStatus: string;
      rentalSubtotalCents: number;
      grandTotalCents: number;
      refundedRentalCents: number;
      deliveryAddress: string;
      deliveryCity: string;
      deliveryState: string;
      deliveryZip: string | null;
      deliveryDate: string;
      client: { name: string | null; email: string | null };
      provider: { name: string | null; email: string | null };
      listing: { slug: string; title: string };
      evidence: { id: string; kind: string; url: string; createdAt: string }[];
      adjustments: { id: string; kind: string; amountCents: number; status: string; description: string }[];
      events: { id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }[];
      payouts: { id: string; amountCents: number; status: string; createdAt: string }[];
    };
  };
  ledger: { id: string; type: string; amountCents: number; description: string; createdAt: string }[];
}

export default function AdminDisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("resolved_split");
  const [notes, setNotes] = useState("");
  const [refund, setRefund] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/disputes/${id}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Failed to load dispute");
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dispute");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    if (notes.trim().length < 5) {
      setError("Resolution notes are required (min 5 characters).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/disputes/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          notes: notes.trim(),
          refundRentalCents: Math.round(Number(refund || 0) * 100),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Resolution failed");
      setNotice("Dispute resolved. Returning to the dispute center…");
      setTimeout(() => router.push("/admin/disputes"), 1200);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Resolution failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) {
    return (
      <div>
        <PageHeader title="Dispute" />
        <Alert tone="red">{error}</Alert>
      </div>
    );
  }
  if (!data) return <Spinner label="Loading dispute…" />;

  const { dispute: d, ledger } = data;
  const o = d.order;
  const open = d.status === "open" || d.status === "under_review";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Dispute — ${o.orderNumber}`}
        subtitle={`Raised by ${d.raisedBy.name ?? d.raisedBy.email ?? "—"} · ${new Date(d.createdAt).toLocaleString()}`}
        action={
          <Link href="/admin/disputes" className="text-sm font-semibold text-emerald-800 hover:underline">
            ← Dispute center
          </Link>
        }
      />
      {error && <Alert tone="red">{error}</Alert>}
      {notice && <Alert tone="green">{notice}</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-2 font-bold text-stone-900">Dispute details</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>{d.status}</Badge>
            <Badge tone="amber">Reason: {d.reason}</Badge>
            {d.slaDueAt && <Badge>SLA due {new Date(d.slaDueAt).toLocaleString()}</Badge>}
          </div>
          <p className="mt-3 text-sm text-stone-700">{d.description}</p>
          {d.amountCents != null && (
            <p className="mt-2 text-sm font-semibold text-stone-900">
              Amount in dispute: {formatCents(d.amountCents)}
            </p>
          )}
          {d.resolutionNotes && (
            <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-stone-700">
              <p className="font-semibold text-emerald-900">Resolution notes</p>
              <p className="mt-1">{d.resolutionNotes}</p>
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-bold text-stone-900">Money at a glance</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-stone-500">Grand total</dt><dd className="font-semibold">{formatCents(o.grandTotalCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Rental subtotal</dt><dd className="font-semibold">{formatCents(o.rentalSubtotalCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Already refunded</dt><dd className="font-semibold">{formatCents(o.refundedRentalCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Order status</dt><dd><Badge>{o.status}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Payment</dt><dd><Badge>{o.paymentStatus}</Badge></dd></div>
            <div className="flex justify-between"><dt className="text-stone-500">Hold</dt><dd><Badge>{o.escrowStatus}</Badge></dd></div>
          </dl>
          <div className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
            <p>Client: {o.client.name ?? o.client.email}</p>
            <p>Hauler: {o.provider.name ?? o.provider.email}</p>
            <p className="mt-1">
              <Link href={`/listings/${o.listing.slug}`} className="font-semibold text-emerald-700 hover:underline">
                {o.listing.title}
              </Link>
            </p>
            <p className="mt-1">
              {o.deliveryAddress}, {o.deliveryCity}, {o.deliveryState} {o.deliveryZip ?? ""} ·{" "}
              {new Date(o.deliveryDate).toLocaleDateString()}
            </p>
          </div>
        </Card>
      </div>

      {o.evidence.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Evidence photos ({o.evidence.length})</h2>
          <div className="flex flex-wrap gap-2">
            {o.evidence.map((ev) => (
              <a key={ev.id} href={ev.url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ev.url} alt={`${ev.kind} evidence`} className="h-24 w-24 rounded-lg border border-stone-200 object-cover" loading="lazy" />
              </a>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Order timeline</h2>
          <ol className="space-y-2 text-sm">
            {o.events.map((ev) => (
              <li key={ev.id} className="flex items-start justify-between gap-3">
                <span className="text-stone-700">
                  {ev.fromStatus ? `${ev.fromStatus} → ` : ""}
                  <strong>{ev.toStatus}</strong>
                  {ev.note && <span className="text-stone-500"> — {ev.note}</span>}
                </span>
                <span className="shrink-0 text-xs text-stone-400">{new Date(ev.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Ledger activity</h2>
          {ledger.length === 0 ? (
            <p className="text-sm text-stone-500">No ledger entries for this order.</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {ledger.map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3">
                  <span className="text-stone-700">
                    <strong>{l.type}</strong>
                    <span className="text-stone-500"> — {l.description}</span>
                  </span>
                  <span className="shrink-0 font-semibold">{formatCents(l.amountCents)}</span>
                </li>
              ))}
            </ol>
          )}
          {o.adjustments.length > 0 && (
            <div className="mt-3 border-t border-stone-100 pt-3">
              <p className="mb-1 text-xs font-semibold uppercase text-stone-500">Adjustments</p>
              {o.adjustments.map((a) => (
                <p key={a.id} className="text-sm text-stone-700">
                  {a.kind} · {formatCents(a.amountCents)} · <Badge>{a.status}</Badge>
                </p>
              ))}
            </div>
          )}
        </Card>
      </div>

      {open && (
        <Card>
          <h2 className="mb-4 font-bold text-stone-900">Resolve dispute</h2>
          <form onSubmit={resolve} className="grid gap-4 sm:grid-cols-3">
            <Field label="Outcome" htmlFor="res-outcome">
              <Select id="res-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                {OUTCOMES.map((x) => (
                  <option key={x.value} value={x.value}>{x.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Rental refund to client ($)" htmlFor="res-refund">
              <Input
                id="res-refund"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={refund}
                onChange={(e) => setRefund(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Resolution notes (shared with both parties)" htmlFor="res-notes">
                <Textarea
                  id="res-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={5000}
                  placeholder="Explain the decision and any amounts…"
                />
              </Field>
            </div>
            <div className="sm:col-span-1 flex items-end">
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Resolving…" : "Resolve dispute"}
              </Button>
            </div>
          </form>
          <p className="mt-2 text-xs text-stone-500">
            Platform fees are never refunded as part of a dispute outcome. The held payment stays frozen until resolution.
          </p>
        </Card>
      )}
    </div>
  );
}
