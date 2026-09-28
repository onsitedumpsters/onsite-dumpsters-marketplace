import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
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

const patchSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  imageUrl: uploadUrl.nullable().optional(),
  targetUrl: z.string().url().max(500).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  /** Owner may pause an active campaign. */
  status: z.enum(["paused", "active"]).optional(),
});

async function getOwned(id: string, session: { userId: string; role: string }) {
  const campaign = await db.adCampaign.findUnique({
    where: { id },
    include: {
      placement: true,
      listing: { select: { id: true, title: true } },
      _count: { select: { events: true, invoices: true } },
    },
  });
  if (!campaign) return null;
  if (session.role !== "admin" && campaign.ownerId !== session.userId) return "forbidden";
  return campaign;
}

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/ads/campaigns/[id] — campaign detail with stats. */
export async function GET(_req: Request, { params }: Ctx) {
  const session = await requireApiSession(["provider", "fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const campaign = await getOwned(id, { userId: sessionUserId(session), role: sessionRole(session) ?? "" });
  if (campaign === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const [impressions, clicks, attributedOrders] = await Promise.all([
    db.adEvent.count({ where: { campaignId: id, type: "impression" } }),
    db.adEvent.count({ where: { campaignId: id, type: "click" } }),
    db.adEvent.findMany({
      where: { campaignId: id, orderId: { not: null } },
      select: { orderId: true },
      distinct: ["orderId"],
    }),
  ]);

  return NextResponse.json({
    campaign,
    stats: {
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      attributedBookings: attributedOrders.length,
    },
  });
}

/** PATCH /api/ads/campaigns/[id] — edit draft fields; pause/resume active. */
export async function PATCH(req: Request, { params }: Ctx) {
  const session = await requireApiSession(["provider", "fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const role = sessionRole(session) ?? "";

  const campaign = await getOwned(id, { userId: sessionUserId(session), role });
  if (campaign === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const data: Prisma.AdCampaignUpdateInput = {};
  if (campaign.status === "draft" || role === "admin") {
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.imageUrl !== undefined) data.imageUrl = parsed.data.imageUrl;
    if (parsed.data.targetUrl !== undefined) data.targetUrl = parsed.data.targetUrl;
    if (parsed.data.startsAt !== undefined) {
      const startsAt = new Date(parsed.data.startsAt);
      data.startsAt = startsAt;
      data.endsAt = new Date(startsAt.getTime() + campaign.placement.durationDays * 86_400_000);
    }
  }
  if (parsed.data.status) {
    if (!["active", "paused"].includes(campaign.status)) {
      return NextResponse.json({ error: "Only active campaigns can be paused or resumed" }, { status: 400 });
    }
    data.status = parsed.data.status;
  }

  const updated = await db.adCampaign.update({ where: { id }, data });
  await audit("ads.campaign_updated", { entityType: "AdCampaign", entityId: id });
  return NextResponse.json({ campaign: updated });
}

/** DELETE /api/ads/campaigns/[id] — only draft / rejected / ended campaigns. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await requireApiSession(["provider", "fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const campaign = await getOwned(id, { userId: sessionUserId(session), role: sessionRole(session) ?? "" });
  if (campaign === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!["draft", "rejected", "ended"].includes(campaign.status)) {
    return NextResponse.json({ error: "Only draft, rejected, or ended campaigns can be deleted" }, { status: 409 });
  }

  await db.adCampaign.delete({ where: { id } });
  await audit("ads.campaign_deleted", { entityType: "AdCampaign", entityId: id });
  return NextResponse.json({ ok: true });
}
