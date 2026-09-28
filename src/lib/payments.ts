// Stripe escrow / payment primitives — SERVER ONLY.
// Every function throws if Stripe is not configured (no demo/fake checkout).
// Every money movement writes a ledger row (BUILD_SPEC §4/§10).
import { randomBytes } from "crypto";
import Stripe from "stripe";
import type { EscrowStatus, OrderStatus } from "@prisma/client";
import { db } from "./db";
import { recordLedger } from "./ledger";
import { getStripe, isStripeConfigured } from "./stripe";
import { notify } from "./server-auth";

/** Minimal order shape needed by the payment functions (satisfied by a
 *  Prisma Order with `provider` and `client` included). */
export interface EscrowOrderInput {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  grandTotalCents: number;
  rentalSubtotalCents: number;
  bookingFeeCents: number;
  droppingFeeCents: number;
  processingFeeCents: number;
  takeRateCents: number;
  haulerPayoutCents: number;
  refundedRentalCents: number;
  escrowStatus: EscrowStatus;
  stripePaymentIntentId: string | null;
  provider: { id: string; stripeConnectId: string | null };
  client: { id: string; email: string; name: string | null; stripeCustomerId: string | null };
}

function stripeOrThrow(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error("STRIPE_NOT_CONFIGURED: set STRIPE_SECRET_KEY per docs/STRIPE_SETUP.md");
  }
  return getStripe();
}

/** OD-YYYY-XXXXXX order number. Uniqueness is checked by the caller (API route). */
export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous chars only
  const bytes = randomBytes(6);
  let suffix = "";
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  return `OD-${year}-${suffix}`;
}

export interface StripeCustomerUser {
  id: string;
  email: string;
  name: string | null;
  stripeCustomerId: string | null;
}

/** Get or create the Stripe Customer for a client user. */
export async function getOrCreateStripeCustomer(user: StripeCustomerUser): Promise<string> {
  const stripe = stripeOrThrow();
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name ?? undefined,
    metadata: { userId: user.id },
  });
  await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

/**
 * Create the escrow PaymentIntent for an order (authorize only, manual capture).
 * amount = grandTotalCents. application_fee_amount = all platform fees
 * (booking + dropping + processing + take rate). Destination charge to the
 * provider's Connect account; transfer_group = order id.
 * Idempotent via `order-intent:${order.id}`.
 */
export async function createEscrowIntent(order: EscrowOrderInput): Promise<Stripe.PaymentIntent> {
  const stripe = stripeOrThrow();
  if (!order.provider.stripeConnectId) {
    throw new Error("PROVIDER_NOT_ONBOARDED");
  }
  const customerId = await getOrCreateStripeCustomer(order.client);
  const applicationFeeCents =
    order.bookingFeeCents + order.droppingFeeCents + order.processingFeeCents + order.takeRateCents;
  if (applicationFeeCents >= order.grandTotalCents) {
    throw new Error("Invalid fee math: application fee must be less than the grand total");
  }
  return stripe.paymentIntents.create(
    {
      amount: order.grandTotalCents,
      currency: "usd",
      capture_method: "manual",
      customer: customerId,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      application_fee_amount: applicationFeeCents,
      transfer_data: { destination: order.provider.stripeConnectId },
      transfer_group: order.id,
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
      description: `Onsite Dumpsters payment hold — order ${order.orderNumber}`,
    },
    { idempotencyKey: `order-intent:${order.id}` },
  );
}

/**
 * Capture the escrow PaymentIntent (full amount). Writes ledger rows:
 * fee_booking / fee_dropping / fee_processing / fee_take_rate (+amounts) and
 * charge_captured (+grandTotal). Sets paymentStatus captured, escrowStatus held.
 * Idempotent via ledger idempotencyKey `capture:${order.id}`.
 */
export async function captureEscrow(order: EscrowOrderInput) {
  const stripe = stripeOrThrow();
  if (!order.stripePaymentIntentId) throw new Error("NO_PAYMENT_INTENT");
  const already = await db.ledgerEntry.findUnique({
    where: { idempotencyKey: `capture:${order.id}` },
    select: { id: true },
  });
  if (already) return { alreadyCaptured: true as const };

  const pi = await stripe.paymentIntents.capture(
    order.stripePaymentIntentId,
    {},
    { idempotencyKey: `capture:${order.id}` },
  );

  await Promise.all([
    recordLedger({
      orderId: order.id,
      type: "fee_booking",
      amountCents: order.bookingFeeCents,
      stripeRef: pi.id,
      description: `Booking fee captured (non-refundable) — order ${order.orderNumber}`,
      idempotencyKey: `capture:fee_booking:${order.id}`,
    }),
    recordLedger({
      orderId: order.id,
      type: "fee_dropping",
      amountCents: order.droppingFeeCents,
      stripeRef: pi.id,
      description: `Drop-off fee captured (non-refundable) — order ${order.orderNumber}`,
      idempotencyKey: `capture:fee_dropping:${order.id}`,
    }),
    recordLedger({
      orderId: order.id,
      type: "fee_processing",
      amountCents: order.processingFeeCents,
      stripeRef: pi.id,
      description: `Payment processing fee captured (non-refundable) — order ${order.orderNumber}`,
      idempotencyKey: `capture:fee_processing:${order.id}`,
    }),
    recordLedger({
      orderId: order.id,
      type: "fee_take_rate",
      amountCents: order.takeRateCents,
      stripeRef: pi.id,
      description: `Take rate captured (non-refundable) — order ${order.orderNumber}`,
      idempotencyKey: `capture:fee_take_rate:${order.id}`,
    }),
    recordLedger({
      orderId: order.id,
      type: "charge_captured",
      amountCents: order.grandTotalCents,
      stripeRef: pi.id,
      description: `Payment captured — order ${order.orderNumber}`,
      idempotencyKey: `capture:${order.id}`,
    }),
  ]);

  await db.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "captured",
      escrowStatus: "held",
      stripeChargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : undefined,
    },
  });
  await db.orderEvent.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus: order.status,
      note: "Payment captured — rental held until pickup is completed",
    },
  });
  return { alreadyCaptured: false as const, paymentIntent: pi };
}

/**
 * Release escrow on picked_up → completed. Sets escrowStatus released, creates
 * the Payout row (haulerPayoutCents minus adjustments already charged via
 * separate PaymentIntents, so the hauler is never paid twice), writes
 * hauler_payout (−amount, platform outflow) + payout_transfer ledger rows, and
 * notifies the provider. (Funds move on Stripe's Connect schedule via the
 * destination charge; the Payout row + ledger rows are the books of record.)
 * Idempotent: returns the existing Payout if already released.
 */
export async function releaseEscrow(order: EscrowOrderInput) {
  stripeOrThrow(); // release is bookkeeping, but payouts require a configured Stripe account
  const existing = await db.payout.findFirst({ where: { orderId: order.id } });
  if (existing) return { alreadyReleased: true as const, payout: existing };
  if (order.escrowStatus !== "held") {
    throw new Error(`Cannot release escrow from escrowStatus "${order.escrowStatus}"`);
  }

  const charged = await db.adjustment.aggregate({
    where: { orderId: order.id, status: "charged" },
    _sum: { amountCents: true },
  });
  const adjustmentDeduction = charged._sum.amountCents ?? 0;
  const payoutAmount = Math.max(0, order.haulerPayoutCents - adjustmentDeduction);

  const payout = await db.payout.create({
    data: {
      providerId: order.provider.id,
      orderId: order.id,
      amountCents: payoutAmount,
      status: "pending",
      scheduledFor: new Date(),
    },
  });

  await recordLedger({
    orderId: order.id,
    type: "hauler_payout",
    amountCents: -payoutAmount,
    description: `Hauler payout scheduled (payment hold released) — order ${order.orderNumber}`,
    idempotencyKey: `payout:${order.id}`,
  });
  await recordLedger({
    orderId: order.id,
    type: "payout_transfer",
    amountCents: -payoutAmount,
    description: `Payout transfer to provider Connect account — order ${order.orderNumber}`,
    idempotencyKey: `payout-transfer:${order.id}`,
  });

  await db.order.update({ where: { id: order.id }, data: { escrowStatus: "released" } });
  await notify(
    order.provider.id,
    "Payout scheduled",
    `Payment hold released for order ${order.orderNumber}. Payout of $${(payoutAmount / 100).toFixed(2)} is on its way per your Connect payout schedule.`,
  );
  return { alreadyReleased: false as const, payout };
}

/**
 * Refund ONLY the rental-subtotal portion to the customer. Platform fees
 * (booking, dropping, processing, take rate) are NEVER refunded — enforced by
 * asserting refundableRentalCents <= (rentalSubtotal − already refunded).
 */
export async function issueRentalRefund(
  order: Pick<
    EscrowOrderInput,
    "id" | "orderNumber" | "rentalSubtotalCents" | "refundedRentalCents" | "stripePaymentIntentId"
  >,
  refundableRentalCents: number,
  reason: string,
) {
  const stripe = stripeOrThrow();
  if (!order.stripePaymentIntentId) throw new Error("NO_PAYMENT_INTENT");
  if (!Number.isInteger(refundableRentalCents) || refundableRentalCents < 0) {
    throw new Error("INVALID_REFUND_AMOUNT");
  }
  const maxRefundable = order.rentalSubtotalCents - order.refundedRentalCents;
  if (refundableRentalCents > maxRefundable) {
    throw new Error(
      "REFUND_EXCEEDS_RENTAL_SUBTOTAL: only the rental subtotal is refundable — platform fees are never refunded",
    );
  }
  if (refundableRentalCents === 0) return { refundId: null as string | null, amountCents: 0 };

  const refund = await stripe.refunds.create(
    {
      payment_intent: order.stripePaymentIntentId,
      amount: refundableRentalCents,
      reason: "requested_by_customer",
      metadata: { orderId: order.id, reason: reason.slice(0, 400) },
    },
    { idempotencyKey: `refund:${order.id}:${refundableRentalCents}` },
  );

  await recordLedger({
    orderId: order.id,
    type: "rental_refund",
    amountCents: -refundableRentalCents,
    stripeRef: refund.id,
    description: `Rental refund — order ${order.orderNumber}: ${reason.slice(0, 120)}`,
    idempotencyKey: `refund:${refund.id}`,
  });

  const newRefunded = order.refundedRentalCents + refundableRentalCents;
  await db.order.update({
    where: { id: order.id },
    data: {
      refundedRentalCents: newRefunded,
      paymentStatus: newRefunded >= order.rentalSubtotalCents ? "refunded" : "partially_refunded",
    },
  });
  return { refundId: refund.id, amountCents: refundableRentalCents };
}

export interface AdjustmentInput {
  id: string;
  orderId: string;
  amountCents: number;
  description: string;
}

/**
 * Separate PaymentIntent (automatic capture) for overweight / extra-day /
 * contamination charges. Attempts an off-session charge against the customer's
 * saved card when one exists; otherwise returns an unconfirmed intent for the
 * customer to complete. Caller writes the `adjustment_charge` ledger row when
 * `charged` is true.
 */
export async function createAdjustmentIntent(adjustment: AdjustmentInput, paymentMethodId?: string) {
  const stripe = stripeOrThrow();
  const order = await db.order.findUnique({
    where: { id: adjustment.orderId },
    include: { client: { select: { id: true, email: true, name: true, stripeCustomerId: true } } },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const customerId = await getOrCreateStripeCustomer(order.client);

  let pmId = paymentMethodId;
  if (!pmId) {
    const saved = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
    if (saved.data[0]) pmId = saved.data[0].id;
  }

  const params: Stripe.PaymentIntentCreateParams = {
    amount: adjustment.amountCents,
    currency: "usd",
    customer: customerId,
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    metadata: { adjustmentId: adjustment.id, orderId: adjustment.orderId, kind: "adjustment" },
    description: `Dumpster rental adjustment — ${adjustment.description.slice(0, 120)}`,
  };

  const intent = pmId
    ? await stripe.paymentIntents.create(
        { ...params, payment_method: pmId, confirm: true, off_session: true },
        { idempotencyKey: `adjustment:${adjustment.id}` },
      )
    : await stripe.paymentIntents.create(params, { idempotencyKey: `adjustment:${adjustment.id}` });

  return { intent, charged: intent.status === "succeeded" };
}

export interface AdCampaignInput {
  id: string;
  title: string;
}
export interface AdPlacementInput {
  name: string;
  priceCents: number;
}

/**
 * Stripe Checkout Session for an ad campaign (one-time payment, platform keeps
 * 100% — no escrow). metadata.campaignId is consumed by the webhook to mark
 * the campaign paid.
 */
export async function createAdCheckoutSession(campaign: AdCampaignInput, placement: AdPlacementInput) {
  const stripe = stripeOrThrow();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: placement.priceCents,
            product_data: {
              name: `Ad placement — ${placement.name}`,
              description: campaign.title,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { campaignId: campaign.id },
      payment_intent_data: { metadata: { campaignId: campaign.id } },
      success_url: `${baseUrl}/ads/promote/${campaign.id}?paid=1`,
      cancel_url: `${baseUrl}/ads/promote?canceled=1`,
    },
    { idempotencyKey: `ad-checkout:${campaign.id}` },
  );
}
