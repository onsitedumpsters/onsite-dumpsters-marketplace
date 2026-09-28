"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { formatCents } from "@/lib/fees";

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  escrowStatus: string;
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
  channel: string;
  createdAt: string;
  client: { name: string | null; email: string | null; phone: string | null };
  provider: { name: string | null; email: string | null; phone: string | null };
  listing: { title: string; category: string; sizeYards: number | null };
  feeSchedule: { version: number };
  events: Array<{ id: string; fromStatus: string | null; toStatus: string; actorRole: string | null; note: string | null; createdAt: string }>;
  ledger: Array<{ id: string; type: string; amountCents: number; stripeRef: string | null; description: string; createdAt: string }>;
  adjustments: Array<{ id: string; kind: string; amountCents: number; description: string; status: string; createdAt: string }>;
  payouts: Array<{ id: string; amountCents: number; status: string; stripeTransferId: string | null; paidAt: string | null; createdAt: string }>;
  dispute: { id: string; reason: string; description: string; status: string; slaDueAt: string | null; createdAt: string } | null;
}

function MoneyRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className={bold ? "font-bold" : "text-stone-600"}>{label}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}

export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { id } = await params;
      const r = await fetch(`/api/admin/orders/${id}`);
      if (!r.ok) {
        setError(r.status === 404 ? "Order not found" : "Failed to load order");
        return;
      }
      const d = await r.json();
      setOrder(d.order);
    })();
  }, [params]);

  if (error)
    return (
      <div>
        <PageHeader title="Order" />
        <Alert tone="red">{error}</Alert>
      </div>
    );
  if (!order) return <Spinner label="Loading order…" />;

  return (
    <div>
      <PageHeader
        title={order.orderNumber}
        subtitle={`${order.listing.title} · booked ${new Date(order.createdAt).toLocaleString()}`}
        action={
          <div className="flex gap-2">
            <Badge>{order.status}</Badge>
            <Badge tone={order.escrowStatus === "held" ? "amber" : "neutral"}>{order.escrowStatus}</Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-bold text-stone-900">Money snapshot (fee schedule v{order.feeSchedule.version})</h2>
          <div className="divide-y divide-stone-100">
            <MoneyRow label="Rental subtotal (held)" value={formatCents(order.rentalSubtotalCents)} />
            <MoneyRow label="Booking fee (non-refundable)" value={formatCents(order.bookingFeeCents)} />
            <MoneyRow label="Dropping fee (non-refundable)" value={formatCents(order.droppingFeeCents)} />
            <MoneyRow label="Processing fee (non-refundable)" value={formatCents(order.processingFeeCents)} />
            <MoneyRow label="Take rate (deducted from payout)" value={formatCents(order.takeRateCents)} />
            <MoneyRow label="Grand total (customer)" value={formatCents(order.grandTotalCents)} bold />
            <MoneyRow label="Hauler payout" value={formatCents(order.haulerPayoutCents)} bold />
            <MoneyRow label="Refunded rental" value={formatCents(order.refundedRentalCents)} />
          </div>
          <p className="mt-3 text-xs text-stone-500">
            Platform revenue on this order: {formatCents(order.bookingFeeCents + order.droppingFeeCents + order.processingFeeCents + order.takeRateCents)}.
            All platform fees are non-refundable.
          </p>
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-bold text-stone-900">Parties & job</h2>
          <dl className="space-y-2 text-sm">
            <div><dt className="font-semibold text-stone-500">Client</dt><dd>{order.client.name} · {order.client.email} · {order.client.phone ?? "no phone"}</dd></div>
            <div><dt className="font-semibold text-stone-500">Provider</dt><dd>{order.provider.name} · {order.provider.email} · {order.provider.phone ?? "no phone"}</dd></div>
            <div><dt className="font-semibold text-stone-500">Delivery</dt><dd>{order.deliveryAddress}, {order.deliveryCity}, {order.deliveryState} {order.deliveryZip ?? ""}</dd></div>
            <div><dt className="font-semibold text-stone-500">Delivery date</dt><dd>{new Date(order.deliveryDate).toLocaleString()}{order.deliveryWindow ? ` (${order.deliveryWindow})` : ""}</dd></div>
            <div><dt className="font-semibold text-stone-500">Channel / payment</dt><dd>{order.channel} · {order.paymentStatus}</dd></div>
          </dl>
        </Card>
      </div>

      {order.dispute && (
        <Card className="mt-6">
          <h2 className="mb-2 text-lg font-bold text-stone-900">Dispute <Badge tone="red">{order.dispute.status}</Badge></h2>
          <p className="text-sm"><span className="font-semibold">Reason:</span> {order.dispute.reason}</p>
          <p className="mt-1 text-sm text-stone-600">{order.dispute.description}</p>
          <Link href="/admin/disputes" className="mt-3 inline-block text-sm font-semibold text-emerald-700 hover:underline">
            Open in dispute center →
          </Link>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg font-bold text-stone-900">Timeline</h2>
          {order.events.length === 0 ? (
            <EmptyState title="No events" />
          ) : (
            <ol className="space-y-3">
              {order.events.map((e) => (
                <li key={e.id} className="border-l-2 border-emerald-600 pl-3 text-sm">
                  <p className="font-semibold">
                    {e.fromStatus ? `${e.fromStatus} → ` : ""}{e.toStatus}
                    {e.actorRole && <span className="ml-2 text-xs font-normal text-stone-500">by {e.actorRole}</span>}
                  </p>
                  {e.note && <p className="text-stone-600">{e.note}</p>}
                  <p className="text-xs text-stone-400">{new Date(e.createdAt).toLocaleString()}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-bold text-stone-900">Ledger entries</h2>
          {order.ledger.length === 0 ? (
            <EmptyState title="No ledger entries" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4 text-right">Amount</th>
                    <th className="py-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {order.ledger.map((l) => (
                    <tr key={l.id} className="border-b border-stone-100 last:border-0" title={l.description}>
                      <td className="py-2 pr-4 font-mono text-xs">{l.type}</td>
                      <td className={`py-2 pr-4 text-right font-medium ${l.amountCents < 0 ? "text-red-700" : "text-emerald-800"}`}>
                        {l.amountCents < 0 ? "−" : "+"}{formatCents(Math.abs(l.amountCents))}
                      </td>
                      <td className="py-2 text-xs text-stone-500">{new Date(l.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {order.adjustments.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 font-bold text-stone-900">Adjustments</h3>
              <ul className="space-y-2 text-sm">
                {order.adjustments.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span>{a.kind} — {a.description} <Badge>{a.status}</Badge></span>
                    <span className="font-medium">{formatCents(a.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {order.payouts.length > 0 && (
            <>
              <h3 className="mb-2 mt-6 font-bold text-stone-900">Payouts</h3>
              <ul className="space-y-2 text-sm">
                {order.payouts.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span><Badge>{p.status}</Badge>{p.stripeTransferId && <span className="ml-1 font-mono text-xs text-stone-500">{p.stripeTransferId}</span>}</span>
                    <span className="font-medium">{formatCents(p.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
