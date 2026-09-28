"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { formatCents } from "@/lib/fees";

interface ContributionRow {
  city: string;
  category: string;
  channel: string;
  orders: number;
  gmvCents: number;
  platformRevenueCents: number;
  payoutsCents: number;
  refundsCents: number;
  cardCostEstCents: number;
  contributionCents: number;
  fillRatePct: number;
  acceptRatePct: number;
  onTimeRatePct: number;
}

export default function AdminReportsPage() {
  const [rows, setRows] = useState<ContributionRow[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/reports")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load report");
        return r.json();
      })
      .then((d) => {
        setRows(d.rows ?? []);
        setGeneratedAt(d.generatedAt ?? null);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const totals = rows.reduce(
    (s, r) => ({
      orders: s.orders + r.orders,
      gmvCents: s.gmvCents + r.gmvCents,
      platformRevenueCents: s.platformRevenueCents + r.platformRevenueCents,
      payoutsCents: s.payoutsCents + r.payoutsCents,
      refundsCents: s.refundsCents + r.refundsCents,
      cardCostEstCents: s.cardCostEstCents + r.cardCostEstCents,
      contributionCents: s.contributionCents + r.contributionCents,
    }),
    { orders: 0, gmvCents: 0, platformRevenueCents: 0, payoutsCents: 0, refundsCents: 0, cardCostEstCents: 0, contributionCents: 0 },
  );

  return (
    <div>
      <PageHeader
        title="Contribution report"
        subtitle={`By city × category × channel${generatedAt ? ` · generated ${new Date(generatedAt).toLocaleString()}` : ""}`}
        action={
          <a href="/api/admin/reports/export">
            <Button>Export CSV</Button>
          </a>
        }
      />

      {error && <Alert tone="red">{error}</Alert>}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState title="No data yet" body="Contribution rows appear once orders are booked." />
      ) : (
        <>
          <Card className="mb-6">
            <h2 className="mb-2 text-lg font-bold text-stone-900">Totals</h2>
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <span><span className="text-stone-500">Orders:</span> <span className="font-bold">{totals.orders}</span></span>
              <span><span className="text-stone-500">GMV:</span> <span className="font-bold">{formatCents(totals.gmvCents)}</span></span>
              <span><span className="text-stone-500">Platform revenue:</span> <span className="font-bold">{formatCents(totals.platformRevenueCents)}</span></span>
              <span><span className="text-stone-500">Payouts:</span> <span className="font-bold">{formatCents(totals.payoutsCents)}</span></span>
              <span><span className="text-stone-500">Refunds:</span> <span className="font-bold">{formatCents(totals.refundsCents)}</span></span>
              <span><span className="text-stone-500">Card cost (est):</span> <span className="font-bold">{formatCents(totals.cardCostEstCents)}</span></span>
              <span><span className="text-stone-500">Contribution:</span> <span className="font-bold text-emerald-800">{formatCents(totals.contributionCents)}</span></span>
            </div>
            <p className="mt-2 text-xs text-stone-500">
              Contribution = platform revenue − estimated card cost (2.9% + $0.30 of charged total) − rental refunds.
              Platform fees are non-refundable, so they stay in contribution even when the rental is refunded.
            </p>
          </Card>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
                    <th className="py-2 pr-4">City</th>
                    <th className="py-2 pr-4">Category</th>
                    <th className="py-2 pr-4">Channel</th>
                    <th className="py-2 pr-4 text-right">Orders</th>
                    <th className="py-2 pr-4 text-right">GMV</th>
                    <th className="py-2 pr-4 text-right">Revenue</th>
                    <th className="py-2 pr-4 text-right">Payouts</th>
                    <th className="py-2 pr-4 text-right">Refunds</th>
                    <th className="py-2 pr-4 text-right">Card cost</th>
                    <th className="py-2 pr-4 text-right">Contribution</th>
                    <th className="py-2 pr-4 text-right">Fill %</th>
                    <th className="py-2 pr-4 text-right">Accept %</th>
                    <th className="py-2 text-right">On-time %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-stone-100 last:border-0">
                      <td className="py-2 pr-4 font-medium">{r.city}</td>
                      <td className="py-2 pr-4 text-xs">{r.category.replace(/_/g, " ")}</td>
                      <td className="py-2 pr-4 text-xs">{r.channel}</td>
                      <td className="py-2 pr-4 text-right">{r.orders}</td>
                      <td className="py-2 pr-4 text-right">{formatCents(r.gmvCents)}</td>
                      <td className="py-2 pr-4 text-right">{formatCents(r.platformRevenueCents)}</td>
                      <td className="py-2 pr-4 text-right">{formatCents(r.payoutsCents)}</td>
                      <td className="py-2 pr-4 text-right">{formatCents(r.refundsCents)}</td>
                      <td className="py-2 pr-4 text-right">{formatCents(r.cardCostEstCents)}</td>
                      <td className={`py-2 pr-4 text-right font-bold ${r.contributionCents < 0 ? "text-red-700" : "text-emerald-800"}`}>
                        {formatCents(r.contributionCents)}
                      </td>
                      <td className="py-2 pr-4 text-right">{r.fillRatePct}%</td>
                      <td className="py-2 pr-4 text-right">{r.acceptRatePct}%</td>
                      <td className="py-2 text-right">{r.onTimeRatePct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
