import { db } from "@/lib/db";
import { audit, notify } from "@/lib/server-auth";
import { recordLedger } from "@/lib/ledger";
import { isStripeConfigured } from "@/lib/stripe";
// Escrow helpers (Stripe): best-effort side effects, never block the transition.
import { captureEscrow, releaseEscrow } from "@/lib/payments";
import { canTransition, mayTransition, STATUS_LABELS, type OrderStatus } from "@/lib/order-machine";
import type { Order, Prisma } from "@prisma/client";

export class TransitionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  actorId: string;
  role: string;
  note?: string;
  pickupDate?: string;
  disputeDetails?: { reason: string; description?: string; amountCents?: number };
}

const MILESTONE_FIELDS: Partial<Record<OrderStatus, "acceptedAt" | "dispatchedAt" | "deliveredAt" | "pickupScheduledAt" | "pickedUpAt" | "completedAt" | "cancelledAt">> = {
  accepted: "acceptedAt",
  dispatched: "dispatchedAt",
  delivered: "deliveredAt",
  pickup_scheduled: "pickupScheduledAt",
  picked_up: "pickedUpAt",
  completed: "completedAt",
  cancelled: "cancelledAt",
};

/** Load the order in the shape the sibling payments module expects. */
async function escrowInput(orderId: string) {
  const o = await db.order.findUnique({
    where: { id: orderId },
    include: {
      provider: { select: { id: true, stripeConnectId: true } },
      client: { select: { id: true, email: true, name: true, stripeCustomerId: true } },
    },
  });
  if (!o) throw new TransitionError(404, "Order not found");
  return o;
}

/**
 * Server-enforced order state transition with side effects.
 * Shared by the transition route, the disputes API, and the reviews API.
 */
export async function performTransition(input: TransitionInput): Promise<Order> {
  const { orderId, to, actorId, role, note, pickupDate, disputeDetails } = input;

  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new TransitionError(404, "Order not found");

  const from = order.status as OrderStatus;
  if (!canTransition(from, to)) {
    throw new TransitionError(400, `Invalid transition: ${from} → ${to}`);
  }
  if (!mayTransition(from, to, role)) {
    throw new TransitionError(403, `Role '${role}' may not move an order from ${from} to ${to}`);
  }
  // Ownership scope: clients and providers only touch their own orders.
  if (role === "client" && order.clientId !== actorId) {
    throw new TransitionError(403, "Not your order");
  }
  if (role === "provider" && order.providerId !== actorId) {
    throw new TransitionError(403, "Not your job");
  }

  // Delivery requires photo proof (BUILD_SPEC §5).
  if (to === "delivered") {
    const proofCount = await db.evidencePhoto.count({
      where: { orderId, kind: "delivery" },
    });
    if (proofCount === 0) {
      throw new TransitionError(
        400,
        "Delivery requires at least one delivery photo. Upload photo proof first.",
      );
    }
  }

  // One dispute row per order (schema: Dispute.orderId @unique) — reject early
  // with 409 instead of hitting a unique-constraint violation mid-transaction.
  if (to === "disputed") {
    const existing = await db.dispute.findUnique({ where: { orderId } });
    if (existing) {
      throw new TransitionError(409, "A dispute has already been raised on this order");
    }
  }

  let pickupScheduledAt: Date | undefined;
  if (to === "pickup_scheduled" && pickupDate) {
    const d = new Date(pickupDate);
    if (Number.isNaN(d.getTime())) throw new TransitionError(400, "Invalid pickupDate");
    pickupScheduledAt = d;
  }

  const milestoneField = MILESTONE_FIELDS[to];
  const updateData: Prisma.OrderUpdateInput = { status: to };
  if (milestoneField) updateData[milestoneField] = pickupScheduledAt ?? new Date();
  if (to === "disputed") updateData.escrowStatus = "held_dispute";

  const updated = await db.$transaction(async (tx) => {
    const next = await tx.order.update({ where: { id: orderId }, data: updateData });
    await tx.orderEvent.create({
      data: {
        orderId,
        fromStatus: from,
        toStatus: to,
        actorId,
        actorRole: role,
        note: note ?? null,
      },
    });
    if (to === "disputed") {
      await tx.dispute.create({
        data: {
          orderId,
          raisedById: actorId,
          fromStatus: from,
          reason: disputeDetails?.reason ?? note ?? "Dispute opened",
          description: disputeDetails?.description ?? note ?? "Dispute opened",
          amountCents: disputeDetails?.amountCents ?? null,
        },
      });
    }
    return next;
  });

  // ── Escrow side effects (best-effort; never block the transition) ──
  // captureEscrow / releaseEscrow are sibling-owned: they throw when Stripe is
  // not configured, write their own ledger rows, and update payment/escrow
  // status themselves (idempotent). We only audit failures/skips here.
  if (to === "delivered") {
    if (isStripeConfigured()) {
      try {
        await captureEscrow(await escrowInput(orderId));
      } catch (err) {
        await audit("escrow.capture_failed", {
          entityType: "Order",
          entityId: orderId,
          metadata: { error: String(err) },
        });
      }
    } else {
      await audit("escrow.capture_skipped", {
        entityType: "Order",
        entityId: orderId,
        metadata: { reason: "stripe_not_configured" },
      });
    }
  }

  if (from === "picked_up" && to === "completed") {
    if (isStripeConfigured()) {
      try {
        await releaseEscrow(await escrowInput(orderId));
      } catch (err) {
        await audit("escrow.release_failed", {
          entityType: "Order",
          entityId: orderId,
          metadata: { error: String(err) },
        });
      }
    } else {
      await audit("escrow.release_skipped", {
        entityType: "Order",
        entityId: orderId,
        metadata: { reason: "stripe_not_configured" },
      });
    }
  }

  if (to === "disputed") {
    await recordLedger({
      orderId,
      type: "dispute_hold",
      amountCents: 0,
      description: note ?? `Dispute opened on order ${updated.orderNumber}`,
      idempotencyKey: `dispute_hold:${orderId}`,
    });
  }

  // ── Notifications + audit ──
  const label = STATUS_LABELS[to] ?? to;
  const title = `Order ${updated.orderNumber}: ${label}`;
  const body = note ?? undefined;
  if (role === "client") {
    await notify(order.providerId, title, body, `/dashboard/provider/jobs/${orderId}`);
  } else if (role === "provider") {
    await notify(order.clientId, title, body, `/dashboard/client/orders/${orderId}`);
  } else {
    await notify(order.clientId, title, body, `/dashboard/client/orders/${orderId}`);
    await notify(order.providerId, title, body, `/dashboard/provider/jobs/${orderId}`);
  }
  await audit("order.transition", {
    entityType: "Order",
    entityId: orderId,
    metadata: { from, to, note: note ?? null },
  });

  return updated;

}
