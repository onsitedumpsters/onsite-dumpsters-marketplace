import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/server-auth";

/** GET /api/admin/assets — image asset register (BUILD_SPEC §6). */
export async function GET() {
  const session = await requireApiSession(["admin"]);
  if (session instanceof NextResponse) return session;

  const [containers, listings] = await Promise.all([
    db.container.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        assetTag: true,
        sizeYards: true,
        containerType: true,
        photos: true,
        rightsStatus: true,
        fleetOwner: { select: { name: true } },
      },
    }),
    db.listing.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        photos: true,
        rightsStatus: true,
        provider: { select: { name: true } },
      },
    }),
  ]);

  const isPlaceholder = (s: string) => /placeholder/i.test(s);
  const summary = {
    containers: containers.length,
    containerPlaceholders: containers.filter((c) => isPlaceholder(c.rightsStatus)).length,
    listings: listings.length,
    listingPlaceholders: listings.filter((l) => isPlaceholder(l.rightsStatus)).length,
  };

  return NextResponse.json({ containers, listings, summary });
}
