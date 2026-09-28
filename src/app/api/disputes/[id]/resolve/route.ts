import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionUserId,
  audit,
  notify,
} from "@/lib/server-auth";
import { recordLedger } from "@/lib/ledger";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { issueRentalRefund } from "@/lib/payments";

const bodySchema = z.object({
  outcome: z.enum(["resolved_client", "resolved_provider", "resolved_split"]),
  notes: z.string().min(5).max(5000),
  /** Optional rental refund to the client (cents). Platform fees never refunded. */
  refundRentalCents: z.number().int().min(0).max(10_000_000).default(0),
});

/**
 * POST /api/disputes/[id]/resolve — admin only.
 * Applies an optional rental refund via Stripe when configured, marks the
 * dispute resolved, returns the order to its pre-dispute status (or cancels it
 * when the client wins), writes a dispute_release ledger row, audits, notifies.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(["admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const dispute = await db.dispute.findUnique({
    where: { id },
    include: { order: true },
  });
  if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
  if (dispute.status !== "open" && dispute.status !== "under_review") {
    return NextResponse.json({ error: "Dispute is already resolved" }, { status: 409 });
  }

  const { outcome, notes, refundRentalCents } = parsed.data;
  const order = dispute.order;

  // Optional rental refund (Stripe when configured; ledger always via issueRentalRefund).
  // issueRentalRefund books its own ledger row and counters — never duplicate them.
  let refundBooked = false; // issueRentalRefund ran (updates the counter itself)
  let refundVoided = false; // authorization voided (counter needs the manual increment below)
  if (refundRentalCents > 0 && order.stripePaymentIntentId && isStripeConfigured()) {
    try {
      if (order.paymentStatus === "captured") {
        await issueRentalRefund(
          {
            id: order.id,
            orderNumber: order.orderNumber,
            rentalSubtotalCents: order.rentalSubtotalCents,
            refundedRentalCents: order.refundedRentalCents,
            stripePaymentIntentId: order.stripePaymentIntentId,
          },
          refundRentalCents,
          `Dispute ${id} resolved (${outcome})`,
        );
        refundBooked = true;
      } else if (order.paymentStatus === "authorized") {
        await getStripe().paymentIntents.cancel(order.stripePaymentIntentId);
        await recordLedger({
          orderId: order.id,
          type: "rental_refund",
          amountCents: -refundRentalCents,
          stripeRef: order.stripePaymentIntentId,
          description: `Dispute resolution rental refund (authorization voided) for order ${order.orderNumber}`,
          idempotencyKey: `dispute_refund:${id}`,
        });
        refundVoided = true;
      }
    } catch (err) {
      await audit("dispute.refund_failed", {
        entityType: "Dispute",
        entityId: id,
        metadata: { error: String(err) },
      });
    }
  }

  const backToCancelled = outcome === "resolved_client";
  const updated = await db.$transaction(async (tx) => {
    const d = await tx.dispute.update({
      where: { id },
      data: { status: outcome, resolutionNotes: notes, resolvedAt: new Date() },
    });
    const o = await tx.order.update({
      where: { id: order.id },
      data: {
        status: backToCancelled ? "cancelled" : dispute.fromStatus,
        escrowStatus: backToCancelled ? "released" : "held",
        // issueRentalRefund already incremented this when it ran; the manual
        // increment below only covers the voided-authorization path. Never
        // increment when no money moved (unconfigured Stripe, no intent,
        // other payment status, or a failed Stripe call).
        ...(refundBooked || !refundVoided ? {} : { refundedRentalCents: { increment: refundRentalCents } }),
        ...(backToCancelled ? { cancelledAt: new Date() } : {}),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: "disputed",
        toStatus: backToCancelled ? "cancelled" : dispute.fromStatus,
        actorId: sessionUserId(session),
        actorRole: "admin",
        note: `Dispute resolved (${outcome}): ${notes}`,
      },
    });
    return { d, o };
  });

  await recordLedger({
    orderId: order.id,
    type: "dispute_release",
    amountCents: 0,
    description: `Dispute ${id} resolved (${outcome}) for order ${order.orderNumber}`,
    idempotencyKey: `dispute_release:${id}`,
  });

  await audit("dispute.resolved", {
    entityType: "Dispute",
    entityId: id,
    metadata: { outcome, refundRentalCents },
  });

  const msg =
    outcome === "resolved_client"
      ? "The dispute was resolved in your favor."
      : outcome === "resolved_provider"
        ? "The dispute was resolved in the hauler's favor."
        : "The dispute was resolved with a split outcome.";
  await notify(order.clientId, `Dispute resolved — order ${order.orderNumber}`, `${msg} ${notes}`, `/dashboard/client/orders/${order.id}`);
  await notify(order.providerId, `Dispute resolved — order ${order.orderNumber}`, `${msg} ${notes}`, `/dashboard/provider/jobs/${order.id}`);

  return NextResponse.json({ dispute: updated.d, order: updated.o });
}
