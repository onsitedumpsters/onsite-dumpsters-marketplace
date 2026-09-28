import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { AD_EVENT_RATE_LIMIT, clientIp, rateLimit } from "@/lib/rate-limit";

const eventSchema = z.object({
  campaignId: z.string().min(1).max(64),
  type: z.enum(["impression", "click"]),
  orderId: z.string().min(1).max(64).optional(),
});

/**
 * Record an ad impression or click and bump the campaign counter.
 * Best-effort telemetry — callers should fire-and-forget.
 */
export async function POST(req: Request) {
  // Public telemetry endpoint — per-IP rate limit blunts stat-flooding
  // without breaking legitimate fire-and-forget callers.
  const rl = await rateLimit(`ad-event:${clientIp(req.headers)}`, AD_EVENT_RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many events. Try again shortly." }, { status: 429 });
  }

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid event.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { campaignId, type, orderId } = parsed.data;

  const campaign = await db.adCampaign.findUnique({ where: { id: campaignId }, select: { id: true } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  await db.$transaction([
    db.adEvent.create({ data: { campaignId, type, orderId: orderId ?? null } }),
    db.adCampaign.update({
      where: { id: campaignId },
      data: type === "impression" ? { impressions: { increment: 1 } } : { clicks: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({ ok: true }, { status: 201 });
}
