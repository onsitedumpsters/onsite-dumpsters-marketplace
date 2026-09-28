import { redirect } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getSession, sessionUserId } from "@/lib/server-auth";
import { PageHeader, Card, Alert } from "@/components/ui";
import { StatCard } from "@/components/dash/StatCard";
import { formatCents } from "@/lib/fees";

const ACTIVE: OrderStatus[] = [
  "booked",
  "accepted",
  "dispatched",
  "delivered",
  "in_service",
  "pickup_scheduled",
  "picked_up",
  "disputed",
];

export default async function ProviderOverviewPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const userId = sessionUserId(session);

  const [activeJobs, totalOrders, acceptedOrders, delivered, payouts, profile] = await Promise.all([
    db.order.count({ where: { providerId: userId, status: { in: ACTIVE } } }),
    db.order.count({ where: { providerId: userId } }),
    db.order.count({ where: { providerId: userId, acceptedAt: { not: null } } }),
    db.order.findMany({
      where: { providerId: userId, deliveredAt: { not: null } },
      select: { deliveredAt: true, deliveryDate: true },
    }),
    db.payout.aggregate({
      where: { providerId: userId, status: "pending" },
      _sum: { amountCents: true },
    }),
    db.providerProfile.findUnique({ where: { userId } }),
  ]);

  const acceptanceRate = totalOrders > 0 ? Math.round((acceptedOrders / totalOrders) * 100) : 0;
  const onTime = delivered.filter(
    (o) => o.deliveredAt && new Date(o.deliveredAt) <= new Date(new Date(o.deliveryDate).setHours(23, 59, 59)),
  ).length;
  const onTimePct = delivered.length > 0 ? Math.round((onTime / delivered.length) * 100) : 100;

  return (
    <div>
      <PageHeader
        title={profile?.businessName ? `Welcome, ${profile.businessName}` : "Provider overview"}
        subtitle="Your jobs, earnings, and reputation at a glance."
      />
      {profile && profile.verificationStatus !== "approved" && (
        <div className="mb-6">
          <Alert tone="amber">
            Verification status: <strong>{profile.verificationStatus}</strong>.{" "}
            {profile.verificationStatus === "pending"
              ? "Our team is reviewing your documents."
              : "Please update your verification documents to keep receiving jobs."}
          </Alert>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Active jobs" value={String(activeJobs)} sub="booked → picked up" tone="blue" />
        <StatCard label="Acceptance rate" value={`${acceptanceRate}%`} sub={`${acceptedOrders} of ${totalOrders} orders accepted`} tone="green" />
        <StatCard label="On-time delivery" value={`${onTimePct}%`} sub={`across ${delivered.length} delivered orders`} tone="green" />
        <StatCard
          label="Rating"
          value={profile ? profile.ratingAvg.toFixed(1) : "—"}
          sub={profile ? `${profile.reviewCount} verified reviews` : "No reviews yet"}
          tone="amber"
        />
        <StatCard
          label="Pending payout"
          value={formatCents(payouts._sum.amountCents ?? 0)}
          sub="settles per Stripe Connect schedule"
          tone="green"
        />
        <StatCard
          label="Completed jobs"
          value={String(profile?.completedJobs ?? 0)}
          sub="lifetime"
          tone="neutral"
        />
      </div>

      <Card className="mt-6">
        <h2 className="mb-2 font-bold text-stone-900">Next steps</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-600">
          <li>Check the dispatch board for jobs awaiting acceptance — accept within 4 hours to stay SLA-clean.</li>
          <li>Keep listings active with accurate rate cards and service areas.</li>
          <li>Upload delivery and pickup photos on every job; weight tickets support adjustments.</li>
        </ul>
      </Card>
    </div>
  );
}
