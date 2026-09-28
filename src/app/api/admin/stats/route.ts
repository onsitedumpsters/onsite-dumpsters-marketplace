import { NextResponse } from "next/server";
import type { LedgerType, OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/server-auth";
import { SLA } from "@/lib/order-machine";

export const dynamic = "force-dynamic";

const FEE_TYPES = ["fee_booking", "fee_dropping", "fee_processing", "fee_take_rate"] as const satisfies readonly LedgerType[];
const SETTLED_STATUSES: OrderStatus[] = ["completed", "reviewed"];
const BOOKABLE_STATUSES: OrderStatus[] = ["booked", "accepted", "dispatched", "delivered", "in_service", "pickup_scheduled", "picked_up", "completed", "reviewed", "disputed"];
const ACCEPTED_PLUS: OrderStatus[] = ["accepted", "dispatched", "delivered", "in_service", "pickup_scheduled", "picked_up", "completed", "reviewed"];

export async function GET() {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const acceptanceCutoff = new Date(now.getTime() - SLA.acceptanceHours * 60 * 60 * 1000);

  const [
    gmvByStatus,
    feeRevenueByType,
    escrow,
    payoutsPending,
    bookedCount,
    acceptedCount,
    disputeCount,
    takeRateSums,
    ledgerRows,
    ordersByListing,
    recentOrders,
    slaAlerts,
  ] = await Promise.all([
    db.order.groupBy({
      by: ["status"],
      _sum: { grandTotalCents: true },
      _count: true,
    }),
    db.ledgerEntry.groupBy({
      by: ["type"],
      _sum: { amountCents: true },
      where: { type: { in: [...FEE_TYPES] } },
    }),
    db.order.aggregate({
      _sum: { rentalSubtotalCents: true },
      where: { escrowStatus: "held" },
    }),
    db.payout.aggregate({ _sum: { amountCents: true }, where: { status: "pending" } }),
    db.order.count({ where: { status: { in: BOOKABLE_STATUSES } } }),
    db.order.count({ where: { status: { in: ACCEPTED_PLUS } } }),
    db.dispute.count(),
    db.order.aggregate({
      _sum: { takeRateCents: true, rentalSubtotalCents: true },
      where: { rentalSubtotalCents: { gt: 0 }, status: { in: BOOKABLE_STATUSES } },
    }),
    db.ledgerEntry.findMany({
      where: { type: { in: [...FEE_TYPES] }, createdAt: { gte: thirtyDaysAgo } },
      select: { type: true, amountCents: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.order.findMany({
      where: { status: { in: BOOKABLE_STATUSES } },
      select: { listing: { select: { category: true } } },
    }),
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        escrowStatus: true,
        grandTotalCents: true,
        deliveryCity: true,
        createdAt: true,
        client: { select: { name: true, email: true } },
        provider: { select: { name: true, email: true } },
        listing: { select: { title: true, category: true } },
      },
    }),
    db.order.findMany({
      where: { status: "booked", createdAt: { lt: acceptanceCutoff } },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        deliveryCity: true,
        client: { select: { name: true } },
        provider: { select: { name: true } },
      },
    }),
  ]);

  // ── KPI math ──────────────────────────────────────────────────────
  let gmvBookedCents = 0;
  let gmvSettledCents = 0;
  for (const row of gmvByStatus) {
    if (BOOKABLE_STATUSES.includes(row.status)) gmvBookedCents += row._sum.grandTotalCents ?? 0;
    if (SETTLED_STATUSES.includes(row.status)) gmvSettledCents += row._sum.grandTotalCents ?? 0;
  }

  const feeRevenue: Record<string, number> = { booking: 0, dropping: 0, processing: 0, takeRate: 0 };
  const feeKey: Record<string, "booking" | "dropping" | "processing" | "takeRate"> = {
    fee_booking: "booking",
    fee_dropping: "dropping",
    fee_processing: "processing",
    fee_take_rate: "takeRate",
  };
  for (const row of feeRevenueByType) {
    const key = feeKey[row.type];
    if (key) feeRevenue[key] = row._sum.amountCents ?? 0;
  }
  const platformRevenueCents = feeRevenue.booking + feeRevenue.dropping + feeRevenue.processing + feeRevenue.takeRate;

  const fillRatePct = bookedCount > 0 ? (acceptedCount / bookedCount) * 100 : 0;
  const disputeRatePct = bookedCount > 0 ? (disputeCount / bookedCount) * 100 : 0;
  const takeRateSumsSafe = takeRateSums._sum ?? {};
  const avgTakeRatePct =
    (takeRateSumsSafe.rentalSubtotalCents ?? 0) > 0
      ? ((takeRateSumsSafe.takeRateCents ?? 0) / (takeRateSumsSafe.rentalSubtotalCents ?? 1)) * 100
      : 0;

  // ── Revenue over time (last 30 days, stacked by fee type, in dollars) ─
  const dayMap = new Map<string, { booking: number; dropping: number; processing: number; takeRate: number }>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
    dayMap.set(d.toISOString().slice(0, 10), { booking: 0, dropping: 0, processing: 0, takeRate: 0 });
  }
  const typeKey: Record<string, "booking" | "dropping" | "processing" | "takeRate"> = {
    fee_booking: "booking",
    fee_dropping: "dropping",
    fee_processing: "processing",
    fee_take_rate: "takeRate",
  };
  for (const row of ledgerRows) {
    const key = row.createdAt.toISOString().slice(0, 10);
    const bucket = dayMap.get(key);
    const k = typeKey[row.type];
    if (bucket && k) bucket[k] += row.amountCents / 100;
  }
  const revenueByDay = [...dayMap.entries()].map(([date, v]) => ({
    date,
    booking: Math.round(v.booking * 100) / 100,
    dropping: Math.round(v.dropping * 100) / 100,
    processing: Math.round(v.processing * 100) / 100,
    takeRate: Math.round(v.takeRate * 100) / 100,
  }));

  // ── Orders by category ────────────────────────────────────────────
  const catCounts = new Map<string, number>();
  for (const o of ordersByListing) {
    catCounts.set(o.listing.category, (catCounts.get(o.listing.category) ?? 0) + 1);
  }
  const ordersByCategory = [...catCounts.entries()]
    .map(([category, orders]) => ({ category, orders }))
    .sort((a, b) => b.orders - a.orders);

  return NextResponse.json({
    kpis: {
      gmvBookedCents,
      gmvSettledCents,
      feeRevenueCents: { ...feeRevenue, total: platformRevenueCents },
      escrowOutstandingCents: escrow._sum.rentalSubtotalCents ?? 0,
      payoutsPendingCents: payoutsPending._sum.amountCents ?? 0,
      fillRatePct: Math.round(fillRatePct * 10) / 10,
      disputeRatePct: Math.round(disputeRatePct * 100) / 100,
      avgTakeRatePct: Math.round(avgTakeRatePct * 100) / 100,
      bookedCount,
      acceptedCount,
      disputeCount,
    },
    revenueByDay,
    ordersByCategory,
    recentOrders,
    slaAlerts: slaAlerts.map((o) => ({
      ...o,
      hoursUnaccepted: Math.round((now.getTime() - o.createdAt.getTime()) / 36e5),
    })),
  });
}
