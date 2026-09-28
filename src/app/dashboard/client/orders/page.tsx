"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Select, Spinner } from "@/components/ui";
import { StatusBadge } from "@/components/dash/StatusBadge";
import { DataTable } from "@/components/dash/DataTable";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/order-machine";
import { formatCents } from "@/lib/fees";

interface OrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotalCents: number;
  deliveryDate: string;
  createdAt: string;
  listing: { title: string; sizeYards: number | null };
  provider: { name: string | null; providerProfile: { businessName: string } | null };
}

export default function ClientOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = status ? `?status=${status}` : "";
      const res = await fetch(`/api/orders${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load orders");
      setOrders(json.orders);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader title="My Orders" subtitle="Track bookings, receipts, and photo evidence." />
      <div className="mb-4 max-w-xs">
        <label htmlFor="status-filter" className="mb-1 block text-sm font-semibold text-stone-700">
          Filter by status
        </label>
        <Select id="status-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </div>
      {loading ? (
        <Spinner label="Loading orders…" />
      ) : error ? (
        <p className="text-sm text-red-700" role="alert">{error}</p>
      ) : (
        <DataTable<OrderRow>
          data={orders}
          rowKey={(r) => r.id}
          emptyTitle="No orders yet"
          emptyBody="When you book a dumpster, it will show up here with live tracking."
          columns={[
            {
              header: "Order",
              render: (r) => (
                <Link href={`/dashboard/client/orders/${r.id}`} className="font-semibold text-emerald-800 hover:underline">
                  {r.orderNumber}
                </Link>
              ),
            },
            {
              header: "Listing",
              render: (r) => (
                <span>
                  {r.listing.title}
                  <span className="block text-xs text-stone-500">
                    {r.provider.providerProfile?.businessName ?? r.provider.name ?? "Hauler"}
                  </span>
                </span>
              ),
            },
            {
              header: "Delivery",
              render: (r) => new Date(r.deliveryDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
            },
            {
              header: "Total",
              className: "text-right",
              render: (r) => <span className="tabular-nums font-medium">{formatCents(r.grandTotalCents)}</span>,
            },
            { header: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}
    </div>
  );
}
