"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  PageHeader,
  Card,
  Button,
  Alert,
  Spinner,
  Input,
  Textarea,
  Select,
  Field,
  Badge,
} from "@/components/ui";
import { StatusBadge } from "@/components/dash/StatusBadge";
import { OrderTimeline, type TimelineEvent } from "@/components/dash/OrderTimeline";
import { EvidenceUploader, type EvidenceKind } from "@/components/dash/EvidenceUploader";
import { allowedTransitions, mayTransition, STATUS_LABELS, type OrderStatus } from "@/lib/order-machine";
import { formatCents } from "@/lib/fees";

const ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  accepted: "Accept job",
  dispatched: "Dispatch driver",
  delivered: "Mark delivered",
  in_service: "Confirm in service",
  picked_up: "Mark picked up",
  completed: "Complete job",
  cancelled: "Cancel job",
  disputed: "Open dispute",
};

const ADJUSTMENT_KINDS = ["overweight", "extra_days", "contamination", "damage", "other"] as const;

interface JobDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string | null;
  deliveryDate: string;
  deliveryWindow: string | null;
  placementNotes: string | null;
  projectType: string | null;
  materialType: string | null;
  pickupScheduledAt: string | null;
  rentalSubtotalCents: number;
  haulerPayoutCents: number;
  takeRateCents: number;
  grandTotalCents: number;
  paymentStatus: string;
  escrowStatus: string;
  listing: { title: string; sizeYards: number | null; includedDays: number; includedTons: number };
  client: { name: string | null; phone: string | null };
  events: Array<{
    id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus;
    actorRole: string | null; note: string | null; createdAt: string;
    actor: { name: string | null } | null;
  }>;
  evidence: Array<{ id: string; kind: string; url: string; caption: string | null }>;
  adjustments: Array<{ id: string; kind: string; amountCents: number; description: string; status: string }>;
  dispute: { id: string; reason: string; status: string } | null;
}

export default function ProviderJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);
  const [transitionNote, setTransitionNote] = useState("");

  // Adjustment form
  const [adjKind, setAdjKind] = useState<(typeof ADJUSTMENT_KINDS)[number]>("overweight");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjDesc, setAdjDesc] = useState("");
  const [showAdj, setShowAdj] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load job");
      setJob(json.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load job");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function transition(to: OrderStatus) {
    setBusy(true);
    setMessage(null);
    try {
      // Cancellation is money-aware (partial capture / rental-only refund) and
      // must go through the dedicated endpoint — never the plain transition.
      const url = to === "cancelled" ? `/api/orders/${id}/cancel` : `/api/orders/${id}/transition`;
      const body =
        to === "cancelled"
          ? { reason: transitionNote || undefined }
          : { to, note: transitionNote || undefined };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Transition failed");
      setTransitionNote("");
      setMessage({ tone: "green", text: `Job moved to “${STATUS_LABELS[to]}”.` });
      await load();
    } catch (e) {
      setMessage({ tone: "red", text: e instanceof Error ? e.message : "Transition failed" });
    } finally {
      setBusy(false);
    }
  }

  async function createAdjustment(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/orders/${id}/adjustments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: adjKind,
          amountCents: Math.round(Number(adjAmount) * 100),
          description: adjDesc,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not create adjustment");
      setAdjAmount("");
      setAdjDesc("");
      setShowAdj(false);
      setMessage({ tone: "green", text: "Adjustment proposed — the client has been notified." });
      await load();
    } catch (e) {
      setMessage({ tone: "red", text: e instanceof Error ? e.message : "Could not create adjustment" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading job…" />;
  if (error || !job) {
    return (
      <div>
        <PageHeader title="Job" />
        <Alert tone="red">{error ?? "Job not found."}</Alert>
      </div>
    );
  }

  const actions = allowedTransitions(job.status).filter((to) => mayTransition(job.status, to, "provider"));
  const events: TimelineEvent[] = job.events.map((e) => ({
    id: e.id,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    actorRole: e.actorRole,
    actorName: e.actor?.name,
    note: e.note,
    createdAt: e.createdAt,
  }));
  const evidenceBy = (kind: string) => job.evidence.filter((p) => p.kind === kind);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Job ${job.orderNumber}`}
        subtitle={`${job.listing.title} · ${job.client.name ?? "Client"}${job.client.phone ? ` · ${job.client.phone}` : ""}`}
        action={<StatusBadge status={job.status} />}
      />
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {job.dispute && <Alert tone="red">Dispute open: {job.dispute.reason} — escrow is held.</Alert>}

      {/* Transition actions */}
      {actions.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Job actions</h2>
          <div className="mb-3 max-w-md">
            <Field label="Note (optional, shown on timeline)" htmlFor="t-note">
              <Input id="t-note" value={transitionNote} onChange={(e) => setTransitionNote(e.target.value)} placeholder="e.g. Driver en route, ETA 20 min" maxLength={500} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((to) => (
              <Button
                key={to}
                disabled={busy}
                variant={to === "cancelled" || to === "disputed" ? "danger" : to === "completed" ? "secondary" : "primary"}
                onClick={() => transition(to)}
              >
                {ACTION_LABELS[to] ?? STATUS_LABELS[to]}
              </Button>
            ))}
          </div>
          {job.status === "dispatched" && evidenceBy("delivery").length === 0 && (
            <p className="mt-2 text-xs text-amber-800">
              Heads up: marking delivered requires at least one delivery photo below.
            </p>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Job details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Delivery</dt><dd className="text-right font-medium">{job.deliveryAddress}, {job.deliveryCity}, {job.deliveryState} {job.deliveryZip ?? ""}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Date / window</dt><dd className="text-right font-medium">{new Date(job.deliveryDate).toLocaleDateString()}{job.deliveryWindow ? ` · ${job.deliveryWindow}` : ""}</dd></div>
            {job.placementNotes && <div className="flex justify-between gap-4"><dt className="text-stone-500">Placement</dt><dd className="text-right font-medium">{job.placementNotes}</dd></div>}
            {job.materialType && <div className="flex justify-between gap-4"><dt className="text-stone-500">Material</dt><dd className="text-right font-medium">{job.materialType}</dd></div>}
            {job.pickupScheduledAt && <div className="flex justify-between gap-4"><dt className="text-stone-500">Pickup scheduled</dt><dd className="text-right font-medium">{new Date(job.pickupScheduledAt).toLocaleDateString()}</dd></div>}
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Included</dt><dd className="text-right font-medium">{job.listing.includedDays} days · {job.listing.includedTons} tons</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Rental subtotal</dt><dd className="text-right font-medium tabular-nums">{formatCents(job.rentalSubtotalCents)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Platform take (8%)</dt><dd className="text-right font-medium tabular-nums">−{formatCents(job.takeRateCents)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Your payout</dt><dd className="text-right font-bold tabular-nums text-emerald-800">{formatCents(job.haulerPayoutCents)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Payment / escrow</dt><dd className="text-right"><Badge tone="neutral">{job.paymentStatus}</Badge> <Badge tone="neutral">{job.escrowStatus}</Badge></dd></div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Photo evidence</h2>
          <div className="space-y-4">
            {(["delivery", "pickup", "weight_ticket"] as EvidenceKind[]).map((kind) => (
              <div key={kind}>
                <EvidenceUploader orderId={id} kind={kind} onUploaded={load} />
                {evidenceBy(kind).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {evidenceBy(kind).map((p) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.id} src={p.url} alt={`${kind} evidence`} className="h-16 w-16 rounded-lg border border-stone-200 object-cover" loading="lazy" />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold text-stone-900">Adjustments</h2>
          <Button size="sm" variant="outline" onClick={() => setShowAdj((v) => !v)}>
            {showAdj ? "Close" : "Propose adjustment"}
          </Button>
        </div>
        {showAdj && (
          <form onSubmit={createAdjustment} className="mb-4 grid gap-3 rounded-lg bg-stone-50 p-4 sm:grid-cols-3">
            <Field label="Kind" htmlFor="adj-kind">
              <Select id="adj-kind" value={adjKind} onChange={(e) => setAdjKind(e.target.value as typeof adjKind)}>
                {ADJUSTMENT_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
              </Select>
            </Field>
            <Field label="Amount (USD)" htmlFor="adj-amount">
              <Input id="adj-amount" type="number" step="0.01" min="0.01" required value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} placeholder="45.00" />
            </Field>
            <div className="sm:col-span-3">
              <Field label="Description" htmlFor="adj-desc">
                <Textarea id="adj-desc" rows={2} required value={adjDesc} onChange={(e) => setAdjDesc(e.target.value)} placeholder="2.5 tons over included weight — see weight ticket photo" maxLength={2000} />
              </Field>
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={busy}>Submit adjustment</Button>
            </div>
          </form>
        )}
        {job.adjustments.length === 0 ? (
          <p className="text-sm text-stone-500">No adjustments on this job.</p>
        ) : (
          <ul className="space-y-2">
            {job.adjustments.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 rounded-lg bg-stone-50 px-3 py-2 text-sm">
                <span>
                  <Badge tone={a.status === "charged" ? "amber" : "neutral"}>{a.status}</Badge>
                  <span className="ml-2 font-medium">{a.kind.replace(/_/g, " ")}</span>
                  <span className="block text-xs text-stone-500">{a.description}</span>
                </span>
                <span className="font-semibold tabular-nums">{formatCents(a.amountCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 font-bold text-stone-900">Timeline</h2>
        <OrderTimeline events={events} />
      </Card>

      <Link href="/dashboard/provider/jobs" className="inline-block text-sm font-semibold text-emerald-800 hover:underline">
        ← Back to dispatch board
      </Link>
    </div>
  );
}
