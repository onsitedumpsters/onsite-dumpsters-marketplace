import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, sessionUserId } from "@/lib/server-auth";
import { PageHeader, Card } from "@/components/ui";
import { StatCard } from "@/components/dash/StatCard";
import { DataTable } from "@/components/dash/DataTable";
import { formatCents } from "@/lib/fees";

const ACTIVE = ["booked", "accepted", "dispatched", "delivered", "in_service", "pickup_scheduled", "picked_up"];
const SETTLED = ["completed", "reviewed"];

export default async function FleetReportsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const userId = sessionUserId(session);

  const containers = await db.container.findMany({
    where: { fleetOwnerId: userId },
    include: {
      listings: {
        select: {
          id: true,
          title: true,
          orders: { select: { status: true, rentalSubtotalCents: true } },
        },
      },
      assignedProvider: { select: { name: true } },
    },
    orderBy: { assetTag: "asc" },
  });

  const rows = containers.map((c) => {
    const orders = c.listings.flatMap((l) => l.orders);
    const active = orders.filter((o) => ACTIVE.includes(o.status)).length;
    const settledOrders = orders.filter((o) => SETTLED.includes(o.status));
    const revenue = settledOrders.reduce((s, o) => s + o.rentalSubtotalCents, 0);
    return {
      id: c.id,
      label: c.assetTag ?? c.id.slice(0, 8),
      sizeYards: c.sizeYards,
      type: c.containerType.replace(/_/g, " "),
      status: c.status,
      provider: c.assignedProvider?.name ?? "—",
      listingCount: c.listings.length,
      activeJobs: active,
      settledJobs: settledOrders.length,
      revenue,
    };
  });

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const assigned = containers.filter((c) => c.status === "assigned").length;
  const utilization = containers.length > 0 ? Math.round((assigned / containers.length) * 100) : 0;

  return (
    <div>
      <PageHeader title="Fleet reports" subtitle="Utilization and revenue per container." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Fleet utilization" value={`${utilization}%`} sub={`${assigned} of ${containers.length} assigned`} tone="blue" />
        <StatCard label="Total revenue (settled)" value={formatCents(totalRevenue)} sub="rental volume, completed jobs" tone="green" />
        <StatCard label="Containers tracked" value={String(containers.length)} tone="neutral" />
      </div>
      <Card>
        <h2 className="mb-3 font-bold text-stone-900">Per-container performance</h2>
        <DataTable
          data={rows}
          rowKey={(r) => r.id}
          emptyTitle="No containers"
          emptyBody="Register containers to see utilization and revenue here."
          columns={[
            {
              header: "Container",
              render: (r) => (
                <span>
                  <span className="font-semibold">{r.label}</span>
                  <span className="block text-xs text-stone-500">{r.sizeYards} yd · {r.type}</span>
                </span>
              ),
            },
            { header: "Status", render: (r) => r.status },
            { header: "Provider", render: (r) => r.provider },
            { header: "Listings", render: (r) => <span className="tabular-nums">{r.listingCount}</span> },
            { header: "Active jobs", render: (r) => <span className="tabular-nums">{r.activeJobs}</span> },
            { header: "Settled jobs", render: (r) => <span className="tabular-nums">{r.settledJobs}</span> },
            {
              header: "Revenue",
              className: "text-right",
              render: (r) => <span className="font-semibold tabular-nums">{formatCents(r.revenue)}</span>,
            },
          ]}
        />
      </Card>
    </div>
  );
}
