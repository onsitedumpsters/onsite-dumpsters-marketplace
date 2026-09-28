import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/server-auth";

/** GET /api/ads/placements — active ad placements with pricing. */
export async function GET() {
  const session = await requireApiSession(["provider", "fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;

  const placements = await db.adPlacement.findMany({
    where: { active: true },
    orderBy: { priceCents: "asc" },
  });
  return NextResponse.json({ placements });
}
