import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getSession, sessionRole } from "@/lib/server-auth";
import { isStripeConfigured } from "@/lib/stripe";
import { PageHeader, Card, Alert, Badge } from "@/components/ui";
import { StatCard } from "@/components/dash/StatCard";
import { DataTable } from "@/components/dash/DataTable";
import { formatCents } from "@/lib/fees";

function CheckRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-stone-200 px-4 py-3">
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
          ok ? "bg-emerald-600" : "bg-stone-300"
        }`}
      >
        {ok ? "✓" : "·"}
      </span>
      <div>
        <p className="text-sm font-semibold text-stone-900">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
      </div>
    </div>
  );
}

export default async function AdminPaymentsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  if (sessionRole(session) !== "admin") redirect("/dashboard");

  const live = isStripeConfigured();
  const webhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  const publishable = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

  const [connectStats, ledgerRecent] = await Promise.all([
    db.user.groupBy({
      by: ["role"],
      where: { stripeConnectId: { not: null } },
      _count: { id: true },
    }),
    db.ledgerEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        type: true,
        amountCents: true,
        currency: true,
        orderId: true,
        createdAt: true,
        description: true,
      },
    }),
  ]);

  const connectCount = connectStats.reduce((n, g) => n + g._count.id, 0);

  const checklist = [
    {
      ok: live,
      label: "Stripe secret key (STRIPE_SECRET_KEY)",
      hint: live ? "Present — live/test mode active." : "Missing — the app is running in DEMO payments mode.",
    },
    {
      ok: publishable,
      label: "Publishable key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)",
      hint: "Required for Stripe Elements at checkout.",
    },
    {
      ok: webhook,
      label: "Webhook secret (STRIPE_WEBHOOK_SECRET)",
      hint: "Required to verify payment_intent / charge / payout webhooks.",
    },
    {
      ok: connectCount > 0,
      label: "Provider Connect accounts onboarded",
      hint: `${connectCount} connected account${connectCount === 1 ? "" : "s"} so far.`,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payments & Stripe"
        subtitle="Stripe configuration status, Connect onboarding, and the go-live checklist."
      />

      {!live && (
        <div className="mb-6">
          <Alert tone="amber">
            <strong>DEMO payments mode is active.</strong> Checkout simulates authorization, capture,
            and release with real ledger entries and fee math — no real money moves. Complete the
            checklist below to go live.
          </Alert>
        </div>
      )}
      {live && (
        <div className="mb-6">
          <Alert tone="green">
            <strong>Stripe is configured.</strong> Real payment intents, Connect transfers, and
            webhook-verified money movement are active.
          </Alert>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Payments mode" value={live ? "Live / Test" : "DEMO"} tone={live ? "green" : "amber"} />
        <StatCard label="Connect accounts" value={String(connectCount)} tone="neutral" />
        <StatCard
          label="Webhook secret"
          value={webhook ? "Configured" : "Missing"}
          tone={webhook ? "green" : "red"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Go-live checklist</h2>
          <div className="space-y-3">{checklist.map((c) => <CheckRow key={c.label} {...c} />)}</div>
          <div className="mt-4 border-t border-stone-100 pt-4 text-sm text-stone-600">
            <p className="font-semibold text-stone-900">Full setup guide</p>
            <p className="mt-1">
              Test-mode keys, Connect onboarding, webhook endpoint registration, and the launch
              runbook live in the repository:{" "}
              <a
                href="https://github.com/onsitedumpsters/onsite-dumpsters-marketplace/blob/main/docs/STRIPE_SETUP.md"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-emerald-800 underline"
              >
                docs/STRIPE_SETUP.md
              </a>
            </p>
            <p className="mt-2">
              Reminder: platform fees (booking, drop-off, processing, take rate) are non-refundable
              by policy — keep the checkout disclosure and receipt wording aligned when changing fee
              amounts under <Link href="/admin/fees" className="font-semibold text-emerald-800 underline">Fee schedules</Link>.
            </p>
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-bold text-stone-900">Recent ledger activity</h2>
          <DataTable
            data={ledgerRecent}
            rowKey={(e) => e.id}
            emptyTitle="No ledger entries yet"
            emptyBody="Money movement (authorizations, captures, refunds, payouts) is recorded here."
            columns={[
              {
                header: "When",
                render: (e) => new Date(e.createdAt).toLocaleString(),
              },
              { header: "Kind", render: (e) => <Badge tone="neutral">{String(e.type)}</Badge> },
              {
                header: "Amount",
                className: "text-right",
                render: (e) => (
                  <span className="font-semibold tabular-nums">{formatCents(e.amountCents)}</span>
                ),
              },
              {
                header: "Memo",
                render: (e) => (
                  <span className="max-w-48 truncate text-xs text-stone-500">{e.description ?? "—"}</span>
                ),
              },
            ]}
          />
          <div className="mt-3 text-right">
            <Link href="/admin/ledger" className="text-sm font-semibold text-emerald-800 hover:underline">
              Open full payment ledger →
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
