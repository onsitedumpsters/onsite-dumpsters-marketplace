import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, sessionRole } from "@/lib/server-auth";
import { Badge } from "@/components/ui";

interface NavLink {
  href: string;
  label: string;
}

const NAV: Record<string, NavLink[]> = {
  client: [
    { href: "/dashboard/client/orders", label: "My Orders" },
    { href: "/dashboard/client/saved-jobs", label: "Saved Jobs" },
    { href: "/dashboard/client/notifications", label: "Notifications" },
  ],
  provider: [
    { href: "/dashboard/provider", label: "Overview" },
    { href: "/dashboard/provider/jobs", label: "Dispatch Board" },
    { href: "/dashboard/provider/listings", label: "Listings" },
    { href: "/dashboard/provider/payouts", label: "Payouts" },
    { href: "/dashboard/provider/verification", label: "Verification" },
    { href: "/dashboard/provider/reviews", label: "Reviews" },
  ],
  fleet_owner: [
    { href: "/dashboard/fleet", label: "Overview" },
    { href: "/dashboard/fleet/containers", label: "Containers" },
    { href: "/dashboard/fleet/payouts", label: "Payouts" },
    { href: "/dashboard/fleet/reports", label: "Reports" },
    { href: "/dashboard/fleet/promote", label: "Promote" },
  ],
  admin: [
    { href: "/admin", label: "Admin Panel" },
    { href: "/dashboard/provider", label: "Provider View" },
    { href: "/dashboard/fleet", label: "Fleet View" },
    { href: "/dashboard/client/orders", label: "Client View" },
  ],
};

const ROLE_LABELS: Record<string, string> = {
  client: "Client",
  provider: "Hauler",
  fleet_owner: "Fleet Owner",
  admin: "Admin",
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/signin");
  const role = sessionRole(session) ?? "client";
  const links = NAV[role] ?? NAV.client;

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-sm font-bold text-white">
              OD
            </span>
            <span className="font-bold text-stone-900">Onsite Dumpsters</span>
          </Link>
          <div className="flex items-center gap-3">
            <Badge tone="green">{ROLE_LABELS[role] ?? role}</Badge>
            <span className="hidden max-w-40 truncate text-sm text-stone-500 sm:block">
              {session.user?.email}
            </span>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-stone-600 hover:bg-stone-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        {/* Mobile / secondary nav */}
        <nav aria-label="Dashboard" className="border-t border-stone-100 md:hidden">
          <ul className="flex gap-1 overflow-x-auto px-3 py-2">
            {links.map((l) => (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  className="block rounded-lg px-3 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-50"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 md:block" aria-label="Dashboard sidebar">
          <nav className="sticky top-6 rounded-xl border border-stone-200 bg-white p-2">
            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-stone-700 hover:bg-emerald-50 hover:text-emerald-900"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
