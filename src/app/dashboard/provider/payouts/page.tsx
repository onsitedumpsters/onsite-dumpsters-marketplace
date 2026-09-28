import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, sessionUserId } from "@/lib/server-auth";
import { PageHeader, Card, Alert, Badge } from "@/components/ui";
import { StatCard } from "@/components/dash/StatCard";
import { DataTable } from "@/components/dash/DataTable";
import { formatCents } from "@/lib/fees";

const STATUS_TONE: Record<string, "neutral" | "green" | "amber" | "red"> = {
  pending: "amber",
  paid: "green",
  failed: "red",
};

export default async function ProviderPayoutsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const userId = sessionUserId(session);

  const [payouts, pendingAgg, paidAgg, user] = await Promise.all([
    db.payout.findMany({
      where: { providerId: userId },
      include: { order: { select: { orderNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.payout.aggregate({ where: { providerId: userId, status: "pending" }, _sum: { amountCents: true } }),
    db.payout.aggregate({ where: { providerId: userId, status: "paid" }, _sum: { amountCents: true } }),
    db.user.findUnique({ where: { id: userId }, select: { stripeConnectId: true, connectChargesEnabled: true, connectPayoutsEnabled: true } }),
  ]);

  const connectReady = Boolean(user?.stripeConnectId && user.connectChargesEnabled && user.connectPayoutsEnabled);

  return (
    <div>
      <PageHeader title="Payouts" subtitle="Escrow releases settle to your Stripe Connect account." />
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
          emptyBody="Completed jobs release escrow to your payout queue."
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
