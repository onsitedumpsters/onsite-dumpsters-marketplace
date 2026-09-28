import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Category } from "@prisma/client";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/cities";
import { Card } from "@/components/ui";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ListingCard } from "@/components/site/ListingCard";
import { Stars } from "@/components/site/Stars";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://onsite-dumpsters.example.com";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ slug: c.slug }));
}

function faqsFor(name: string, tagline: string) {
  return [
    {
      q: `How much does ${name.toLowerCase()} rental cost in Orlando?`,
      a: `Every listing shows one total price up front: the hauler's rental rate plus a $19 booking fee, a $29 drop-off fee, and a 2.9% + $0.30 payment processing fee. Compare totals across verified haulers — never a teaser rate.`,
    },
    {
      q: `What is ${name.toLowerCase()} best for?`,
      a: `${tagline} Check each listing's accepted materials and included days/tons before booking.`,
    },
    {
      q: "Is my payment protected?",
      a: "Yes. Your payment is authorized at checkout and the rental amount is held in escrow until delivery is confirmed with photo proof. Booking, drop-off, and processing fees are platform fees and are non-refundable.",
    },
    {
      q: "Do I need a permit in Orlando?",
      a: "Dumpsters on private property (driveway) typically need no city permit in Orlando. Street or sidewalk placement generally requires a City of Orlando right-of-way permit — confirm before booking.",
    },
  ];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const cat = CATEGORIES.find((c) => c.slug === slug);
  if (!cat) return { title: "Category not found" };
  return {
    title: `${cat.name} Rental in Orlando, FL — Compare Total Prices`,
    description: `Book ${cat.name.toLowerCase()} in Orlando, Florida with one upfront total price, escrow-protected checkout, and verified haulers. ${cat.tagline}`,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cat = CATEGORIES.find((c) => c.slug === slug);
  if (!cat) notFound();

  const listings = await db.listing
    .findMany({
      where: { status: "active", category: cat.code as Category },
      include: { provider: { include: { providerProfile: true } } },
      orderBy: [{ ratingAvg: "desc" }, { bookingCount: "desc" }],
      take: 12,
    })
    .catch(() => []);

  const faqs = faqsFor(cat.name, cat.tagline);

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${cat.name} rentals in Orlando, FL`,
    itemListElement: listings.map((l, i) => ({
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

  const other = CATEGORIES.filter((c) => c.slug !== cat.slug).slice(0, 6);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-stone-500">
          <Link href="/" className="hover:underline">Home</Link>
          {" / "}
          <span aria-current="page" className="text-stone-700">{cat.name}</span>
        </nav>

        <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-4xl">
          {cat.name} rental in Orlando, FL
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-600 sm:text-base">
          {cat.tagline} Compare verified Orlando haulers side by side — every listing shows one
          total price (rental + $19 booking fee + $29 drop-off fee + 2.9% + $0.30 processing),
          itemized before you pay. Your rental payment is held in escrow until delivery is confirmed.
        </p>
        {cat.sizes.length > 0 && (
          <p className="mt-3 text-sm text-stone-500">
            Available sizes: <strong>{cat.sizes.map((s) => `${s} yd`).join(" · ")}</strong>
          </p>
        )}

        <div className="mt-6">
          <Link
            href={`/search?category=${cat.code}`}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            Search {cat.name.toLowerCase()} near you
          </Link>
        </div>

        {listings.length > 0 && (
          <section className="mt-10" aria-labelledby="listings-heading">
            <h2 id="listings-heading" className="mb-4 text-xl font-bold text-stone-900">
              Top-rated {cat.name.toLowerCase()}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={{
                    id: l.id,
                    slug: l.slug,
                    title: l.title,
                    sizeYards: l.sizeYards,
                    categoryLabel: cat.name,
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

        <section className="mt-10 grid gap-6 lg:grid-cols-2" aria-label="About this category">
          <Card>
            <h2 className="text-lg font-bold text-stone-900">What fits in {cat.sizes.length > 0 ? `a ${cat.sizes.join("/")} yard` : "this"} dumpster?</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">
              {cat.tagline} As a rule of thumb, a 10-yard dumpster holds about 3 pickup-truck loads,
              a 20-yard about 6, a 30-yard about 9, and a 40-yard about 12. When in doubt, size up —
              overage and swap fees cost more than the next size. Not sure? Take our{" "}
              <Link href="/quiz" className="font-semibold text-emerald-700 hover:underline">60-second size quiz</Link>.
            </p>
          </Card>
          <Card>
            <h2 className="text-lg font-bold text-stone-900">Orlando booking tips</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-stone-600">
              <li>Book 3–5 days ahead in spring and after storms — Orlando demand spikes.</li>
              <li>Driveway placement usually needs no permit; street placement does.</li>
              <li>Confirm accepted materials on the listing — concrete, dirt, and roofing have weight limits.</li>
              <li>Your rental payment stays in escrow until delivery is confirmed with photo proof.</li>
            </ul>
          </Card>
        </section>

        {listings.length > 0 && listings[0].reviewCount > 0 && (
          <section className="mt-10" aria-label="Rating summary">
            <div className="flex items-center gap-3">
              <Stars value={listings[0].ratingAvg} />
              <p className="text-sm text-stone-500">
                Top listing rated {listings[0].ratingAvg.toFixed(1)} from {listings[0].reviewCount} job-verified reviews
              </p>
            </div>
          </section>
        )}

        <section className="mt-10" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-xl font-bold text-stone-900">FAQs — {cat.name}</h2>
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

        <section className="mt-10" aria-label="Related categories">
          <h2 className="text-lg font-bold text-stone-900">Related dumpster types</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {other.map((c) => (
              <Link
                key={c.slug}
                href={`/categories/${c.slug}`}
                className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-sm font-medium text-stone-700 hover:border-emerald-600 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
