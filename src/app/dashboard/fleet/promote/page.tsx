import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession, sessionUserId } from "@/lib/server-auth";
import { PageHeader, Card, Button, Badge, Alert, EmptyState } from "@/components/ui";
import { DataTable } from "@/components/dash/DataTable";

const STATUS_TONE: Record<string, "neutral" | "green" | "amber" | "red" | "blue"> = {
  draft: "neutral",
  pending_approval: "amber",
  active: "green",
  paused: "amber",
  ended: "neutral",
  rejected: "red",
};

export default async function FleetPromotePage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const userId = sessionUserId(session);

  const campaigns = await db.adCampaign.findMany({
    where: { ownerId: userId },
    include: {
      placement: true,
      listing: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const withStats = await Promise.all(
    campaigns.map(async (c) => {
      const [impressions, clicks] = await Promise.all([
        db.adEvent.count({ where: { campaignId: c.id, type: "impression" } }),
        db.adEvent.count({ where: { campaignId: c.id, type: "click" } }),
      ]);
      return { ...c, impressions, clicks, ctr: impressions > 0 ? clicks / impressions : 0 };
    }),
  );

  return (
    <div>
      <PageHeader
        title="Promote"
        subtitle="Advertise your equipment in sponsored placements."
        action={
          <Link href="/ads/promote/new">
            <Button>New campaign</Button>
          </Link>
        }
      />
      <div className="mb-6">
        <Alert tone="neutral">
          Sponsored placements run in <strong>separate, clearly labeled slots</strong> (max 3 per
          search page) and never outrank organic results on relevance alone. Creatives require admin
          approval before going live. Ad spend is platform revenue — non-refundable.
        </Alert>
      </div>
      {withStats.length === 0 ? (
        <EmptyState
          title="No campaigns yet"
          body="Pick a listing or equipment, choose a placement, pay once — then track impressions, clicks, and bookings here."
          action={
            <Link href="/ads/promote/new">
              <Button>Create your first campaign</Button>
            </Link>
          }
        />
      ) : (
        <Card>
          <DataTable
            data={withStats}
            rowKey={(c) => c.id}
            columns={[
              {
                header: "Campaign",
                render: (c) => (
                  <span>
                    <Link href={`/ads/promote/${c.id}`} className="font-semibold text-emerald-800 hover:underline">
                      {c.title}
                    </Link>
                    <span className="block text-xs text-stone-500">
                      {c.placement.name}{c.listing ? ` · ${c.listing.title}` : ""}
                    </span>
                  </span>
                ),
              },
              {
                header: "Flight",
                render: (c) => (
                  <span className="text-xs text-stone-600">
                    {new Date(c.startsAt).toLocaleDateString()} → {new Date(c.endsAt).toLocaleDateString()}
                  </span>
                ),
              },
              { header: "Impr.", render: (c) => <span className="tabular-nums">{c.impressions}</span> },
              { header: "Clicks", render: (c) => <span className="tabular-nums">{c.clicks}</span> },
              { header: "CTR", render: (c) => <span className="tabular-nums">{(c.ctr * 100).toFixed(1)}%</span> },
              { header: "Status", render: (c) => <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status.replace(/_/g, " ")}</Badge> },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
