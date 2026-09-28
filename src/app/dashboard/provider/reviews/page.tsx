import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, sessionUserId } from "@/lib/server-auth";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { StatCard } from "@/components/dash/StatCard";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-500" aria-label={`${rating} out of 5 stars`}>
      {"★".repeat(rating)}{"☆".repeat(5 - rating)}
    </span>
  );
}

export default async function ProviderReviewsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const userId = sessionUserId(session);

  const [reviews, profile] = await Promise.all([
    db.review.findMany({
      where: { providerId: userId },
      include: {
        listing: { select: { title: true } },
        client: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.providerProfile.findUnique({ where: { userId } }),
  ]);

  return (
    <div>
      <PageHeader title="Reviews" subtitle="Job-verified reviews from your clients." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Average rating" value={profile ? profile.ratingAvg.toFixed(1) : "—"} tone="amber" />
        <StatCard label="Total reviews" value={String(profile?.reviewCount ?? 0)} tone="neutral" />
        <StatCard label="Completed jobs" value={String(profile?.completedJobs ?? 0)} tone="green" />
      </div>
      {reviews.length === 0 ? (
        <EmptyState title="No reviews yet" body="Reviews appear here after clients rate completed jobs." />
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-stone-900">
                    {r.title ?? "Review"} <Stars rating={r.rating} />
                  </p>
                  <p className="text-xs text-stone-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                {r.body && <p className="mt-2 text-sm text-stone-600">{r.body}</p>}
                <p className="mt-2 text-xs text-stone-500">
                  {r.client.name ?? "Client"} · {r.listing.title}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
