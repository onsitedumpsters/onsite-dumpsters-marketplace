import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession, sessionUserId } from "@/lib/server-auth";
import { PageHeader, Card, Button } from "@/components/ui";
import { StatCard } from "@/components/dash/StatCard";
import { formatCents } from "@/lib/fees";

export default async function FleetOverviewPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const userId = sessionUserId(session);

  const [totalContainers, assignedContainers, revenueAgg, activeOrders, campaigns] = await Promise.all([
    db.container.count({ where: { fleetOwnerId: userId } }),
    db.container.count({ where: { fleetOwnerId: userId, status: "assigned" } }),
    db.order.aggregate({
      where: {
        status: { in: ["completed", "reviewed"] },
        listing: { container: { fleetOwnerId: userId } },
      },
      _sum: { rentalSubtotalCents: true },
    }),
    db.order.count({
      where: {
        status: { in: ["booked", "accepted", "dispatched", "delivered", "in_service", "pickup_scheduled", "picked_up"] },
        listing: { container: { fleetOwnerId: userId } },
      },
    }),
    db.adCampaign.count({ where: { ownerId: userId, status: "active" } }),
  ]);

  const utilization = totalContainers > 0 ? Math.round((assignedContainers / totalContainers) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Fleet overview"
        subtitle="Containers, utilization, and revenue across your fleet."
        action={
          <Link href="/dashboard/fleet/containers">
            <Button>Manage containers</Button>
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Containers" value={String(totalContainers)} sub="registered in fleet" tone="neutral" />
        <StatCard label="Utilization" value={`${utilization}%`} sub={`${assignedContainers} assigned to providers`} tone="blue" />
        <StatCard
          label="Revenue (settled)"
          value={formatCents(revenueAgg._sum.rentalSubtotalCents ?? 0)}
          sub="rental volume on completed jobs"
          tone="green"
        />
        <StatCard label="Active jobs on fleet" value={String(activeOrders)} sub={`${campaigns} active ad campaigns`} tone="amber" />
      </div>

      <Card className="mt-6">
        <h2 className="mb-2 font-bold text-stone-900">Grow your fleet</h2>
        <p className="text-sm text-stone-600">
          Register containers, assign them to verified haulers, and use{" "}
          <Link href="/dashboard/fleet/promote" className="font-semibold text-emerald-800 hover:underline">
            Promote
          </Link>{" "}
          to advertise equipment in sponsored search slots, the homepage carousel, or category banners.
          Sponsored placements are always labeled and never outrank organic results on relevance.
        </p>
      </Card>
    </div>
  );
}
