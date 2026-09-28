import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { CATEGORIES, FLORIDA_CITIES, ORLANDO_PERMIT_RULES, haversineMiles } from "@/lib/cities";
import { Badge, Card } from "@/components/ui";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ListingCard } from "@/components/site/ListingCard";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://onsite-dumpsters.example.com";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return FLORIDA_CITIES.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const city = FLORIDA_CITIES.find((c) => c.slug === slug);
  if (!city) return { title: "City not found" };
  return {
    title: `Dumpster Rental in ${city.name}, ${city.state} — Compare Total Prices`,
    description: `Book a dumpster in ${city.name}, ${city.state} with one upfront total price, escrow-protected checkout, and verified haulers. 10–40 yard roll-offs and commercial containers.`,
  };
}

export default async function CityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const city = FLORIDA_CITIES.find((c) => c.slug === slug);
  if (!city) notFound();

  // Listings whose service circle covers the city center.
  const allActive = await db.listing
    .findMany({
      where: { status: "active" },
      include: { provider: { include: { providerProfile: true } } },
      orderBy: [{ ratingAvg: "desc" }, { bookingCount: "desc" }],
      take: 60,
    })
    .catch(() => []);

  const serving = allActive
    .filter(
      (l) =>
        l.serviceLat != null &&
        l.serviceLng != null &&
        haversineMiles(l.serviceLat, l.serviceLng, city.lat, city.lng) <= l.serviceRadiusMiles,
    )
    .slice(0, 12);

  const faqs = [
    {
      q: `How much does dumpster rental cost in ${city.name}?`,
      a: `Every listing shows one total price: the hauler's rental rate plus a $19 booking fee, a $29 drop-off fee, and a 2.9% + $0.30 payment processing fee — itemized before you pay, with no hidden charges.`,
    },
    {
      q: `Do I need a permit for a dumpster in ${city.name}?`,
      a: `Dumpsters placed on private property such as a driveway typically do not require a city permit in the Orlando area. Placement in the public right-of-way (street, sidewalk, alley) generally requires a right-of-way permit — confirm with the city before booking street placement, and check HOA rules.`,
    },
    {
      q: "Is my payment protected?",
      a: "Yes. Your payment is authorized at checkout and the rental amount is held in escrow until delivery is confirmed with photo proof. Booking, drop-off, and processing fees are platform fees and are non-refundable.",
    },
    {
      q: `What sizes are available in ${city.name}?`,
      a: "10, 15, 20, 30, and 40-yard roll-off dumpsters, plus front-load, rear-load, compactor, yard-waste, construction debris, concrete-only, grease, and recycling containers from verified haulers.",
    },
  ];

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Dumpster rentals serving ${city.name}, ${city.state}`,
    itemListElement: serving.map((l, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${APP_URL}/listings/${l.slug}`,
      name: l.title,
    })),
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const live = city.phase === 1;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-stone-500">
          <Link href="/" className="hover:underline">Home</Link>
          {" / "}
          <span aria-current="page" className="text-stone-700">{city.name}</span>
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-4xl">
            Dumpster rental in {city.name}, {city.state}
          </h1>
          {live ? <Badge tone="green">Now serving</Badge> : <Badge tone="amber">Phase {city.phase} — coming soon</Badge>}
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-600 sm:text-base">
          {city.blurb} Compare verified haulers serving {city.name} — one total price per listing
          (rental + $19 booking fee + $29 drop-off fee + 2.9% + $0.30 processing), escrow-protected
          checkout, and live delivery tracking.
        </p>
        <p className="mt-2 text-sm text-stone-500">
          Serving ZIPs: {city.zips.join(", ")}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/search?lat=${city.lat}&lng=${city.lng}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            Search dumpsters in {city.name}
          </Link>
          <Link
            href="/quiz"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-700 px-6 py-3.5 text-base font-semibold text-emerald-800 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            What size do I need?
          </Link>
        </div>

        {!live && (
          <Card className="mt-8 border-amber-300 bg-amber-50">
            <h2 className="font-bold text-amber-900">{city.name} opens in Phase {city.phase}</h2>
            <p className="mt-1 text-sm text-amber-800">
              We launch new cities only with verified hauler supply in place. Orlando and the Phase 1
              core are live today — join the waitlist by creating a free account and we&apos;ll notify
              you when {city.name} opens.
            </p>
            <Link href="/signup" className="mt-3 inline-block text-sm font-bold text-amber-900 underline">
              Create a free account →
            </Link>
          </Card>
        )}

        {serving.length > 0 && (
          <section className="mt-10" aria-labelledby="listings-heading">
            <h2 id="listings-heading" className="mb-4 text-xl font-bold text-stone-900">
              Haulers serving {city.name}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {serving.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={{
                    id: l.id,
                    slug: l.slug,
                    title: l.title,
                    sizeYards: l.sizeYards,
                    categoryLabel: CATEGORIES.find((c) => c.code === (l.category as string))?.name ?? String(l.category),
                    primaryPhoto: l.primaryPhoto,
                    basePriceCents: l.basePriceCents,
                    includedDays: l.includedDays,
                    ratingAvg: l.ratingAvg,
                    reviewCount: l.reviewCount,
                    providerName: l.provider.providerProfile?.businessName ?? l.provider.name ?? "Independent hauler",
                  }}
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-10 grid gap-6 lg:grid-cols-2" aria-label={`Renting a dumpster in ${city.name}`}>
          <Card>
            <h2 className="text-lg font-bold text-stone-900">Permit & placement guidance</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-stone-600">
              {ORLANDO_PERMIT_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-stone-900">Popular in {city.name}</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {CATEGORIES.slice(0, 6).map((c) => (
                <Link
                  key={c.slug}
                  href={`/categories/${c.slug}`}
                  className="rounded-lg border border-stone-200 px-3 py-2.5 text-sm font-medium text-stone-700 hover:border-emerald-600 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </Card>
        </section>

        <section className="mt-10" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-xl font-bold text-stone-900">
            FAQs — dumpster rental in {city.name}
          </h2>
          <div className="mt-4 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {faqs.map((f) => (
              <details key={f.q} className="px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 [&::-webkit-details-marker]:hidden">
                  {f.q}
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-label="Other cities">
          <h2 className="text-lg font-bold text-stone-900">Other Florida cities</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {FLORIDA_CITIES.filter((c) => c.slug !== city.slug).map((c) => (
              <Link
                key={c.slug}
                href={`/cities/${c.slug}`}
                className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 hover:border-emerald-600 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                {c.name}, {c.state}
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
