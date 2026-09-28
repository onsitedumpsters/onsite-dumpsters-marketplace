import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  audit,
} from "@/lib/server-auth";

/** Accepts an absolute https URL or a local /uploads/ path from POST /api/uploads. */
const uploadUrl = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("/uploads/") || /^https?:\/\//i.test(v), {
    message: "Must be an https:// URL or an /uploads/ path",
  });

const bodySchema = z.object({
  listingId: z.string().min(1).optional().nullable(),
  placementId: z.string().min(1),
  title: z.string().min(3).max(120),
  imageUrl: uploadUrl.optional().nullable(),
  targetUrl: z.string().url().max(500).optional().nullable(),
  /** Optional explicit start; defaults to now. */
  startsAt: z.string().datetime({ offset: true }).optional(),
});

/** GET /api/ads/campaigns — own campaigns (admin: all). */
export async function GET() {
  const session = await requireApiSession(["provider", "fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const role = sessionRole(session);

  const campaigns = await db.adCampaign.findMany({
    where: role === "admin" ? {} : { ownerId: sessionUserId(session) },
    include: { placement: true, listing: { select: { id: true, title: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ campaigns });
}

/**
 * POST /api/ads/campaigns — create a draft campaign.
 * Sponsored content NEVER outranks organic on relevance alone: campaigns run in
 * separate labeled slots (max 3/page), and creatives require admin approval
 * before going live (BUILD_SPEC §7).
 */
export async function POST(req: Request) {
  const session = await requireApiSession(["provider", "fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const ownerId = sessionUserId(session);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const placement = await db.adPlacement.findUnique({ where: { id: parsed.data.placementId } });
  if (!placement || !placement.active) {
    return NextResponse.json({ error: "Placement not available" }, { status: 400 });
  }

  if (parsed.data.listingId) {
    const listing = await db.listing.findUnique({ where: { id: parsed.data.listingId } });
    if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    if (listing.providerId !== ownerId && sessionRole(session) !== "admin") {
      return NextResponse.json({ error: "Not your listing" }, { status: 403 });
    }
  }

  const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : new Date();
  const endsAt = new Date(startsAt.getTime() + placement.durationDays * 86_400_000);

  const campaign = await db.adCampaign.create({
    data: {
      ownerId,
      listingId: parsed.data.listingId ?? null,
      placementId: placement.id,
      title: parsed.data.title,
      imageUrl: parsed.data.imageUrl ?? null,
      targetUrl: parsed.data.targetUrl ?? null,
      startsAt,
      endsAt,
      status: "draft",
    },
    include: { placement: true },
  });

  await audit("ads.campaign_created", { entityType: "AdCampaign", entityId: campaign.id });
  return NextResponse.json({ campaign }, { status: 201 });
}
