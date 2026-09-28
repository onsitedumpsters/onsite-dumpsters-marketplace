import Link from "next/link";
import { CATEGORIES, FLORIDA_CITIES } from "@/lib/cities";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-stone-200 bg-emerald-950 text-emerald-50">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <p className="text-lg font-bold tracking-tight text-white">Onsite Dumpsters</p>
          <p className="mt-2 text-sm leading-relaxed text-emerald-100/80">
            The transparent dumpster rental marketplace for Orlando, Florida. Compare total prices,
            book verified haulers, and pay through delivery-protected checkout.
          </p>
          <a
            href="https://onsitedumpsters.blogspot.com"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block text-sm font-semibold text-amber-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          >
            Read our dumpster guides →
          </a>
        </div>
        <nav aria-label="Popular categories">
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-200">Dumpster sizes</p>
          <ul className="mt-3 space-y-2 text-sm">
            {CATEGORIES.slice(0, 6).map((c) => (
              <li key={c.slug}>
                <Link href={`/categories/${c.slug}`} className="text-emerald-100/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Service cities">
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-200">Service areas</p>
          <ul className="mt-3 space-y-2 text-sm">
            {FLORIDA_CITIES.map((c) => (
              <li key={c.slug}>
                <Link href={`/cities/${c.slug}`} className="text-emerald-100/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                  {c.name}, {c.state}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Marketplace">
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-200">Marketplace</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/search" className="text-emerald-100/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                Search dumpsters
              </Link>
            </li>
            <li>
              <Link href="/quiz" className="text-emerald-100/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                What size do I need?
              </Link>
            </li>
            <li>
              <Link href="/#fees" className="text-emerald-100/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                Transparent fees
              </Link>
            </li>
            <li>
              <Link href="/dashboard/fleet" className="text-emerald-100/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                Promote your fleet
              </Link>
            </li>
            <li>
              <Link href="/signin" className="text-emerald-100/80 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-emerald-900">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-5 text-xs text-emerald-100/60 sm:flex-row sm:px-6">
          <p>© 2026 Onsite Dumpsters Marketplace. All rights reserved.</p>
          <p className="flex flex-wrap items-center justify-center gap-x-3">
            <Link href="/terms" className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Privacy Policy</Link>
            <span>Booking fee $19 · Drop-off fee $29 · Payment processing 2.9% + $0.30 — all non-refundable.</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
