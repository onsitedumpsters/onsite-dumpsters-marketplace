import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calculateFees } from "@/lib/fees";
import { CATEGORIES } from "@/lib/cities";

/** Public single listing (by id or slug) with provider profile and job-verified reviews. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id || id.length > 100) {
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  }

  const include = {
    provider: { include: { providerProfile: true } },
    reviews: {
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: "desc" as const },
      take: 20,
    },
  };

  const listing =
    (await db.listing.findUnique({ where: { id }, include }).catch(() => null)) ??
    (await db.listing.findUnique({ where: { slug: id }, include }).catch(() => null));

  if (!listing || listing.status !== "active") {
    return NextResponse.json({ error: "Listing not found." }, { status: 404 });
  }

  const fees = calculateFees(listing.basePriceCents);
  const profile = listing.provider.providerProfile;

  return NextResponse.json({
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    description: listing.description,
    category: listing.category,
    categoryLabel: CATEGORIES.find((c) => c.code === listing.category)?.name ?? listing.category,
    sizeYards: listing.sizeYards,
    photos: [listing.primaryPhoto, ...listing.photos].filter((p): p is string => Boolean(p)),
    rateCard: {
      basePriceCents: listing.basePriceCents,
      includedDays: listing.includedDays,
      includedTons: listing.includedTons,
      overagePerTonCents: listing.overagePerTonCents,
      extraDayCents: listing.extraDayCents,
    },
    estimatedTotalCents: fees.grandTotalCents,
    feeBreakdown: {
      rentalSubtotalCents: fees.rentalSubtotalCents,
      bookingFeeCents: fees.bookingFeeCents,
      droppingFeeCents: fees.droppingFeeCents,
      processingFeeCents: fees.processingFeeCents,
    },
    materialsAccepted: listing.materialsAccepted,
    materialsProhibited: listing.materialsProhibited,
    serviceArea: {
      lat: listing.serviceLat,
      lng: listing.serviceLng,
      radiusMiles: listing.serviceRadiusMiles,
      zips: listing.serviceZips,
    },
    ratingAvg: listing.ratingAvg,
    reviewCount: listing.reviewCount,
    bookingCount: listing.bookingCount,
    provider: {
      businessName: profile?.businessName ?? listing.provider.name ?? "Independent hauler",
      bio: profile?.bio ?? null,
      city: profile?.city ?? null,
      state: profile?.state ?? null,
      ratingAvg: profile?.ratingAvg ?? 0,
      reviewCount: profile?.reviewCount ?? 0,
      completedJobs: profile?.completedJobs ?? 0,
      verified: profile?.verificationStatus === "approved",
    },
    reviews: listing.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      author: r.client.name ?? "Verified customer",
      createdAt: r.createdAt,
    })),
  });
}
