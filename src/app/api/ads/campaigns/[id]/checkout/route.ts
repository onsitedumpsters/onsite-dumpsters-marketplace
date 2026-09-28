import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  audit,
} from "@/lib/server-auth";
import { isStripeConfigured, STRIPE_NOT_CONFIGURED_RESPONSE } from "@/lib/stripe";
// Sibling-owned ad checkout helper (BUILD_SPEC §7).
// Contract: createAdCheckoutSession({id, title}, {name, priceCents}) => Stripe Checkout Session.
import { createAdCheckoutSession } from "@/lib/payments";

/**
 * POST /api/ads/campaigns/[id]/checkout — pay for a draft campaign.
 * Ad spend is platform revenue (100%, no escrow, non-refundable — BUILD_SPEC §7).
 * If Stripe is not configured → 503 not-configured (per the no-silent-demo mandate).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(["provider", "fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const role = sessionRole(session) ?? "";
  const userId = sessionUserId(session);

  const campaign = await db.adCampaign.findUnique({
    where: { id },
    include: { placement: true },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (role !== "admin" && campaign.ownerId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: "Only draft campaigns can be checked out" }, { status: 409 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(STRIPE_NOT_CONFIGURED_RESPONSE, { status: 503 });
  }

  try {
    const checkoutSession = await createAdCheckoutSession(
      { id: campaign.id, title: campaign.title },
      { name: campaign.placement.name, priceCents: campaign.placement.priceCents },
    );
    const url = checkoutSession.url;
    if (!url) throw new Error("Checkout session returned no URL");
    await audit("ads.checkout_started", { entityType: "AdCampaign", entityId: id });
    return NextResponse.json({ url });
  } catch (err) {
    await audit("ads.checkout_failed", {
      entityType: "AdCampaign",
      entityId: id,
      metadata: { error: String(err) },
    });
    return NextResponse.json({ error: "Could not start checkout", details: String(err) }, { status: 502 });
  }
}
