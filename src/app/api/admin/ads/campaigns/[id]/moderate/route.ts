import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, audit, badRequest, notify } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const moderateSchema = z.object({
  decision: z.enum(["active", "rejected"]),
  reason: z.string().max(1000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const { id } = await params;
  const parsed = moderateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid moderation decision", parsed.error.flatten());
  const { decision, reason } = parsed.data;

  const campaign = await db.adCampaign.findUnique({
    where: { id },
    include: { owner: { select: { id: true } }, placement: { select: { name: true } } },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "pending_approval") {
    return badRequest(`Campaign is ${campaign.status}, not pending approval`);
  }
  if (decision === "rejected" && !reason) {
    return badRequest("A rejection reason is required");
  }

  const updated = await db.adCampaign.update({
    where: { id },
    data: {
      status: decision,
      rejectionReason: decision === "rejected" ? reason : null,
    },
  });

  await notify(
    campaign.ownerId,
    decision === "active" ? "Ad campaign approved" : "Ad campaign rejected",
    decision === "active"
      ? `Your "${campaign.title}" campaign on ${campaign.placement.name} is now live.`
      : `Your "${campaign.title}" campaign was rejected: ${reason}`,
    "/dashboard/fleet/promote",
  );

  await audit("ad_campaign.moderated", {
    entityType: "AdCampaign",
    entityId: id,
    metadata: { decision, reason: reason ?? null },
  });

  return NextResponse.json({ campaign: updated });
}
