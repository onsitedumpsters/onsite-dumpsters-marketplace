import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession, sessionUserId } from "@/lib/server-auth";
import { PageHeader, Card, Button, Badge, EmptyState } from "@/components/ui";

/** GET-side data + inline server actions for notifications (no extra API file). */
export default async function NotificationsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const userId = sessionUserId(session);

  const notifications = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const unread = notifications.filter((n) => !n.readAt).length;

  async function markAllRead() {
    "use server";
    const s = await getSession();
    if (!s?.user) return;
    await db.notification.updateMany({
      where: { userId: sessionUserId(s), readAt: null },
      data: { readAt: new Date() },
    });
    revalidatePath("/dashboard/client/notifications");
  }

  async function markOneRead(formData: FormData) {
    "use server";
    const s = await getSession();
    if (!s?.user) return;
    const id = String(formData.get("id") ?? "");
    if (!id) return;
    await db.notification.updateMany({
      where: { id, userId: sessionUserId(s) },
      data: { readAt: new Date() },
    });
    revalidatePath("/dashboard/client/notifications");
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unread > 0 ? `${unread} unread` : "You're all caught up."}
        action={
          unread > 0 ? (
            <form action={markAllRead}>
              <Button variant="outline" size="sm" type="submit">
                Mark all read
              </Button>
            </form>
          ) : undefined
        }
      />
      {notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          body="Order updates, payout alerts, and dispute notices will appear here."
        />
      ) : (
        <ul className="space-y-3">
          {notifications.map((n) => (
            <li key={n.id}>
              <Card className={n.readAt ? "opacity-70" : "border-l-4 border-l-emerald-600"}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-stone-900">
                      {!n.readAt && <Badge tone="green">New</Badge>} {n.title}
                    </p>
                    {n.body && <p className="mt-1 text-sm text-stone-600">{n.body}</p>}
                    <p className="mt-1 text-xs text-stone-400">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                    {n.link && (
                      <Link href={n.link} className="mt-1 inline-block text-sm font-semibold text-emerald-800 hover:underline">
                        View →
                      </Link>
                    )}
                  </div>
                  {!n.readAt && (
                    <form action={markOneRead}>
                      <input type="hidden" name="id" value={n.id} />
                      <Button size="sm" variant="ghost" type="submit">
                        Mark read
                      </Button>
                    </form>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
