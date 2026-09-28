import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { quoteCancellationRefund, type FeeBreakdown, type FeeScheduleInput } from "@/lib/fees";
import { issueRentalRefund } from "@/lib/payments";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { recordLedger } from "@/lib/ledger";
import { mayTransition } from "@/lib/order-machine";
import {
  requireApiSession,
  sessionUserId,
  sessionRole,
  forbidden,
  badRequest,
  audit,
  notify,
} from "@/lib/server-auth";

const cancelSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

/**
 * POST /api/orders/[id]/cancel — policy-aware cancellation (payments owner).
 * BUILD_SPEC §3 (binding): cancellation refunds ONLY the rental subtotal
 * portion per the 48h/24h policy; booking, dropping, processing fees and the
 * take rate are NEVER refunded.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const userId = sessionUserId(session);
  const role = sessionRole(session) ?? "";
  const { id } = await ctx.params;

  const order = await db.order.findUnique({
    where: { id },
    include: {
      feeSchedule: true,
      provider: { select: { id: true, stripeConnectId: true } },
      client: { select: { id: true, email: true, name: true, stripeCustomerId: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  // Client-owner, provider-owner, or admin may cancel (mirrors TRANSITION_ROLES
  // in order-machine.ts). The refund math is actor-agnostic: only the rental
  // subtotal is refundable, per the 48h/24h policy; fees are never refunded.
  const isParty = order.clientId === userId || order.providerId === userId;
  if (!isParty && role !== "admin") {
    return forbidden("Only the booking client, the provider, or an admin may cancel this order");
  }
  if (!mayTransition(order.status, "cancelled", role)) {
    return badRequest(`Cannot cancel an order in "${order.status}" status`);
  }

  const body = await req.json().catch(() => ({}));
  const parsed = cancelSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid cancellation data", parsed.error.flatten());
  const reason = parsed.data.reason ?? "Cancelled by customer";

  const schedule: FeeScheduleInput = {
    bookingFeeCents: order.feeSchedule.bookingFeeCents,
    droppingFeeCents: order.feeSchedule.droppingFeeCents,
    processingPct: order.feeSchedule.processingPct,
    processingFlatCents: order.feeSchedule.processingFlatCents,
    takeRatePct: order.feeSchedule.takeRatePct,
    cancelFullHours: order.feeSchedule.cancelFullHours,
    cancelHalfHours: order.feeSchedule.cancelHalfHours,
  };
  // Rebuild the fee breakdown from the order's money snapshot (source of truth).
  const breakdown: FeeBreakdown = {
    rentalSubtotalCents: order.rentalSubtotalCents,
    bookingFeeCents: order.bookingFeeCents,
    droppingFeeCents: order.droppingFeeCents,
    processingFeeCents: order.processingFeeCents,
    takeRateCents: order.takeRateCents,
    grandTotalCents: order.grandTotalCents,
    haulerPayoutCents: order.haulerPayoutCents,
    platformRevenueCents:
      order.bookingFeeCents + order.droppingFeeCents + order.processingFeeCents + order.takeRateCents,
  };

  const hoursUntilDelivery = (order.deliveryDate.getTime() - Date.now()) / 3_600_000;
  let refundableRentalCents = 0;
  if ((order.status === "booked" || order.status === "accepted") && hoursUntilDelivery >= 0) {
    refundableRentalCents = quoteCancellationRefund(
      breakdown,
      hoursUntilDelivery,
      schedule,
    ).refundableRentalCents;
  }

  let refundedNow = 0;
  if (isStripeConfigured() && order.stripePaymentIntentId) {
    const stripe = getStripe();
    if (order.paymentStatus === "authorized") {
      // Authorized but not yet captured: capture the non-refundable portion
      // (all platform fees + retained rental) and release the refundable
      // rental hold. Fees are NEVER refunded — voiding the whole auth would
      // hand them back, so partial capture is the only correct path.
      const amountToCapture = Math.max(0, order.grandTotalCents - refundableRentalCents);
      const captured = await db.ledgerEntry.findUnique({
        where: { idempotencyKey: `cancel-capture:${order.id}` },
        select: { id: true },
      });
      if (!captured) {
        const retainedRental = order.rentalSubtotalCents - refundableRentalCents;
        const retainedTakeRate = Math.round(retainedRental * schedule.takeRatePct);
        // The intent was authorized with the FULL take rate in application_fee_amount;
        // it must be reduced to the retained (prorated) take rate or Stripe rejects
        // the capture (application fee may not exceed the captured amount).
        const retainedAppFee =
          order.bookingFeeCents + order.droppingFeeCents + order.processingFeeCents + retainedTakeRate;
        const pi = await stripe.paymentIntents.capture(
          order.stripePaymentIntentId,
          { amount_to_capture: amountToCapture, application_fee_amount: retainedAppFee },
          { idempotencyKey: `cancel-capture:${order.id}` },
        );
        await recordLedger({
          orderId: order.id,
          type: "charge_captured",
          amountCents: amountToCapture,
          stripeRef: pi.id,
          description: `Partial capture on cancellation (fees + retained rental) — order ${order.orderNumber}`,
          idempotencyKey: `cancel-capture:${order.id}`,
        });
        await recordLedger({
          orderId: order.id,
          type: "fee_booking",
          amountCents: order.bookingFeeCents,
          stripeRef: pi.id,
          description: `Booking fee retained (non-refundable) — order ${order.orderNumber}`,
          idempotencyKey: `cancel-fee-booking:${order.id}`,
        });
        await recordLedger({
          orderId: order.id,
          type: "fee_dropping",
          amountCents: order.droppingFeeCents,
          stripeRef: pi.id,
          description: `Drop-off fee retained (non-refundable) — order ${order.orderNumber}`,
          idempotencyKey: `cancel-fee-dropping:${order.id}`,
        });
        await recordLedger({
          orderId: order.id,
          type: "fee_processing",
          amountCents: order.processingFeeCents,
          stripeRef: pi.id,
          description: `Processing fee retained (non-refundable) — order ${order.orderNumber}`,
          idempotencyKey: `cancel-fee-processing:${order.id}`,
        });
        await recordLedger({
          orderId: order.id,
          type: "fee_take_rate",
          amountCents: retainedTakeRate,
          stripeRef: pi.id,
          description: `Take rate retained (non-refundable) — order ${order.orderNumber}`,
          idempotencyKey: `cancel-fee-take-rate:${order.id}`,
        });
        await db.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: refundableRentalCents > 0 ? "partially_refunded" : "captured",
            stripeChargeId: typeof pi.latest_charge === "string" ? pi.latest_charge : undefined,
            refundedRentalCents: { increment: refundableRentalCents },
          },
        });
      }
      refundedNow = refundableRentalCents;
    } else if (
      (order.paymentStatus === "captured" || order.paymentStatus === "partially_refunded") &&
      refundableRentalCents > 0
    ) {
      const res = await issueRentalRefund(order, refundableRentalCents, reason);
      refundedNow = res.amountCents;
    }
  }

  // ALWAYS: status → cancelled, OrderEvent, notify, audit.
  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: { status: "cancelled", cancelledAt: new Date() },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "cancelled",
        actorId: userId,
        actorRole: role || undefined,
        note: `${reason} — customer receives $${(refundableRentalCents / 100).toFixed(2)} (rental portion only; fees non-refundable)`,
      },
    });
  });

  await notify(
    order.providerId,
    "Order cancelled",
    `Order ${order.orderNumber} was cancelled${refundedNow > 0 ? `; $${(refundedNow / 100).toFixed(2)} rental refund issued to the customer` : ""}. Platform fees are non-refundable.`,
  );
  await audit("order.cancelled", {
    entityType: "Order",
    entityId: order.id,
    metadata: {
      orderNumber: order.orderNumber,
      hoursUntilDelivery: Math.round(hoursUntilDelivery),
      refundableRentalCents,
      refundedNow,
      reason,
    },
  });

  return NextResponse.json({
    orderId: order.id,
    status: "cancelled",
    refundQuote: {
      customerReceivesCents: refundableRentalCents,
      nonRefundableFeesCents:
        breakdown.bookingFeeCents + breakdown.droppingFeeCents + breakdown.processingFeeCents,
    },
    refundedRentalCents: refundedNow,
  });
}
