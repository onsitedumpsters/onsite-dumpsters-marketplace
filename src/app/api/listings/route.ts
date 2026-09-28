import { NextResponse } from "next/server";
import { z } from "zod";
import type { Category } from "@prisma/client";
import { db } from "@/lib/db";
import { calculateFees } from "@/lib/fees";
import { CATEGORIES } from "@/lib/cities";

const CATEGORY_CODES = CATEGORIES.map((c) => c.code);

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  category: z
    .string()
    .optional()
    .refine((c) => !c || CATEGORY_CODES.includes(c), { message: "Unknown category" }),
});

/** Public, paginated list of active listings. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { page, pageSize, category } = parsed.data;
  const where = {
    status: "active" as const,
    ...(category ? { category: category as Category } : {}),
  };

  const [total, rows] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({
      where,
      include: { provider: { include: { providerProfile: { select: { businessName: true } } } } },
      orderBy: [{ ratingAvg: "desc" }, { bookingCount: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const items = rows.map((l) => ({
    id: l.id,
    slug: l.slug,
    title: l.title,
    category: l.category,
    categoryLabel: CATEGORIES.find((c) => c.code === l.category)?.name ?? l.category,
    sizeYards: l.sizeYards,
    primaryPhoto: l.primaryPhoto,
    basePriceCents: l.basePriceCents,
    includedDays: l.includedDays,
    totalCents: calculateFees(l.basePriceCents).grandTotalCents,
    ratingAvg: l.ratingAvg,
    reviewCount: l.reviewCount,
    providerName: l.provider.providerProfile?.businessName ?? l.provider.name ?? "Independent hauler",
  }));

  return NextResponse.json({ items, page, pageSize, total });
}
