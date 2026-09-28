import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createEscrowIntent } from "@/lib/payments";
import {
  getStripe,
  isStripeConfigured,
  getPublishableKey,
  STRIPE_NOT_CONFIGURED_RESPONSE,
} from "@/lib/stripe";
import {
  requireApiSession,
  sessionUserId,
  sessionRole,
  forbidden,
  badRequest,
  audit,
} from "@/lib/server-auth";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const userId = sessionUserId(session);
  const role = sessionRole(session);
  const { id } = await ctx.params;

  const order = await db.order.findUnique({
    where: { id },
    include: {
      provider: { select: { id: true, stripeConnectId: true } },
      client: { select: { id: true, email: true, name: true, stripeCustomerId: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.clientId !== userId && role !== "admin") {
    return forbidden("Only the booking client may check out this order");
  }
  if (order.status !== "quote") {
    return badRequest(`Order is ${order.status}; checkout requires quote status`);
  }
  if (!isStripeConfigured()) {
    return NextResponse.json(STRIPE_NOT_CONFIGURED_RESPONSE, { status: 503 });
  }

  const publishableKey = getPublishableKey();
  if (!publishableKey) {
    return NextResponse.json(
      {
        code: "STRIPE_PUBLISHABLE_KEY_MISSING",
        message: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. See docs/STRIPE_SETUP.md.",
      },
      { status: 503 },
    );
  }

  const stripe = getStripe();
  let clientSecret: string | null;
  if (order.stripePaymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
    if (existing.status === "canceled") {
      return badRequest("This payment was canceled; please create a new order");
    }
    if (existing.amount !== order.grandTotalCents || existing.currency !== "usd") {
      return badRequest("Existing payment intent does not match this order");
    }
    clientSecret = existing.client_secret;
  } else {
    // Throws PROVIDER_NOT_ONBOARDED if the hauler hasn't finished Connect onboarding.
    const pi = await createEscrowIntent(order);
    await db.order.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: pi.id },
    });
    clientSecret = pi.client_secret;
  }
  if (!clientSecret) return badRequest("Payment intent has no client secret");

  // charge_authorized ledger row is written by the Stripe webhook
  // (payment_intent.amount_capturable_updated), not here.
  await audit("order.checkout_intent", {
    entityType: "Order",
    entityId: order.id,
    metadata: { orderNumber: order.orderNumber },
  });

  return NextResponse.json({ clientSecret, publishableKey });
}
