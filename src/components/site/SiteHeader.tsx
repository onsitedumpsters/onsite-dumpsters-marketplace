import Link from "next/link";
import { auth } from "@/auth";
import { CATEGORIES, FLORIDA_CITIES } from "@/lib/cities";

function dashboardHref(role?: string | null): string {
  switch (role) {
    case "admin":
      return "/admin";
    case "provider":
      return "/dashboard/provider";
    case "fleet_owner":
      return "/dashboard/fleet";
    default:
      return "/dashboard/client";
  }
}

function NavDropdown({
  label,
  items,
}: {
  label: string;
  items: Array<{ href: string; title: string; sub?: string }>;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-haspopup="true"
        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-emerald-50 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
      >
        {label}
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
          <path d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z" />
        </svg>
      </button>
      <div className="invisible absolute left-0 top-full z-50 w-80 translate-y-1 rounded-xl border border-stone-200 bg-white p-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2.5 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          >
            <span className="block text-sm font-semibold text-stone-900">{item.title}</span>
            {item.sub && <span className="block text-xs text-stone-500">{item.sub}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

export async function SiteHeader() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role ?? null;
  const name = session?.user?.name ?? session?.user?.email ?? null;

  const desktopLink =
    "rounded-lg px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-emerald-50 hover:text-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600";

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
          aria-label="Onsite Dumpsters Marketplace — home"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-700 text-lg font-black text-white" aria-hidden="true">
            O
          </span>
          <span className="hidden text-base font-bold tracking-tight text-stone-900 min-[420px]:block">
            Onsite Dumpsters
            <span className="ml-1.5 hidden text-xs font-medium text-stone-400 lg:inline">Marketplace</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          <Link href="/" className={desktopLink}>
            Home
          </Link>
          <NavDropdown
            label="Categories"
            items={CATEGORIES.map((c) => ({
              href: `/categories/${c.slug}`,
              title: c.name,
              sub: c.tagline,
            }))}
          />
          <NavDropdown
            label="Cities"
            items={FLORIDA_CITIES.map((c) => ({
              href: `/cities/${c.slug}`,
              title: `${c.name}, ${c.state}`,
              sub: c.phase === 1 ? "Now serving" : `Phase ${c.phase} — coming soon`,
            }))}
          />
          <Link href="/search" className={desktopLink}>
            Search
          </Link>
          <Link href="/quiz" className={desktopLink}>
            Size Quiz
          </Link>
          <Link href="/dashboard/fleet" className={desktopLink}>
            Promote
          </Link>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {session?.user ? (
            <>
              <span className="max-w-36 truncate text-sm text-stone-500" title={name ?? undefined}>
                {name}
              </span>
              <Link
                href={dashboardHref(role)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/signin"
                className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                Get started
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu */}
        <details className="md:hidden">
          <summary className="cursor-pointer list-none rounded-lg p-2 text-stone-700 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 [&::-webkit-details-marker]:hidden" aria-label="Open menu">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </summary>
          <nav
            className="absolute inset-x-0 top-16 z-50 max-h-[80vh] overflow-y-auto border-b border-stone-200 bg-white p-4 shadow-xl"
            aria-label="Mobile"
          >
            <div className="grid gap-1">
              <Link href="/" className="rounded-lg px-3 py-2.5 text-sm font-semibold text-stone-900 hover:bg-emerald-50">
                Home
              </Link>
              <Link href="/search" className="rounded-lg px-3 py-2.5 text-sm font-semibold text-stone-900 hover:bg-emerald-50">
                Search dumpsters
              </Link>
              <Link href="/quiz" className="rounded-lg px-3 py-2.5 text-sm font-semibold text-stone-900 hover:bg-emerald-50">
                Size quiz
              </Link>
              <Link href="/dashboard/fleet" className="rounded-lg px-3 py-2.5 text-sm font-semibold text-stone-900 hover:bg-emerald-50">
                Promote your fleet
              </Link>
              <p className="mt-2 px-3 text-xs font-bold uppercase tracking-wide text-stone-400">Categories</p>
              {CATEGORIES.map((c) => (
                <Link key={c.slug} href={`/categories/${c.slug}`} className="rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-emerald-50">
                  {c.name}
                </Link>
              ))}
              <p className="mt-2 px-3 text-xs font-bold uppercase tracking-wide text-stone-400">Cities</p>
              {FLORIDA_CITIES.map((c) => (
                <Link key={c.slug} href={`/cities/${c.slug}`} className="rounded-lg px-3 py-2 text-sm text-stone-700 hover:bg-emerald-50">
                  {c.name}, {c.state}
                </Link>
              ))}
              <div className="mt-3 border-t border-stone-100 pt-3">
                {session?.user ? (
                  <Link
                    href={dashboardHref(role)}
                    className="flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
                  >
                    Go to dashboard
                  </Link>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/signin"
                      className="flex items-center justify-center rounded-lg border border-emerald-700 px-4 py-3 text-sm font-semibold text-emerald-800"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/signup"
                      className="flex items-center justify-center rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
                    >
                      Get started
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </nav>
        </details>
      </div>
    </header>
  );
}
