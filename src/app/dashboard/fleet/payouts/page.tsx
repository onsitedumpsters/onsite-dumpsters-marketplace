import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, sessionUserId, sessionRole } from "@/lib/server-auth";
import { PageHeader, Card, Alert, Badge } from "@/components/ui";
import { StatCard } from "@/components/dash/StatCard";
import { DataTable } from "@/components/dash/DataTable";
import { formatCents } from "@/lib/fees";

const STATUS_TONE: Record<string, "neutral" | "green" | "amber" | "red"> = {
  pending: "amber",
  paid: "green",
  failed: "red",
};

/**
 * Fleet-owner payouts: payment-hold releases for jobs fulfilled with this owner's
 * containers (order → listing → container → fleetOwnerId).
 */
export default async function FleetPayoutsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  if (!["fleet_owner", "admin"].includes(sessionRole(session) ?? "")) redirect("/dashboard");
  const userId = sessionUserId(session);

  const containerScope = { order: { listing: { container: { fleetOwnerId: userId } } } };

  const [payouts, pendingAgg, paidAgg, user] = await Promise.all([
    db.payout.findMany({
      where: containerScope,
      include: {
        order: {
          select: {
            orderNumber: true,
            listing: {
              select: {
                container: { select: { assetTag: true, sizeYards: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.payout.aggregate({ where: { ...containerScope, status: "pending" }, _sum: { amountCents: true } }),
    db.payout.aggregate({ where: { ...containerScope, status: "paid" }, _sum: { amountCents: true } }),
    db.user.findUnique({
      where: { id: userId },
      select: { stripeConnectId: true, connectChargesEnabled: true, connectPayoutsEnabled: true },
    }),
  ]);

  const connectReady = Boolean(user?.stripeConnectId && user.connectChargesEnabled && user.connectPayoutsEnabled);

  return (
    <div>
      <PageHeader
        title="Payouts"
        subtitle="Released payment holds for jobs fulfilled with your containers."
      />
      {!connectReady && (
        <div className="mb-6">
          <Alert tone="amber">
            <strong>Stripe Connect is not fully set up.</strong> Payouts are held until onboarding is
            complete (charges and payouts enabled). Contact the marketplace admin to receive your
            Connect onboarding link.
          </Alert>
        </div>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending payout" value={formatCents(pendingAgg._sum.amountCents ?? 0)} tone="amber" />
        <StatCard label="Paid out (lifetime)" value={formatCents(paidAgg._sum.amountCents ?? 0)} tone="green" />
        <StatCard label="Connect status" value={connectReady ? "Ready" : "Incomplete"} tone={connectReady ? "green" : "amber"} />
      </div>
      <Card>
        <h2 className="mb-3 font-bold text-stone-900">Payout history</h2>
        <DataTable
          data={payouts}
          rowKey={(p) => p.id}
          emptyTitle="No payouts yet"
          emptyBody="Completed jobs fulfilled with your containers release held payments to your payout queue."
          columns={[
            {
              header: "Date",
              render: (p) => new Date(p.createdAt).toLocaleDateString(),
            },
            {
              header: "Order",
              render: (p) => p.order?.orderNumber ?? "—",
            },
            {
              header: "Container",
              render: (p) =>
                p.order?.listing?.container
                  ? `${p.order.listing.container.sizeYards} yd${p.order.listing.container.assetTag ? ` · ${p.order.listing.container.assetTag}` : ""}`
                  : "—",
            },
            {
              header: "Amount",
              className: "text-right",
              render: (p) => <span className="font-semibold tabular-nums">{formatCents(p.amountCents)}</span>,
            },
            { header: "Status", render: (p) => <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge> },
            {
              header: "Paid at",
              render: (p) => (p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"),
            },
          ]}
        />
      </Card>
    </div>
  );
}
