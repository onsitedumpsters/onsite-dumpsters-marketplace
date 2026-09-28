import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  type Session,
} from "@/lib/server-auth";
import { canTransition, type OrderStatus } from "@/lib/order-machine";
import { TransitionError, performTransition } from "@/lib/transitions";
import type { Prisma } from "@prisma/client";

const bodySchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
  amountCents: z.number().int().positive().max(10_000_000).optional(),
});

function disputeScopeWhere(session: Session): Prisma.DisputeWhereInput {
  const role = sessionRole(session);
  const userId = sessionUserId(session);
  if (role === "admin") return {};
  if (role === "provider") return { order: { providerId: userId } };
  if (role === "fleet_owner") return { order: { listing: { container: { fleetOwnerId: userId } } } };
  return { OR: [{ raisedById: userId }, { order: { clientId: userId } }] };
}

/** GET /api/disputes — role-scoped dispute list. */
export async function GET() {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const disputes = await db.dispute.findMany({
    where: disputeScopeWhere(session),
    include: {
      order: { select: { id: true, orderNumber: true, status: true, grandTotalCents: true } },
      raisedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ disputes });
}

/**
 * POST /api/disputes — raise a dispute. Moves the order into `disputed` via the
 * state machine: OrderEvent written, escrow held (held_dispute), ledger
 * dispute_hold row, both parties notified.
 */
export async function POST(req: Request) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const role = sessionRole(session) ?? "client";
  const actorId = sessionUserId(session);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const order = await db.order.findUnique({
    where: { id: parsed.data.orderId },
    include: { dispute: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (role !== "admin" && order.clientId !== actorId && order.providerId !== actorId) {
    return NextResponse.json({ error: "Not your order" }, { status: 403 });
  }
  if (order.dispute) {
    return NextResponse.json({ error: "A dispute has already been raised on this order" }, { status: 409 });
  }
  if (!canTransition(order.status as OrderStatus, "disputed")) {
    return NextResponse.json(
      { error: `Orders in status '${order.status}' cannot be disputed` },
      { status: 400 },
    );
  }

  try {
    const updated = await performTransition({
      orderId: order.id,
      to: "disputed",
      actorId,
      role,
      note: `Dispute opened: ${parsed.data.reason}`,
      disputeDetails: {
        reason: parsed.data.reason,
        description: parsed.data.description,
        amountCents: parsed.data.amountCents,
      },
    });
    const dispute = await db.dispute.findUnique({ where: { orderId: order.id } });
    return NextResponse.json({ dispute, order: updated }, { status: 201 });
  } catch (err) {
    if (err instanceof TransitionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
