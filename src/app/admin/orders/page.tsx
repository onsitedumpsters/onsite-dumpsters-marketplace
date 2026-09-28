"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { formatCents } from "@/lib/fees";
import { ORDER_STATUSES } from "@/lib/order-machine";

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  escrowStatus: string;
  grandTotalCents: number;
  deliveryCity: string;
  deliveryDate: string;
  createdAt: string;
  client: { name: string | null };
  provider: { name: string | null };
  listing: { title: string; category: string; sizeYards: number | null };
  dispute: { id: string; status: string } | null;
}

interface ListResponse {
  orders: OrderRow[];
  pagination: { page: number; perPage: number; total: number; pages: number };
}

export default function AdminOrdersPage() {
  const [filters, setFilters] = useState({ status: "", city: "", from: "", to: "" });
  const [applied, setApplied] = useState({ status: "", city: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), perPage: "20" });
    if (applied.status) sp.set("status", applied.status);
    if (applied.city) sp.set("city", applied.city);
    if (applied.from) sp.set("from", new Date(applied.from).toISOString());
    if (applied.to) sp.set("to", new Date(applied.to).toISOString());
    fetch(`/api/admin/orders?${sp}`)
      .then((r) => r.json())
      .then((d: ListResponse) => {
        setData(d);
        setLoading(false);
      });
  }, [applied, page]);

  const apply = () => {
    setPage(1);
    setApplied(filters);
  };

  return (
    <div>
      <PageHeader title="Orders" subtitle="Every booking in the marketplace" />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Status">
            <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="City">
            <Input placeholder="Orlando" value={filters.city} onChange={(e) => setFilters({ ...filters, city: e.target.value })} />
          </Field>
          <Field label="From">
            <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button onClick={apply}>Apply filters</Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : !data || data.orders.length === 0 ? (
        <EmptyState title="No orders match" body="Try widening the filters." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Client</th>
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4">Listing</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4 text-right">Total</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                    <td className="py-2 pr-4">
                      <Link href={`/admin/orders/${o.id}`} className="font-semibold text-emerald-700 hover:underline">
                        {o.orderNumber}
                      </Link>
                      {o.dispute && <Badge tone="red"><span className="ml-1">dispute</span></Badge>}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td className="py-2 pr-4">{o.client.name ?? "—"}</td>
                    <td className="py-2 pr-4">{o.provider.name ?? "—"}</td>
                    <td className="py-2 pr-4">{o.listing.title}</td>
                    <td className="py-2 pr-4">{o.deliveryCity}</td>
                    <td className="py-2 pr-4 text-right font-medium">{formatCents(o.grandTotalCents)}</td>
                    <td className="py-2"><Badge>{o.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
            <span>
              Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} orders
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
