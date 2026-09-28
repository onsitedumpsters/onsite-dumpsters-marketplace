import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession, sessionRole, sessionUserId } from "@/lib/server-auth";
import { PageHeader, Card, Badge, Alert } from "@/components/ui";
import { StatCard } from "@/components/dash/StatCard";
import { formatCents } from "@/lib/fees";

const STATUS_TONE: Record<string, "neutral" | "green" | "amber" | "red" | "blue"> = {
  draft: "neutral",
  pending_approval: "amber",
  active: "green",
  paused: "amber",
  ended: "neutral",
  rejected: "red",
};

/** Campaign detail + performance stats for the owner (or admin). */
export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const role = sessionRole(session) ?? "";
  if (!["provider", "fleet_owner", "admin"].includes(role)) {
    redirect("/dashboard");
  }
  const userId = sessionUserId(session);
  const { id } = await params;

  const campaign = await db.adCampaign.findUnique({
    where: { id },
    include: {
      placement: true,
      listing: { select: { id: true, title: true } },
      invoices: true,
    },
  });
  if (!campaign) notFound();
  if (role !== "admin" && campaign.ownerId !== userId) {
    redirect("/dashboard/fleet/promote");
  }

  const [impressions, clicks, attributed] = await Promise.all([
    db.adEvent.count({ where: { campaignId: id, type: "impression" } }),
    db.adEvent.count({ where: { campaignId: id, type: "click" } }),
    db.adEvent.findMany({
      where: { campaignId: id, orderId: { not: null } },
      select: { orderId: true },
      distinct: ["orderId"],
    }),
  ]);
  const ctr = impressions > 0 ? clicks / impressions : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        title={campaign.title}
        subtitle={`${campaign.placement.name} · ${new Date(campaign.startsAt).toLocaleDateString()} → ${new Date(campaign.endsAt).toLocaleDateString()}`}
        action={<Badge tone={STATUS_TONE[campaign.status] ?? "neutral"}>{campaign.status.replace(/_/g, " ")}</Badge>}
      />
      {campaign.status === "rejected" && campaign.rejectionReason && (
        <div className="mb-6">
          <Alert tone="red">Rejected by admin: {campaign.rejectionReason}</Alert>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Impressions" value={String(impressions)} tone="blue" />
        <StatCard label="Clicks" value={String(clicks)} tone="blue" />
        <StatCard label="CTR" value={`${(ctr * 100).toFixed(2)}%`} tone="amber" />
        <StatCard label="Attributed bookings" value={String(attributed.length)} sub="orders linked to ad events" tone="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Campaign</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Placement</dt><dd className="text-right font-medium">{campaign.placement.name}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Price</dt><dd className="text-right font-medium tabular-nums">{formatCents(campaign.placement.priceCents)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Listing</dt><dd className="text-right font-medium">{campaign.listing?.title ?? "Brand promotion"}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-stone-500">Paid</dt><dd className="text-right font-medium">{campaign.paidAt ? new Date(campaign.paidAt).toLocaleDateString() : "Not yet"}</dd></div>
            {campaign.targetUrl && (
              <div className="flex justify-between gap-4"><dt className="text-stone-500">Target URL</dt><dd className="break-all text-right font-medium">{campaign.targetUrl}</dd></div>
            )}
          </dl>
          {campaign.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={campaign.imageUrl} alt="Campaign creative" className="mt-4 aspect-video w-full rounded-lg border border-stone-200 object-cover" />
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Invoices</h2>
          {campaign.invoices.length === 0 ? (
            <p className="text-sm text-stone-500">No invoices yet — complete checkout to activate billing.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {campaign.invoices.map((inv) => (
                <li key={inv.id} className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2">
                  <span>{new Date(inv.createdAt).toLocaleDateString()} · {inv.status}</span>
                  <span className="font-semibold tabular-nums">{formatCents(inv.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-stone-500">
            Ad spend is platform revenue (non-refundable). Sponsored slots are labeled and capped at
            3 per page; creatives require admin approval.
          </p>
        </Card>
      </div>

      <Link href="/dashboard/fleet/promote" className="mt-6 inline-block text-sm font-semibold text-emerald-800 hover:underline">
        ← Back to Promote
      </Link>
    </div>
  );
}
