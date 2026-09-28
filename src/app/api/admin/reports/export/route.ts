import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server-auth";
import { buildReport } from "@/lib/admin-reports";

export const dynamic = "force-dynamic";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const { rows, generatedAt } = await buildReport();
  const dollars = (cents: number) => (cents / 100).toFixed(2);

  const header = [
    "city", "category", "channel", "orders", "gmv_usd", "platform_revenue_usd",
    "payouts_usd", "refunds_usd", "card_cost_est_usd", "contribution_usd",
    "fill_rate_pct", "accept_rate_pct", "on_time_rate_pct",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.city), csvCell(r.category), csvCell(r.channel), r.orders,
        dollars(r.gmvCents), dollars(r.platformRevenueCents), dollars(r.payoutsCents),
        dollars(r.refundsCents), dollars(r.cardCostEstCents), dollars(r.contributionCents),
        r.fillRatePct, r.acceptRatePct, r.onTimeRatePct,
      ].join(","),
    );
  }

  const stamp = generatedAt.slice(0, 10);
  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="admin-contribution-report-${stamp}.csv"`,
    },
  });
}
