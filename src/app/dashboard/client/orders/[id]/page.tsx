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
import { FeeBreakdownTable } from "@/components/FeeBreakdown";
import { formatCents } from "@/lib/fees";
import {
  canTransition,
  mayTransition,
  type OrderStatus,
} from "@/lib/order-machine";

interface Evidence {
  id: string;
  kind: string;
  url: string;
  caption: string | null;
  createdAt: string;
}
interface Adjustment {
  id: string;
  kind: string;
  amountCents: number;
  description: string;
  status: string;
}
interface OrderDetail {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  rentalSubtotalCents: number;
  bookingFeeCents: number;
  droppingFeeCents: number;
  processingFeeCents: number;
  takeRateCents: number;
  grandTotalCents: number;
  haulerPayoutCents: number;
  refundedRentalCents: number;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryZip: string | null;
  deliveryDate: string;
  deliveryWindow: string | null;
  placementNotes: string | null;
  pickupScheduledAt: string | null;
  createdAt: string;
  listing: { title: string; sizeYards: number | null };
  provider: { name: string | null; phone: string | null; providerProfile: { businessName: string } | null };
  events: Array<{
    id: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actorRole: string | null;
    note: string | null;
    createdAt: string;
    actor: { name: string | null } | null;
  }>;
  evidence: Evidence[];
  adjustments: Adjustment[];
  review: { rating: number; title: string | null; body: string | null } | null;
  dispute: { id: string; reason: string; status: string } | null;
}

const DISPUTABLE: OrderStatus[] = [
  "booked",
  "accepted",
  "dispatched",
  "delivered",
  "in_service",
  "pickup_scheduled",
  "picked_up",
];

export default function ClientOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "green" | "red" | "amber"; text: string } | null>(null);

  // Action forms
  const [pickupDate, setPickupDate] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [rating, setRating] = useState("5");
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [showDispute, setShowDispute] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeDesc, setDisputeDesc] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load order");
      setOrder(json.order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load order");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function postAction(url: string, body: unknown, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      setMessage({ tone: "green", text: success });
      await load();
    } catch (e) {
      setMessage({ tone: "red", text: e instanceof Error ? e.message : "Action failed" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading order…" />;
  if (error || !order) {
    return (
      <div>
        <PageHeader title="Order" />
        <Alert tone="red">{error ?? "Order not found."}</Alert>
        <Link href="/dashboard/client/orders" className="mt-4 inline-block text-sm font-semibold text-emerald-800 hover:underline">
          ← Back to orders
        </Link>
      </div>
    );
  }

  const events: TimelineEvent[] = order.events.map((e) => ({
    id: e.id,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    actorRole: e.actorRole,
    actorName: e.actor?.name,
    note: e.note,
    createdAt: e.createdAt,
  }));

  const canSchedulePickup = canTransition(order.status, "pickup_scheduled") && mayTransition(order.status, "pickup_scheduled", "client");
  const canCancel = canTransition(order.status, "cancelled") && mayTransition(order.status, "cancelled", "client");
  const canReview = order.status === "completed" && !order.review;
  const canDispute = DISPUTABLE.includes(order.status) && !order.dispute;
  const canConfirmDelivery = canTransition(order.status, "in_service") && mayTransition(order.status, "in_service", "client");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Order ${order.orderNumber}`}
        subtitle={`Booked ${new Date(order.createdAt).toLocaleDateString()}`}
        action={<StatusBadge status={order.status} />}
      />
      {message && (
        <Alert tone={message.tone === "green" ? "green" : message.tone === "amber" ? "amber" : "red"}>
          {message.text}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Delivery &amp; pickup</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500">Listing</dt>
              <dd className="text-right font-medium">{order.listing.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500">Hauler</dt>
              <dd className="text-right font-medium">
                {order.provider.providerProfile?.businessName ?? order.provider.name ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500">Delivery address</dt>
              <dd className="text-right font-medium">
                {order.deliveryAddress}, {order.deliveryCity}, {order.deliveryState} {order.deliveryZip ?? ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500">Delivery date</dt>
              <dd className="text-right font-medium">
                {new Date(order.deliveryDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                {order.deliveryWindow ? ` · ${order.deliveryWindow}` : ""}
              </dd>
            </div>
            {order.placementNotes && (
              <div className="flex justify-between gap-4">
                <dt className="text-stone-500">Placement notes</dt>
                <dd className="text-right font-medium">{order.placementNotes}</dd>
              </div>
            )}
            {order.pickupScheduledAt && (
              <div className="flex justify-between gap-4">
                <dt className="text-stone-500">Pickup scheduled</dt>
                <dd className="text-right font-medium">{new Date(order.pickupScheduledAt).toLocaleDateString()}</dd>
              </div>
            )}
          </dl>
        </Card>

        <div>
          <h2 className="mb-3 font-bold text-stone-900">Receipt</h2>
          <FeeBreakdownTable
            showPolicy
            breakdown={{
              rentalSubtotalCents: order.rentalSubtotalCents,
              bookingFeeCents: order.bookingFeeCents,
              droppingFeeCents: order.droppingFeeCents,
              processingFeeCents: order.processingFeeCents,
              takeRateCents: order.takeRateCents,
              grandTotalCents: order.grandTotalCents,
              haulerPayoutCents: order.haulerPayoutCents,
              platformRevenueCents:
                order.bookingFeeCents + order.droppingFeeCents + order.processingFeeCents + order.takeRateCents,
            }}
          />
          {order.refundedRentalCents > 0 && (
            <p className="mt-2 text-sm text-stone-600">
              Refunded rental: <strong>{formatCents(order.refundedRentalCents)}</strong>
            </p>
          )}
        </div>
      </div>

      {order.evidence.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Photo evidence</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {order.evidence.map((p) => (
              <figure key={p.id} className="overflow-hidden rounded-lg border border-stone-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? `${p.kind} photo`} className="aspect-square w-full object-cover" loading="lazy" />
                <figcaption className="px-2 py-1.5 text-xs text-stone-600">
                  <Badge tone="neutral">{p.kind.replace(/_/g, " ")}</Badge>
                  {p.caption && <span className="ml-1">{p.caption}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </Card>
      )}

      {order.adjustments.length > 0 && (
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Adjustments</h2>
          <ul className="space-y-2 text-sm">
            {order.adjustments.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-4 rounded-lg bg-stone-50 px-3 py-2">
                <span>
                  <Badge tone={a.status === "charged" ? "amber" : "neutral"}>{a.status}</Badge>
                  <span className="ml-2 font-medium">{a.kind.replace(/_/g, " ")}</span>
                  <span className="block text-xs text-stone-500">{a.description}</span>
                </span>
                <span className="font-semibold tabular-nums">{formatCents(a.amountCents)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-4 font-bold text-stone-900">Tracking timeline</h2>
        <OrderTimeline events={events} />
      </Card>

      {/* Actions */}
      <Card>
        <h2 className="mb-3 font-bold text-stone-900">Actions</h2>
        <div className="flex flex-wrap gap-3">
          {canConfirmDelivery && (
            <Button
              disabled={busy}
              onClick={() => postAction(`/api/orders/${id}/transition`, { to: "in_service", note: "Client confirmed delivery" }, "Delivery confirmed.")}
            >
              Confirm delivery
            </Button>
          )}
          {canSchedulePickup && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Pickup date" htmlFor="pickup-date">
                <Input
                  id="pickup-date"
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                />
              </Field>
              <Button
                disabled={busy || !pickupDate}
                onClick={() =>
                  postAction(
                    `/api/orders/${id}/transition`,
                    { to: "pickup_scheduled", pickupDate: new Date(pickupDate).toISOString(), note: `Pickup requested for ${pickupDate}` },
                    "Pickup scheduled.",
                  )
                }
              >
                Schedule pickup
              </Button>
            </div>
          )}
          {canCancel && (
            <Button variant="danger" disabled={busy} onClick={() => setShowCancel((v) => !v)}>
              Cancel order
            </Button>
          )}
          {canDispute && (
            <Button variant="outline" disabled={busy} onClick={() => setShowDispute((v) => !v)}>
              Report a problem
            </Button>
          )}
          {!canConfirmDelivery && !canSchedulePickup && !canCancel && !canDispute && !canReview && (
            <p className="text-sm text-stone-500">No actions available for this order right now.</p>
          )}
        </div>

        {showCancel && canCancel && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">Cancel this order?</p>
            <p className="mt-1 text-xs text-red-800">
              The rental refund depends on timing (full &gt;48h, 50% at 24–48h, none &lt;24h or after dispatch).
              Booking, drop-off, and processing fees are never refunded.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Reason (optional)" htmlFor="cancel-reason">
                <Input id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Why are you cancelling?" />
              </Field>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => postAction(`/api/orders/${id}/cancel`, { reason: cancelReason || undefined }, "Order cancelled.")}
              >
                Confirm cancellation
              </Button>
            </div>
          </div>
        )}

        {showDispute && canDispute && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Open a dispute</p>
            <p className="mt-1 text-xs text-amber-800">Escrow is held while the dispute is reviewed by the marketplace team.</p>
            <div className="mt-3 space-y-3">
              <Field label="Reason" htmlFor="dispute-reason">
                <Input id="dispute-reason" value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)} placeholder="e.g. Dumpster never delivered" />
              </Field>
              <Field label="Details" htmlFor="dispute-desc">
                <Textarea id="dispute-desc" rows={3} value={disputeDesc} onChange={(e) => setDisputeDesc(e.target.value)} placeholder="Describe what happened…" />
              </Field>
              <Button
                disabled={busy || disputeReason.trim().length < 5 || disputeDesc.trim().length < 10}
                onClick={() =>
                  postAction("/api/disputes", { orderId: id, reason: disputeReason, description: disputeDesc }, "Dispute opened. Escrow is now held.")
                }
              >
                Submit dispute
              </Button>
            </div>
          </div>
        )}

        {canReview && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
            <p className="text-sm font-semibold text-stone-900">Leave a review</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Rating" htmlFor="review-rating">
                <Select id="review-rating" value={rating} onChange={(e) => setRating(e.target.value)}>
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Title (optional)" htmlFor="review-title">
                <Input id="review-title" value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} placeholder="Great service!" />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Review (optional)" htmlFor="review-body">
                <Textarea id="review-body" rows={3} value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} placeholder="How was the rental?" />
              </Field>
            </div>
            <Button
              className="mt-3"
              disabled={busy}
              onClick={() =>
                postAction("/api/reviews", { orderId: id, rating: Number(rating), title: reviewTitle || undefined, body: reviewBody || undefined }, "Thanks — your review is live.")
              }
            >
              Submit review
            </Button>
          </div>
        )}

        {order.review && (
          <div className="mt-4 rounded-lg bg-stone-50 p-4 text-sm">
            <p className="font-semibold">Your review: {order.review.rating}★ {order.review.title}</p>
            {order.review.body && <p className="mt-1 text-stone-600">{order.review.body}</p>}
          </div>
        )}
        {order.dispute && (
          <div className="mt-4">
            <Alert tone="amber">Dispute open: {order.dispute.reason} (status: {order.dispute.status})</Alert>
          </div>
        )}
      </Card>

      <Link href="/dashboard/client/orders" className="inline-block text-sm font-semibold text-emerald-800 hover:underline">
        ← Back to orders
      </Link>
    </div>
  );
}
