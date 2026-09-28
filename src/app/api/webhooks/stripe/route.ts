import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { recordLedger } from "@/lib/ledger";
import { audit, notify } from "@/lib/server-auth";

async function findOrderByIntent(paymentIntentId: string) {
  return db.order.findUnique({ where: { stripePaymentIntentId: paymentIntentId } });
}

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "payment_intent.amount_capturable_updated": {
      // Escrow authorization complete → order becomes booked.
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.adjustmentId || pi.metadata?.campaignId) break;
      const order = await findOrderByIntent(pi.id);
      if (!order || order.status !== "quote") break;
      await db.order.update({
        where: { id: order.id },
        data: {
          status: "booked",
          paymentStatus: "authorized",
          escrowStatus: "held",
          stripeChargeId:
            typeof pi.latest_charge === "string" ? pi.latest_charge : order.stripeChargeId,
        },
      });
      await db.orderEvent.create({
        data: {
          orderId: order.id,
          fromStatus: "quote",
          toStatus: "booked",
          note: "Payment authorized — held until delivery",
        },
      });
      await recordLedger({
        orderId: order.id,
        type: "charge_authorized",
        amountCents: order.grandTotalCents,
        stripeRef: pi.id,
        description: `Payment authorized (held) — order ${order.orderNumber}`,
        idempotencyKey: `auth:${order.id}`,
      });
      await notify(
        order.clientId,
        "Booking confirmed",
        `Payment authorized for order ${order.orderNumber}. Your dumpster is being scheduled.`,
      );
      break;
    }

    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.campaignId) break; // ad revenue is booked by checkout.session.completed
      if (pi.metadata?.adjustmentId) {
        const adj = await db.adjustment.findUnique({ where: { id: pi.metadata.adjustmentId } });
        if (adj && adj.status !== "charged") {
          await db.adjustment.update({
            where: { id: adj.id },
            data: { status: "charged", stripePaymentIntentId: pi.id },
          });
          await recordLedger({
            orderId: adj.orderId,
            type: "adjustment_charge",
            amountCents: adj.amountCents,
            stripeRef: pi.id,
            description: `Adjustment charged (${adj.kind})`,
            idempotencyKey: `adjustment:${adj.id}`,
          });
        }
        break;
      }
      const order = await findOrderByIntent(pi.id);
      if (!order) break;
      if (!["captured", "partially_refunded", "refunded"].includes(order.paymentStatus)) {
        await db.order.update({ where: { id: order.id }, data: { paymentStatus: "captured" } });
      }
      const captured = await db.ledgerEntry.findUnique({
        where: { idempotencyKey: `capture:${order.id}` },
        select: { id: true },
      });
      if (!captured) {
        await recordLedger({
          orderId: order.id,
          type: "charge_captured",
          amountCents: pi.amount_received || order.grandTotalCents,
          stripeRef: pi.id,
          description: `Payment captured — order ${order.orderNumber}`,
          idempotencyKey: `capture:${order.id}`,
        });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const order = await findOrderByIntent(pi.id);
      if (!order) break;
      await db.order.update({ where: { id: order.id }, data: { paymentStatus: "failed" } });
      await notify(
        order.clientId,
        "Payment failed",
        `Payment for order ${order.orderNumber} failed. Please try again from checkout.`,
      );
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const refunds = charge.refunds?.data ?? [];
      for (const refund of refunds) {
        // issueRentalRefund already writes this row with the same idempotency
        // key; the check below makes the webhook a no-op for those.
        const seen = await db.ledgerEntry.findUnique({
          where: { idempotencyKey: `refund:${refund.id}` },
          select: { id: true },
        });
        if (seen) continue;
        const piId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        const order = piId ? await findOrderByIntent(piId) : null;
        await recordLedger({
          orderId: order?.id,
          type: "rental_refund",
          amountCents: -refund.amount,
          stripeRef: refund.id,
          description: `Rental refund (webhook)${order ? ` — order ${order.orderNumber}` : ""}`,
          idempotencyKey: `refund:${refund.id}`,
        });
        if (order) {
          const newRefunded = order.refundedRentalCents + refund.amount;
          await db.order.update({
            where: { id: order.id },
            data: {
              refundedRentalCents: newRefunded,
              paymentStatus:
                newRefunded >= order.rentalSubtotalCents ? "refunded" : "partially_refunded",
            },
          });
        }
      }
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      await db.user.updateMany({
        where: { stripeConnectId: account.id },
        data: {
          connectChargesEnabled: account.charges_enabled === true,
          connectPayoutsEnabled: account.payouts_enabled === true,
        },
      });
      break;
    }

    case "checkout.session.completed": {
      const cs = event.data.object as Stripe.Checkout.Session;
      const campaignId = cs.metadata?.campaignId;
      if (!campaignId) break;
      const campaign = await db.adCampaign.findUnique({
        where: { id: campaignId },
        include: { placement: true },
      });
      if (!campaign || campaign.paidAt) break; // already processed
      const amount = cs.amount_total ?? campaign.placement.priceCents;
      const piId = typeof cs.payment_intent === "string" ? cs.payment_intent : undefined;
      await db.$transaction(async (tx) => {
        await tx.adCampaign.update({
          where: { id: campaign.id },
          data: {
            paidAt: new Date(),
            status: "pending_approval",
            stripeCheckoutSessionId: cs.id,
            stripePaymentIntentId: piId,
          },
        });
        const invoice = await tx.adInvoice.create({
          data: {
            campaignId: campaign.id,
            amountCents: amount,
            stripePaymentIntentId: piId,
            status: "paid",
          },
        });
        await tx.ledgerEntry.create({
          data: {
            adInvoiceId: invoice.id,
            type: "ad_revenue",
            amountCents: amount,
            stripeRef: piId ?? cs.id,
            description: `Ad revenue — campaign "${campaign.title}" (platform keeps 100%, non-refundable)`,
            idempotencyKey: `ad:${campaign.id}`,
          },
        });
      });
      await notify(
        campaign.ownerId,
        "Ad payment received",
        `Your "${campaign.title}" campaign is paid and pending approval.`,
      );
      const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true } });
      await Promise.all(
        admins.map((a) =>
          notify(a.id, "Ad campaign awaiting approval", `"${campaign.title}" is paid and needs review.`),
        ),
      );
      break;
    }

    default:
      break;
  }
}

/** POST /api/webhooks/stripe — signature-verified, idempotent event handling. */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !isStripeConfigured()) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 400 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid webhook signature: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  // Idempotency: skip events we've already processed (audit marker).
  const dup = await db.auditLog.findFirst({
    where: { action: `stripe.${event.id}` },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ received: true, duplicate: true });

  try {
    await handleEvent(event);
  } catch (err) {
    await audit(`stripe.${event.id}.error`, {
      entityType: "StripeEvent",
      entityId: event.id,
      metadata: { type: event.type, error: (err as Error).message },
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  await audit(`stripe.${event.id}`, {
    entityType: "StripeEvent",
    entityId: event.id,
    metadata: { type: event.type },
  });
  return NextResponse.json({ received: true });
}
