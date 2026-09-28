import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStripe, isStripeConfigured, STRIPE_NOT_CONFIGURED_RESPONSE } from "@/lib/stripe";
import {
  requireApiSession,
  sessionUserId,
  sessionRole,
  unauthorized,
  audit,
} from "@/lib/server-auth";

/** POST /api/connect/onboarding — create (or reuse) a Stripe Express account
 *  and return an onboarding account link. */
export async function POST() {
  const session = await requireApiSession(["provider", "fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  if (!isStripeConfigured()) {
    return NextResponse.json(STRIPE_NOT_CONFIGURED_RESPONSE, { status: 503 });
  }
  const userId = sessionUserId(session);
  const role = sessionRole(session);

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return unauthorized();

  const stripe = getStripe();
  let accountId = user.stripeConnectId;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      country: "US",
      email: user.email,
      business_type: role === "fleet_owner" ? "company" : "individual",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { userId },
    });
    accountId = account.id;
    await db.user.update({ where: { id: userId }, data: { stripeConnectId: accountId } });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/connect/refresh`,
    return_url: `${baseUrl}/connect/return`,
    type: "account_onboarding",
  });

  await audit("connect.onboarding_started", {
    entityType: "User",
    entityId: userId,
    metadata: { accountId },
  });

  return NextResponse.json({ url: link.url, accountId });
}
