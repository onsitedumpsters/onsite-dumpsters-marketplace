import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { CATEGORIES, FLORIDA_CITIES, LAUNCH_CITY, ORLANDO_PERMIT_RULES } from "@/lib/cities";
import { calculateFees, formatCents } from "@/lib/fees";
import { FeeBreakdownTable } from "@/components/FeeBreakdown";
import { Badge, Button, Card } from "@/components/ui";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { Stars } from "@/components/site/Stars";

export const metadata: Metadata = {
  title: "Onsite Dumpsters Marketplace — Compare & Book Dumpster Rentals in Orlando, FL",
  description:
    "Book verified dumpster rentals in Orlando, Florida. Compare total prices up front, pay through escrow-protected checkout, and track delivery live. 10–40 yard roll-offs and commercial containers.",
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://onsite-dumpsters.example.com";

function categoryLabel(code: string): string {
  return CATEGORIES.find((c) => c.code === code)?.name ?? code;
}

async function getFeaturedCampaigns() {
  const now = new Date();
  const placement = await db.adPlacement.findUnique({ where: { code: "homepage_feature" } });
  if (!placement) return [];
  return db.adCampaign.findMany({
    where: {
      placementId: placement.id,
      status: "active",
      startsAt: { lte: now },
      endsAt: { gte: now },
      listingId: { not: null },
    },
    include: { listing: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
}

const HOME_FAQS = [
  {
    q: "How much does it cost to rent a dumpster in Orlando?",
    a: "Every listing shows one total price up front: the hauler's rental rate plus a $19 booking fee, a $29 drop-off fee, and a 2.9% + $0.30 payment processing fee. There are no hidden charges — what you see at checkout is what you pay.",
  },
  {
    q: "What is escrow-protected booking?",
    a: "When you book, your payment is authorized but not captured. The rental amount is held in escrow and only released to the hauler after your dumpster is delivered. The booking, drop-off, and processing fees are platform fees and are non-refundable.",
  },
  {
    q: "Do I need a permit for a dumpster in Orlando?",
    a: "Dumpsters placed on private property such as a driveway in Orlando typically do not require a city permit. Placement in the public right-of-way (street, sidewalk, or alley) generally requires a City of Orlando right-of-way permit — confirm before booking street placement, and check HOA rules.",
  },
  {
    q: "What size dumpster do I need?",
    a: "10-yard dumpsters suit small cleanouts and garage junk; 20-yard is the most popular size for remodels and flooring; 30-yard fits whole-home cleanouts and construction debris; 40-yard handles major construction. Take our 60-second size quiz if you're unsure.",
  },
  {
    q: "What can't go in a rental dumpster?",
    a: "Hazardous waste, tires, batteries, liquids, and asbestos are never permitted. Each listing spells out its accepted and prohibited materials — check the listing detail page before you book.",
  },
  {
    q: "Can I cancel my booking?",
    a: "Yes. Cancel more than 48 hours before scheduled delivery for a full refund of the rental amount; 24–48 hours before delivery for a 50% refund of the rental amount; less than 24 hours before delivery or after dispatch is non-refundable. Booking, drop-off, and processing fees are never refundable.",
  },
];

export default async function HomePage() {
  const featured = await getFeaturedCampaigns().catch(() => []);
  const exampleFees = calculateFees(34900); // $349 example rental

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Onsite Dumpsters Marketplace",
    url: APP_URL,
    logo: `${APP_URL}/favicon.ico`,
    sameAs: ["https://onsitedumpsters.blogspot.com", "https://www.pinterest.com/dumpstersonsite/"],
    contactPoint: {
      "@type": "ContactPoint",
      email: "dumpstersonsite@gmail.com",
      contactType: "customer service",
      areaServed: "Orlando, FL",
    },
  };
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Onsite Dumpsters Marketplace",
    url: APP_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${APP_URL}/search?zip={zip}` },
      "query-input": "required name=zip",
    },
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <SiteHeader />

      <main>
        {/* ── Hero ─────────────────────────────────────────── */}
        <section className="bg-emerald-950 text-white">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
            <div className="max-w-3xl">
              <Badge tone="amber">Now live in Orlando, FL</Badge>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
                Book a dumpster in Orlando with one honest, total price.
              </h1>
              <p className="mt-4 text-base leading-relaxed text-emerald-100/90 sm:text-lg">
                Compare verified local haulers, see every fee itemized before you pay, and book with
                escrow-protected checkout — your money is only released to the hauler after delivery.
              </p>
            </div>

            {/* Search widget (plain GET form — works without JS) */}
            <form
              action="/search"
              method="get"
              className="mt-8 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-xl sm:flex-row sm:items-end"
              aria-label="Search dumpster rentals"
            >
              <div className="flex-1">
                <label htmlFor="hero-zip" className="mb-1 block text-sm font-semibold text-stone-800">
                  ZIP code
                </label>
                <input
                  id="hero-zip"
                  name="zip"
                  inputMode="numeric"
                  pattern="[0-9]{5}"
                  maxLength={5}
                  placeholder="32801"
                  required
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="hero-category" className="mb-1 block text-sm font-semibold text-stone-800">
                  Dumpster type
                </label>
                <select
                  id="hero-category"
                  name="category"
                  defaultValue=""
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30"
                >
                  <option value="">All types</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" size="lg" className="sm:w-auto">
                Search dumpsters
              </Button>
            </form>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-emerald-100/80">
              <span>✓ Total-price comparison</span>
              <span>✓ Escrow-protected payments</span>
              <span>✓ Verified Orlando haulers</span>
              <span>✓ Live delivery tracking</span>
            </div>
          </div>
        </section>

        {/* ── Category grid ────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6" aria-labelledby="categories-heading">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 id="categories-heading" className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                Browse by dumpster type
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                From 10-yard cleanout bins to 40-yard construction containers and commercial service.
              </p>
            </div>
            <Link href="/quiz" className="hidden shrink-0 text-sm font-semibold text-emerald-700 hover:underline sm:block">
              Not sure what size? Take the quiz →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((c) => (
              <Link
                key={c.slug}
                href={`/categories/${c.slug}`}
                className="group rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <h3 className="font-bold text-stone-900 group-hover:text-emerald-800">{c.name}</h3>
                <p className="mt-1 text-sm text-stone-500">{c.tagline}</p>
                {c.sizes.length > 0 && (
                  <p className="mt-2 text-xs font-semibold text-stone-400">
                    Sizes: {c.sizes.map((s) => `${s} yd`).join(" · ")}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>

        {/* ── How it works (escrow explainer) ──────────────── */}
        <section className="bg-white py-12" aria-labelledby="how-heading">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <h2 id="how-heading" className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              How escrow-protected booking works
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-stone-500">
              Your payment is authorized at checkout but the rental amount is held in escrow — the
              hauler only gets paid after your dumpster is delivered.
            </p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { n: "1", t: "Compare total prices", d: "Every listing shows one all-in price: rental + $19 booking fee + $29 drop-off fee + 2.9% + $0.30 processing. No surprises." },
                { n: "2", t: "Book & authorize", d: "Pay by card at checkout. We authorize the total; the rental amount sits in escrow while the hauler accepts and dispatches your job." },
                { n: "3", t: "Delivery confirmed", d: "The hauler uploads photo proof on delivery. Once confirmed, we capture the payment — your rental money is released from escrow." },
                { n: "4", t: "Pickup & review", d: "Schedule pickup when you're done, track it live, then leave a job-verified review that helps the next customer." },
              ].map((s) => (
                <li key={s.n} className="rounded-xl border border-stone-200 bg-stone-50 p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-base font-black text-white">
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-bold text-stone-900">{s.t}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-stone-600">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── Featured carousel ────────────────────────────── */}
        {featured.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6" aria-labelledby="featured-heading">
            <div className="mb-6 flex items-end justify-between">
              <h2 id="featured-heading" className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                Featured listings
              </h2>
              <Link href="/search" className="text-sm font-semibold text-emerald-700 hover:underline">
                View all →
              </Link>
            </div>
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2" role="list">
              {featured.map((campaign) =>
                campaign.listing ? (
                  <article
                    key={campaign.id}
                    role="listitem"
                    className="w-72 shrink-0 snap-start overflow-hidden rounded-xl border border-amber-300 bg-white shadow-sm"
                  >
                    <Link href={`/listings/${campaign.listing.slug}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600">
                      <div className="relative aspect-[4/3] bg-stone-100">
                        {campaign.listing.primaryPhoto ? (
                          <img src={campaign.listing.primaryPhoto} alt={campaign.title} loading="lazy" className="h-full w-full object-cover" />
                        ) : null}
                        <span className="absolute left-2 top-2">
                          <Badge tone="amber">Featured</Badge>
                        </span>
                      </div>
                      <div className="p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          {categoryLabel(campaign.listing.category)}
                        </p>
                        <h3 className="mt-1 line-clamp-2 font-bold text-stone-900">{campaign.title}</h3>
                        <div className="mt-2 flex items-center justify-between">
                          <Stars value={campaign.listing.ratingAvg} count={campaign.listing.reviewCount} />
                          <p className="font-bold tabular-nums text-emerald-800">
                            {formatCents(calculateFees(campaign.listing.basePriceCents).grandTotalCents)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </article>
                ) : null,
              )}
            </div>
          </section>
        )}

        {/* ── Fee transparency ─────────────────────────────── */}
        <section id="fees" className="bg-white py-12" aria-labelledby="fees-heading">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <h2 id="fees-heading" className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                Transparent fees, always itemized
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Every checkout, receipt, and order page shows the same itemized breakdown. The
                booking fee, drop-off fee, and payment processing fee are platform fees and are{" "}
                <strong>non-refundable</strong> under all circumstances. Only the rental amount is
                held in escrow — and only the rental amount is ever refunded on cancellation.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-stone-700">
                <li><strong>$19 booking fee</strong> — flat per order, platform revenue.</li>
                <li><strong>$29 drop-off fee</strong> — flat per delivery, platform revenue.</li>
                <li><strong>2.9% + $0.30 processing</strong> — labeled “Payment processing fee (Stripe)”.</li>
                <li><strong>8% take rate</strong> — deducted from the hauler&apos;s payout, not added to your total.</li>
              </ul>
              <p className="mt-4 text-xs text-stone-500">
                Example below for a $349.00 rental. Fee amounts are versioned and admin-configurable;
                the schedule in effect at booking always applies.
              </p>
            </div>
            <div>
              <FeeBreakdownTable breakdown={exampleFees} showPolicy />
            </div>
          </div>
        </section>

        {/* ── Orlando SEO copy ─────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6" aria-labelledby="orlando-heading">
          <h2 id="orlando-heading" className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Dumpster rental in Orlando, Florida
          </h2>
          <div className="mt-4 grid gap-6 text-sm leading-relaxed text-stone-600 lg:grid-cols-2">
            <div className="space-y-4">
              <p>
                Renting a dumpster in {LAUNCH_CITY.name} shouldn&apos;t mean calling five haulers for
                five different quotes. Onsite Dumpsters Marketplace lists verified local haulers across{" "}
                {LAUNCH_CITY.zips.slice(0, 5).join(", ")} and the greater Orlando metro, each with one
                upfront total price — rental, fees, and processing included — so you can compare
                apples to apples in minutes.
              </p>
              <p>
                Whether you&apos;re clearing out a garage in Winter Park, re-roofing in Kissimmee, or
                running a job site near downtown Orlando, choose from 10, 15, 20, 30, and 40-yard
                roll-off dumpsters plus front-load, rear-load, compactor, yard-waste, construction
                debris, concrete-only, grease, and recycling containers. Every booking is
                escrow-protected: your rental payment is held until delivery is confirmed with photo
                proof.
              </p>
            </div>
            <div>
              <h3 className="font-bold text-stone-900">Orlando permit & placement guidance</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {ORLANDO_PERMIT_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {FLORIDA_CITIES.filter((c) => c.phase === 1).map((c) => (
                  <Link key={c.slug} href={`/cities/${c.slug}`}>
                    <Badge tone="green">{c.name}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <Card className="mt-8 flex flex-col items-start justify-between gap-4 bg-emerald-50 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-bold text-stone-900">Want dumpster know-how before you book?</h3>
              <p className="text-sm text-stone-600">
                Our 17-guide series covers every dumpster style, sizing math, and Florida permit tips.
              </p>
            </div>
            <a
              href="https://onsitedumpsters.blogspot.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              Read the Onsite Dumpsters blog
            </a>
          </Card>
        </section>

        {/* ── FAQ ──────────────────────────────────────────── */}
        <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Frequently asked questions
          </h2>
          <div className="mt-6 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {HOME_FAQS.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold text-stone-900 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-emerald-700 transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.a}</p>
              </details>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/search"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
            >
              Search dumpsters near you
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
