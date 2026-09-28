import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** GET — per-campaign performance aggregates + moderation queue. */
export async function GET() {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const [campaigns, eventAgg] = await Promise.all([
    db.adCampaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { name: true, email: true } },
        placement: { select: { code: true, name: true } },
        listing: { select: { title: true } },
        invoices: { select: { amountCents: true, status: true } },
      },
    }),
    db.adEvent.groupBy({
      by: ["campaignId", "type"],
      _count: true,
    }),
  ]);

  const distinctOrders = await db.adEvent.groupBy({
    by: ["campaignId"],
    where: { orderId: { not: null } },
    _count: { orderId: true },
  });
  const attributed = new Map(distinctOrders.map((r) => [r.campaignId, r._count.orderId]));

  const counts = new Map<string, { impressions: number; clicks: number }>();
  for (const row of eventAgg) {
    const cur = counts.get(row.campaignId) ?? { impressions: 0, clicks: 0 };
    if (row.type === "impression") cur.impressions = row._count;
    if (row.type === "click") cur.clicks = row._count;
    counts.set(row.campaignId, cur);
  }

  const stats = campaigns.map((c) => {
    const { impressions, clicks } = counts.get(c.id) ?? { impressions: 0, clicks: 0 };
    const counterImpressions = c.impressions || impressions;
    const counterClicks = c.clicks || clicks;
    const ctrPct = counterImpressions > 0 ? (counterClicks / counterImpressions) * 100 : 0;
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      owner: c.owner,
      placement: c.placement,
      listingTitle: c.listing?.title ?? null,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      paidAt: c.paidAt,
      impressions: counterImpressions,
      clicks: counterClicks,
      ctrPct: Math.round(ctrPct * 100) / 100,
      attributedBookings: attributed.get(c.id) ?? 0,
      revenueCents: c.invoices.reduce((s, i) => s + (i.status === "paid" ? i.amountCents : 0), 0),
    };
  });

  return NextResponse.json({
    campaigns: stats,
    moderationQueue: stats.filter((s) => s.status === "pending_approval"),
  });
}
