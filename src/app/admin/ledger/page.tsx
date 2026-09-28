"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { formatCents } from "@/lib/fees";

const TYPES = [
  "charge_authorized", "charge_captured", "fee_booking", "fee_dropping", "fee_processing",
  "fee_take_rate", "hauler_payout", "rental_refund", "adjustment_charge", "dispute_hold",
  "dispute_release", "ad_revenue", "payout_transfer",
];

interface Entry {
  id: string;
  type: string;
  amountCents: number;
  stripeRef: string | null;
  description: string;
  createdAt: string;
  order: { orderNumber: string } | null;
}

interface LedgerResponse {
  entries: Entry[];
  totals: { byType: Record<string, number>; platformRevenueCents: number };
  pagination: { page: number; perPage: number; total: number; pages: number };
}

export default function AdminLedgerPage() {
  const [filters, setFilters] = useState({ type: "", orderId: "", from: "", to: "" });
  const [applied, setApplied] = useState({ type: "", orderId: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), perPage: "25" });
    if (applied.type) sp.set("type", applied.type);
    if (applied.orderId) sp.set("orderId", applied.orderId);
    if (applied.from) sp.set("from", new Date(applied.from).toISOString());
    if (applied.to) sp.set("to", new Date(applied.to).toISOString());
    fetch(`/api/admin/ledger?${sp}`)
      .then((r) => r.json())
      .then((d: LedgerResponse) => {
        setData(d);
        setLoading(false);
      });
  }, [applied, page]);

  return (
    <div>
      <PageHeader
        title="Escrow ledger"
        subtitle="Every money movement in the marketplace"
        action={
          data && (
            <div className="rounded-lg bg-emerald-700 px-4 py-2 text-white">
              <p className="text-xs uppercase tracking-wide text-emerald-100">Platform revenue (filters)</p>
              <p className="text-xl font-bold">{formatCents(data.totals.platformRevenueCents)}</p>
            </div>
          )
        }
      />

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Type">
            <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Order ID">
            <Input placeholder="order id" value={filters.orderId} onChange={(e) => setFilters({ ...filters, orderId: e.target.value })} />
          </Field>
          <Field label="From">
            <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => { setPage(1); setApplied(filters); }}>Apply filters</Button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : !data || data.entries.length === 0 ? (
        <EmptyState title="No ledger entries" body="Entries appear as orders move through checkout, milestones, and refunds." />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Order</th>
                  <th className="py-2 pr-4">Description</th>
                  <th className="py-2 pr-4">Stripe ref</th>
                  <th className="py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e) => (
                  <tr key={e.id} className="border-b border-stone-100 last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap text-xs text-stone-500">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="py-2 pr-4"><Badge>{e.type}</Badge></td>
                    <td className="py-2 pr-4 font-medium">{e.order?.orderNumber ?? "—"}</td>
                    <td className="py-2 pr-4 text-stone-600">{e.description}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-stone-500">{e.stripeRef ?? "—"}</td>
                    <td className={`py-2 text-right font-bold ${e.amountCents < 0 ? "text-red-700" : "text-emerald-800"}`}>
                      {e.amountCents < 0 ? "−" : "+"}{formatCents(Math.abs(e.amountCents))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
            <span>
              Page {data.pagination.page} of {data.pagination.pages} · {data.pagination.total} entries
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= data.pagination.pages} onClick={() => setPage(page + 1)}>Next →</Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-4">
            {Object.entries(data.totals.byType).map(([t, cents]) => (
              <span key={t} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                {t}: {formatCents(cents)}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
