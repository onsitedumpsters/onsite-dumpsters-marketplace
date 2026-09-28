import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession, sessionUserId } from "@/lib/server-auth";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/dash/StatusBadge";
import { SLA, STATUS_LABELS, type OrderStatus } from "@/lib/order-machine";

const BOARD_ORDER: OrderStatus[] = [
  "booked",
  "accepted",
  "dispatched",
  "delivered",
  "in_service",
  "pickup_scheduled",
  "picked_up",
  "disputed",
  "completed",
];

/** Provider dispatch board: jobs grouped by status with SLA breach badges. */
export default async function ProviderJobsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const userId = sessionUserId(session);

  const orders = await db.order.findMany({
    where: {
      providerId: userId,
      status: { in: [...BOARD_ORDER, "cancelled"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { title: true, sizeYards: true } },
      client: { select: { name: true } },
    },
  });

  const now = Date.now();
  const breachMs = SLA.acceptanceHours * 3_600_000;

  const grouped = new Map<OrderStatus, typeof orders>();
  for (const o of orders) {
    const key = o.status as OrderStatus;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(o);
  }

  const total = orders.length;

  return (
    <div>
      <PageHeader
        title="Dispatch board"
        subtitle={`${total} job${total === 1 ? "" : "s"} · accept new bookings within ${SLA.acceptanceHours}h to stay SLA-clean.`}
      />
      {total === 0 ? (
        <EmptyState
          title="No jobs on the board"
          body="New bookings will appear here. Make sure your listings are active."
        />
      ) : (
        <div className="space-y-6">
          {BOARD_ORDER.filter((s) => grouped.has(s)).map((status) => (
            <section key={status} aria-label={STATUS_LABELS[status]}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-stone-500">
                <StatusBadge status={status} />
                <span className="text-stone-400">({grouped.get(status)!.length})</span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {grouped.get(status)!.map((o) => {
                  const breached = status === "booked" && now - new Date(o.createdAt).getTime() > breachMs;
                  return (
                    <li key={o.id}>
                      <Link
                        href={`/dashboard/provider/jobs/${o.id}`}
                        className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-colors hover:border-emerald-400"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-stone-900">{o.orderNumber}</p>
                          {breached && <Badge tone="red">SLA breach · &gt;{SLA.acceptanceHours}h unaccepted</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-stone-600">{o.listing.title}</p>
                        <p className="text-xs text-stone-500">
                          {o.client.name ?? "Client"} · {o.deliveryCity} ·{" "}
                          {new Date(o.deliveryDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
