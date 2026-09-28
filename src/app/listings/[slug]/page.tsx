import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { CATEGORIES } from "@/lib/cities";
import { calculateFees, formatCents } from "@/lib/fees";
import { FeeBreakdownTable } from "@/components/FeeBreakdown";
import { Badge, Card } from "@/components/ui";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SearchMap } from "@/components/site/SearchMap";
import { Stars } from "@/components/site/Stars";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://onsite-dumpsters.example.com";

function categoryLabel(code: string): string {
  return CATEGORIES.find((c) => c.code === code)?.name ?? code;
}

async function getListing(slug: string) {
  return db.listing.findUnique({
    where: { slug },
    include: {
      provider: { include: { providerProfile: true } },
      reviews: {
        include: { client: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const listing = await getListing(slug).catch(() => null);
  if (!listing) return { title: "Listing not found" };
  const total = calculateFees(listing.basePriceCents).grandTotalCents;
  return {
    title: `${listing.title} — ${formatCents(total)} total`,
    description: `${listing.sizeYards ? `${listing.sizeYards}-yard ` : ""}${categoryLabel(listing.category)} rental in Orlando, FL. ${formatCents(total)} total price including all fees. ${listing.description.slice(0, 120)}`,
  };
}

export default async function ListingDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const listing = await getListing(slug).catch(() => null);
  if (!listing || listing.status !== "active") notFound();

  const fees = calculateFees(listing.basePriceCents);
  const profile = listing.provider.providerProfile;
  const businessName = profile?.businessName ?? listing.provider.name ?? "Independent hauler";
  const photos = [listing.primaryPhoto, ...listing.photos].filter((p): p is string => Boolean(p));
  const uniquePhotos = [...new Set(photos)];
  const hasMap = listing.serviceLat != null && listing.serviceLng != null;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description,
    image: uniquePhotos,
    category: categoryLabel(listing.category),
    aggregateRating:
      listing.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: listing.ratingAvg.toFixed(1),
            reviewCount: listing.reviewCount,
          }
        : undefined,
    offers: {
      "@type": "Offer",
      url: `${APP_URL}/listings/${listing.slug}`,
      priceCurrency: "USD",
      price: (fees.grandTotalCents / 100).toFixed(2),
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: businessName },
      priceSpecification: [
        { "@type": "PriceSpecification", name: "Rental subtotal (held until delivery)", price: (fees.rentalSubtotalCents / 100).toFixed(2), priceCurrency: "USD" },
        { "@type": "PriceSpecification", name: "Booking fee (platform, non-refundable)", price: (fees.bookingFeeCents / 100).toFixed(2), priceCurrency: "USD" },
        { "@type": "PriceSpecification", name: "Drop-off fee (platform, non-refundable)", price: (fees.droppingFeeCents / 100).toFixed(2), priceCurrency: "USD" },
        { "@type": "PriceSpecification", name: "Payment processing fee (Stripe) (platform, non-refundable)", price: (fees.processingFeeCents / 100).toFixed(2), priceCurrency: "USD" },
      ],
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-stone-500">
          <Link href="/" className="hover:underline">Home</Link>
          {" / "}
          <Link href="/search" className="hover:underline">Search</Link>
          {" / "}
          <span aria-current="page" className="text-stone-700">{listing.title}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* Gallery */}
            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Listing photos">
              {uniquePhotos.length > 0 ? (
                uniquePhotos.slice(0, 4).map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt={`${listing.title} — photo ${i + 1}`}
                    loading={i === 0 ? "eager" : "lazy"}
                    className={i === 0 ? "aspect-[4/3] w-full rounded-xl object-cover sm:col-span-2" : "aspect-[4/3] w-full rounded-xl object-cover"}
                  />
                ))
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center rounded-xl bg-stone-100 text-stone-400 sm:col-span-2">
                  No photos yet
                </div>
              )}
            </div>

            {/* Title + provider */}
            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green">{categoryLabel(listing.category)}</Badge>
                {listing.sizeYards && <Badge tone="neutral">{listing.sizeYards} yard</Badge>}
                <Badge tone="blue">{listing.includedDays} days included</Badge>
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">{listing.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Stars value={listing.ratingAvg} count={listing.reviewCount} />
                <span className="text-sm text-stone-500">
                  by <span className="font-semibold text-stone-700">{businessName}</span>
                </span>
                {profile?.verificationStatus === "approved" && <Badge tone="green">Verified hauler</Badge>}
              </div>
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-stone-700">{listing.description}</p>
            </div>

            {/* Rate card */}
            <Card className="mt-6">
              <h2 className="text-lg font-bold text-stone-900">Rate card & estimated total</h2>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-stone-50 p-3">
                  <dt className="text-xs text-stone-500">Rental</dt>
                  <dd className="font-bold tabular-nums">{formatCents(listing.basePriceCents)}</dd>
                </div>
                <div className="rounded-lg bg-stone-50 p-3">
                  <dt className="text-xs text-stone-500">Included</dt>
                  <dd className="font-bold">{listing.includedDays} days · {listing.includedTons} tons</dd>
                </div>
                <div className="rounded-lg bg-stone-50 p-3">
                  <dt className="text-xs text-stone-500">Extra ton</dt>
                  <dd className="font-bold tabular-nums">{formatCents(listing.overagePerTonCents)}</dd>
                </div>
                <div className="rounded-lg bg-stone-50 p-3">
                  <dt className="text-xs text-stone-500">Extra day</dt>
                  <dd className="font-bold tabular-nums">{formatCents(listing.extraDayCents)}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <FeeBreakdownTable breakdown={fees} showPolicy />
              </div>
            </Card>

            {/* Materials */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Card>
                <h2 className="font-bold text-stone-900">Accepted materials</h2>
                {listing.materialsAccepted.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-600">
                    {listing.materialsAccepted.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-stone-500">Ask the hauler about specific materials.</p>
                )}
              </Card>
              <Card>
                <h2 className="font-bold text-stone-900">Prohibited materials</h2>
                {listing.materialsProhibited.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-600">
                    {listing.materialsProhibited.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-stone-500">
                    Hazardous waste, tires, batteries, liquids, and asbestos are never permitted.
                  </p>
                )}
              </Card>
            </div>

            {/* Service map */}
            {hasMap && (
              <Card className="mt-6">
                <h2 className="font-bold text-stone-900">Service area</h2>
                <p className="mt-1 text-sm text-stone-500">
                  This hauler serves addresses within {listing.serviceRadiusMiles} miles of their depot (shaded area).
                </p>
                <div className="mt-3">
                  <SearchMap
                    center={[listing.serviceLat as number, listing.serviceLng as number]}
                    zoom={10}
                    radiusMiles={listing.serviceRadiusMiles}
                    markers={[
                      {
                        id: listing.id,
                        lat: listing.serviceLat as number,
                        lng: listing.serviceLng as number,
                        title: businessName,
                        sizeLabel: "Depot",
                      },
                    ]}
                    ariaLabel={`Service area map for ${businessName}`}
                  />
                </div>
              </Card>
            )}

            {/* Reviews */}
            <section className="mt-6" aria-labelledby="reviews-heading">
              <h2 id="reviews-heading" className="text-lg font-bold text-stone-900">
                Reviews {listing.reviewCount > 0 && `(${listing.reviewCount})`}
              </h2>
              {listing.reviews.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">
                  No job-verified reviews yet — be the first to book and review this listing.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {listing.reviews.map((r) => (
                    <Card key={r.id}>
                      <div className="flex items-center justify-between gap-2">
                        <Stars value={r.rating} />
                        <span className="text-xs text-stone-400">{new Date(r.createdAt).toLocaleDateString("en-US")}</span>
                      </div>
                      {r.title && <p className="mt-1 font-semibold text-stone-900">{r.title}</p>}
                      {r.body && <p className="mt-1 text-sm text-stone-600">{r.body}</p>}
                      <p className="mt-2 text-xs text-stone-400">
                        Verified booking · {r.client.name ?? "Customer"}
                      </p>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-24">
              <Card className="border-emerald-200 bg-emerald-50/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Estimated total</p>
                <p className="mt-1 text-3xl font-black tabular-nums text-emerald-900">{formatCents(fees.grandTotalCents)}</p>
                <p className="mt-1 text-xs text-stone-500">Rental + $19 booking + $29 drop-off + processing, all itemized at checkout.</p>
                <Link
                  href={`/book/${listing.id}`}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                >
                  Book now
                </Link>
                <p className="mt-2 text-center text-xs text-stone-500">
                  Delivery-protected: rental held until delivery is confirmed.
                </p>
              </Card>

              <Card className="mt-4">
                <h2 className="font-bold text-stone-900">About the hauler</h2>
                <p className="mt-1 font-semibold text-stone-800">{businessName}</p>
                {profile?.bio && <p className="mt-1 text-sm text-stone-600">{profile.bio}</p>}
                <div className="mt-3 space-y-1.5 text-sm text-stone-600">
                  <div className="flex items-center justify-between">
                    <span>Rating</span>
                    <Stars value={profile?.ratingAvg ?? 0} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Completed jobs</span>
                    <span className="font-semibold tabular-nums">{profile?.completedJobs ?? 0}</span>
                  </div>
                  {profile?.city && (
                    <div className="flex items-center justify-between">
                      <span>Based in</span>
                      <span className="font-semibold">{profile.city}, {profile.state}</span>
                    </div>
                  )}
                </div>
                {profile?.verificationStatus === "approved" ? (
                  <p className="mt-3"><Badge tone="green">Verified hauler</Badge></p>
                ) : (
                  <p className="mt-3"><Badge tone="amber">Verification pending</Badge></p>
                )}
              </Card>
            </div>
          </aside>
        </div>
      </main>

      {/* Sticky mobile book bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black tabular-nums text-stone-900">{formatCents(fees.grandTotalCents)}</p>
            <p className="text-[11px] text-stone-500">total incl. all fees</p>
          </div>
          <Link
            href={`/book/${listing.id}`}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            Book now
          </Link>
        </div>
      </div>
      <div className="h-20 md:hidden" aria-hidden="true" />

      <SiteFooter />
    </>
  );
}
