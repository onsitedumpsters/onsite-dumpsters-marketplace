import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";

// Orders that were actually booked (payment authorized) — the money-bearing set.
const BOOKABLE_STATUSES: OrderStatus[] = [
  "booked", "accepted", "dispatched", "delivered", "in_service",
  "pickup_scheduled", "picked_up", "completed", "reviewed", "disputed",
];
const ACCEPTED_PLUS: OrderStatus[] = ["accepted", "dispatched", "delivered", "in_service", "pickup_scheduled", "picked_up", "completed", "reviewed"];

export interface ContributionRow {
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

/**
 * Contribution-margin report: per city × category × channel, platform revenue
 * (booking + dropping + processing + take-rate fees), hauler payouts, refunds,
 * estimated Stripe card cost, and derived fill/accept/on-time rates.
 */
export async function buildReport(): Promise<{ rows: ContributionRow[]; generatedAt: string }> {
  const orders = await db.order.findMany({
    where: { status: { in: BOOKABLE_STATUSES } },
    select: {
      status: true,
      deliveryCity: true,
      channel: true,
      grandTotalCents: true,
      bookingFeeCents: true,
      droppingFeeCents: true,
      processingFeeCents: true,
      takeRateCents: true,
      haulerPayoutCents: true,
      refundedRentalCents: true,
      acceptedAt: true,
      deliveredAt: true,
      deliveryDate: true,
      listing: { select: { category: true } },
    },
  });

  const groups = new Map<string, ContributionRow & { accepted: number; filled: number; delivered: number; onTime: number }>();

  for (const o of orders) {
    const key = `${o.deliveryCity}||${o.listing.category}||${o.channel}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        city: o.deliveryCity,
        category: o.listing.category,
        channel: o.channel,
        orders: 0,
        gmvCents: 0,
        platformRevenueCents: 0,
        payoutsCents: 0,
        refundsCents: 0,
        cardCostEstCents: 0,
        contributionCents: 0,
        fillRatePct: 0,
        acceptRatePct: 0,
        onTimeRatePct: 0,
        accepted: 0,
        filled: 0,
        delivered: 0,
        onTime: 0,
      };
      groups.set(key, g);
    }
    g.orders += 1;
    g.gmvCents += o.grandTotalCents;
    g.platformRevenueCents += o.bookingFeeCents + o.droppingFeeCents + o.processingFeeCents + o.takeRateCents;
    g.payoutsCents += o.haulerPayoutCents;
    g.refundsCents += o.refundedRentalCents;
    // Estimated true Stripe cost (2.9% + $0.30 of the charged total); the collected
    // processing fee line item is platform revenue meant to offset this.
    g.cardCostEstCents += Math.round(o.grandTotalCents * 0.029 + 30);
    if (o.acceptedAt) g.accepted += 1;
    if (ACCEPTED_PLUS.includes(o.status)) g.filled += 1;
    if (o.deliveredAt) {
      g.delivered += 1;
      if (o.deliveredAt <= o.deliveryDate) g.onTime += 1;
    }
  }

  const rows: ContributionRow[] = [...groups.values()].map((g) => {
    const contributionCents = g.platformRevenueCents - g.cardCostEstCents - g.refundsCents;
    const { accepted, filled, delivered, onTime, ...rest } = g;
    return {
      ...rest,
      contributionCents,
      fillRatePct: g.orders > 0 ? Math.round((filled / g.orders) * 1000) / 10 : 0,
      acceptRatePct: g.orders > 0 ? Math.round((accepted / g.orders) * 1000) / 10 : 0,
      onTimeRatePct: delivered > 0 ? Math.round((onTime / delivered) * 1000) / 10 : 0,
    };
  });
  rows.sort((a, b) => b.contributionCents - a.contributionCents);

  return { rows, generatedAt: new Date().toISOString() };
}
