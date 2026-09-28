"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Card, PageHeader, Spinner, EmptyState } from "@/components/ui";
import { KpiCard } from "@/components/admin/KpiCard";
import { RevenueChart, type RevenueDay } from "@/components/admin/RevenueChart";
import { OrdersBarChart, type CategoryCount } from "@/components/admin/OrdersBarChart";
import { formatCents } from "@/lib/fees";

interface StatsResponse {
  kpis: {
    gmvBookedCents: number;
    gmvSettledCents: number;
    feeRevenueCents: { booking: number; dropping: number; processing: number; takeRate: number; total: number };
    escrowOutstandingCents: number;
    payoutsPendingCents: number;
    fillRatePct: number;
    disputeRatePct: number;
    avgTakeRatePct: number;
    bookedCount: number;
    disputeCount: number;
  };
  revenueByDay: RevenueDay[];
  ordersByCategory: CategoryCount[];
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    escrowStatus: string;
    grandTotalCents: number;
    deliveryCity: string;
    createdAt: string;
    client: { name: string | null };
    provider: { name: string | null };
    listing: { title: string; category: string };
  }>;
  slaAlerts: Array<{
    id: string;
    orderNumber: string;
    createdAt: string;
    deliveryCity: string;
    hoursUnaccepted: number;
    client: { name: string | null };
    provider: { name: string | null };
  }>;
}

export function OverviewClient() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Failed to load stats");
        return r.json();
      })
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error)
    return (
      <div>
        <PageHeader title="Admin overview" />
        <Alert tone="red">{error}</Alert>
      </div>
    );
  if (!stats) return <Spinner label="Loading marketplace stats…" />;

  const k = stats.kpis;
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="GMV booked" value={formatCents(k.gmvBookedCents)} sub={`${k.bookedCount} booked orders`} />
        <KpiCard label="GMV settled" value={formatCents(k.gmvSettledCents)} sub="completed + reviewed" />
        <KpiCard label="Platform revenue" value={formatCents(k.feeRevenueCents.total)} sub="all fee types, lifetime" tone="green" />
        <KpiCard label="Payment holds outstanding" value={formatCents(k.escrowOutstandingCents)} sub="rental subtotal held" tone="amber" />
        <KpiCard label="Payouts pending" value={formatCents(k.payoutsPendingCents)} sub="awaiting transfer" />
        <KpiCard label="Fill rate" value={`${k.fillRatePct}%`} sub="accepted+ / booked" />
        <KpiCard label="Dispute rate" value={`${k.disputeRatePct}%`} sub={`${k.disputeCount} disputes`} tone={k.disputeRatePct > 5 ? "red" : "neutral"} />
        <KpiCard label="Avg take rate" value={`${k.avgTakeRatePct}%`} sub="of rental subtotal" />
      </div>

      <Card className="mt-6">
        <h2 className="mb-1 text-lg font-bold text-stone-900">Platform revenue by fee type</h2>
        <p className="mb-4 text-xs text-stone-500">
          Booking {formatCents(k.feeRevenueCents.booking)} · Dropping {formatCents(k.feeRevenueCents.dropping)} · Processing{" "}
          {formatCents(k.feeRevenueCents.processing)} · Take rate {formatCents(k.feeRevenueCents.takeRate)}
        </p>
        <RevenueChart data={stats.revenueByDay} />
      </Card>

      <Card className="mt-6">
        <h2 className="mb-4 text-lg font-bold text-stone-900">Orders by category</h2>
        <OrdersBarChart data={stats.ordersByCategory} />
      </Card>

      {stats.slaAlerts.length > 0 && (
        <div className="mt-6">
          <Alert tone="amber">
          <div className="font-bold">⚠ {stats.slaAlerts.length} SLA breach{stats.slaAlerts.length > 1 ? "es" : ""}: booked &gt; 4h without acceptance</div>
          <ul className="mt-2 space-y-1">
            {stats.slaAlerts.slice(0, 5).map((a) => (
              <li key={a.id} className="text-sm">
                <Link href={`/admin/orders/${a.id}`} className="font-semibold underline">
                  {a.orderNumber}
                </Link>{" "}
                — {a.hoursUnaccepted}h unaccepted ({a.deliveryCity}, {a.provider.name ?? "no provider name"})
              </li>
            ))}
          </ul>
          </Alert>
        </div>
      )}

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">Recent orders</h2>
          <Link href="/admin/orders">
            <Button variant="outline" size="sm">All orders</Button>
          </Link>
        </div>
        {stats.recentOrders.length === 0 ? (
          <EmptyState title="No orders yet" body="Bookings will appear here once customers start checking out." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Client</th>
                  <th className="py-2 pr-4">Listing</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Hold</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.map((o) => (
                  <tr key={o.id} className="border-b border-stone-100 last:border-0">
                    <td className="py-2 pr-4">
                      <Link href={`/admin/orders/${o.id}`} className="font-semibold text-emerald-700 hover:underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{o.client.name ?? "—"}</td>
                    <td className="py-2 pr-4">{o.listing.title}</td>
                    <td className="py-2 pr-4">{o.deliveryCity}</td>
                    <td className="py-2 pr-4 text-right font-medium">{formatCents(o.grandTotalCents)}</td>
                    <td className="py-2 pr-4"><Badge>{o.status}</Badge></td>
                    <td className="py-2"><Badge tone={o.escrowStatus === "held" ? "amber" : "neutral"}>{o.escrowStatus}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
