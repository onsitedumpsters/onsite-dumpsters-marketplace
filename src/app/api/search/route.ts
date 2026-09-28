import { NextResponse } from "next/server";
import { z } from "zod";
import type { Category } from "@prisma/client";
import { db } from "@/lib/db";
import { calculateFees } from "@/lib/fees";
import { CATEGORIES, FLORIDA_CITIES, LAUNCH_CITY, haversineMiles } from "@/lib/cities";

/**
 * ZIP → lat/lng lookup. Seeded from FLORIDA_CITIES plus extra Orlando-metro ZIPs.
 * Unknown ZIPs return 400 so callers can fall back to address geocoding.
 */
const ZIP_COORDS: Record<string, [number, number]> = Object.fromEntries(
  FLORIDA_CITIES.flatMap((c) => c.zips.map((zip) => [zip, [c.lat, c.lng]] as [string, [number, number]])),
);

// Extra Orlando-metro ZIPs (approximate centroids around 28.5, -81.4).
const EXTRA_ZIPS: Record<string, [number, number]> = {
  "32805": [28.53, -81.39],
  "32808": [28.565, -81.43],
  "32809": [28.485, -81.37],
  "32810": [28.6, -81.43],
  "32811": [28.51, -81.45],
  "32814": [28.575, -81.35],
  "32818": [28.55, -81.49],
  "32821": [28.335, -81.505],
  "32824": [28.385, -81.325],
  "32825": [28.555, -81.275],
  "32827": [28.41, -81.295],
  "32829": [28.575, -81.245],
  "32831": [28.525, -81.315],
  "32832": [28.505, -81.235],
  "32833": [28.59, -81.19],
  "32835": [28.55, -81.465],
  "32836": [28.445, -81.475],
  "32837": [28.4, -81.475],
  "32839": [28.495, -81.435],
  "32751": [28.555, -81.355],
  "32712": [28.635, -81.365],
  "32714": [28.64, -81.31],
  "32765": [28.66, -81.32],
  "32746": [28.62, -81.28],
  "32779": [28.75, -81.31],
  "32732": [28.81, -81.28],
  "32750": [28.67, -81.25],
  "34741": [28.292, -81.4079],
  "34744": [28.31, -81.42],
  "34747": [28.25, -81.55],
  "34761": [28.26, -81.33],
  "34769": [28.29, -81.48],
  "34787": [28.41, -81.59],
};
for (const [zip, coord] of Object.entries(EXTRA_ZIPS)) {
  ZIP_COORDS[zip] ??= coord;
}

const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  zip: z.string().regex(/^\d{5}$/).optional(),
  category: z
    .string()
    .optional()
    .refine((c) => !c || CATEGORY_CODES.includes(c), { message: "Unknown category" }),
  sizeYards: z.coerce.number().int().positive().max(100).optional(),
  maxTotalCents: z.coerce.number().int().positive().optional(),
  date: z.string().max(20).optional(), // informational for now (availability calendar is a provider feature)
});

interface ListingRow {
  id: string;
  slug: string;
  title: string;
  category: string;
  sizeYards: number | null;
  primaryPhoto: string | null;
  basePriceCents: number;
  includedDays: number;
  serviceLat: number | null;
  serviceLng: number | null;
  serviceRadiusMiles: number;
  ratingAvg: number;
  reviewCount: number;
  provider: {
    name: string | null;
    providerProfile: { businessName: string } | null;
  };
}

function serialize(row: ListingRow, campaignId?: string | null) {
  const totalCents = calculateFees(row.basePriceCents).grandTotalCents;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    categoryLabel: CATEGORIES.find((c) => c.code === row.category)?.name ?? row.category,
    sizeYards: row.sizeYards,
    primaryPhoto: row.primaryPhoto,
    basePriceCents: row.basePriceCents,
    includedDays: row.includedDays,
    totalCents,
    ratingAvg: row.ratingAvg,
    reviewCount: row.reviewCount,
    providerName: row.provider.providerProfile?.businessName ?? row.provider.name ?? "Independent hauler",
    serviceLat: row.serviceLat,
    serviceLng: row.serviceLng,
    campaignId: campaignId ?? null,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid search parameters.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const q = parsed.data;

  // Resolve the search point.
  let point: [number, number];
  if (q.lat != null && q.lng != null) {
    point = [q.lat, q.lng];
  } else if (q.zip) {
    const coord = ZIP_COORDS[q.zip];
    if (!coord) {
      return NextResponse.json(
        { error: `Unknown ZIP code "${q.zip}". Try a nearby ZIP or a street address.` },
        { status: 400 },
      );
    }
    point = coord;
  } else {
    // Default to the launch market so the page works with no location input.
    point = [LAUNCH_CITY.lat, LAUNCH_CITY.lng];
  }

  const listings = (await db.listing.findMany({
    where: {
      status: "active",
      ...(q.category ? { category: q.category as Category } : {}),
      ...(q.sizeYards ? { sizeYards: q.sizeYards } : {}),
    },
    include: { provider: { include: { providerProfile: { select: { businessName: true } } } } },
    orderBy: [{ ratingAvg: "desc" }, { bookingCount: "desc" }],
    take: 100,
  })) as unknown as ListingRow[];

  const inService = listings.filter(
    (l) =>
      l.serviceLat != null &&
      l.serviceLng != null &&
      haversineMiles(l.serviceLat, l.serviceLng, point[0], point[1]) <= l.serviceRadiusMiles,
  );

  const withTotals = inService
    .map((l) => ({ row: l, totalCents: calculateFees(l.basePriceCents).grandTotalCents }))
    .filter(({ totalCents }) => (q.maxTotalCents ? totalCents <= q.maxTotalCents : true));

  // ── Sponsored injection: active sponsored_search campaigns, max 3 ──
  // Sponsored listings are pinned separately and excluded from organic results.
  const now = new Date();
  const sponsoredPlacement = await db.adPlacement.findUnique({ where: { code: "sponsored_search" } });
  let sponsored: ReturnType<typeof serialize>[] = [];
  if (sponsoredPlacement) {
    const campaigns = await db.adCampaign.findMany({
      where: {
        placementId: sponsoredPlacement.id,
        status: "active",
        startsAt: { lte: now },
        endsAt: { gte: now },
        listingId: { not: null },
        // Don't pin listings that are no longer live — their detail pages 404.
        listing: { status: "active" },
      },
      include: {
        listing: {
          include: { provider: { include: { providerProfile: { select: { businessName: true } } } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    const sponsoredRows = campaigns
      .map((c) => ({ campaign: c, row: c.listing as unknown as ListingRow | null }))
      .filter(
        (x): x is { campaign: (typeof campaigns)[number]; row: ListingRow } =>
          x.row != null &&
          x.row.serviceLat != null &&
          x.row.serviceLng != null &&
          haversineMiles(x.row.serviceLat, x.row.serviceLng, point[0], point[1]) <= x.row.serviceRadiusMiles &&
          (!q.category || x.row.category === q.category) &&
          (!q.sizeYards || x.row.sizeYards === q.sizeYards),
      )
      .filter(({ row }) => (q.maxTotalCents ? calculateFees(row.basePriceCents).grandTotalCents <= q.maxTotalCents : true))
      .slice(0, 3);
    sponsored = sponsoredRows.map(({ row, campaign }) => serialize(row, campaign.id));
  }
  const sponsoredIds = new Set(sponsored.map((s) => s.id));

  const results = withTotals
    .filter(({ row }) => !sponsoredIds.has(row.id))
    .map(({ row }) => serialize(row));

  return NextResponse.json({ results, sponsored, center: point });
}
