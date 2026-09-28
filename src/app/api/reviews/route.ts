import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  audit,
} from "@/lib/server-auth";
import { TransitionError, performTransition } from "@/lib/transitions";

const bodySchema = z.object({
  orderId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().max(5000).optional(),
});

/**
 * POST /api/reviews — job-verified reviews only: one per completed order,
 * written by the client. Updates Listing + ProviderProfile aggregates and moves
 * the order completed → reviewed through the state machine.
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
    include: { review: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (role !== "admin" && order.clientId !== actorId) {
    return NextResponse.json({ error: "Only the booking client can review this order" }, { status: 403 });
  }
  if (order.status !== "completed") {
    return NextResponse.json({ error: "Only completed orders can be reviewed" }, { status: 400 });
  }
  if (order.review) {
    return NextResponse.json({ error: "This order already has a review" }, { status: 409 });
  }

  try {
    const review = await db.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          orderId: order.id,
          clientId: order.clientId,
          providerId: order.providerId,
          listingId: order.listingId,
          rating: parsed.data.rating,
          title: parsed.data.title ?? null,
          body: parsed.data.body ?? null,
        },
      });

      // Recompute aggregates.
      const [listingAgg, providerAgg] = await Promise.all([
        tx.review.aggregate({ where: { listingId: order.listingId }, _avg: { rating: true }, _count: true }),
        tx.review.aggregate({ where: { providerId: order.providerId }, _avg: { rating: true }, _count: true }),
      ]);
      await tx.listing.update({
        where: { id: order.listingId },
        data: {
          ratingAvg: listingAgg._avg.rating ?? 0,
          reviewCount: listingAgg._count,
        },
      });
      const profile = await tx.providerProfile.findUnique({ where: { userId: order.providerId } });
      if (profile) {
        await tx.providerProfile.update({
          where: { userId: order.providerId },
          data: {
            ratingAvg: providerAgg._avg.rating ?? 0,
            reviewCount: providerAgg._count,
            completedJobs: { increment: 1 },
          },
        });
      }
      return created;
    });

    await performTransition({
      orderId: order.id,
      to: "reviewed",
      actorId,
      role,
      note: `Client left a ${parsed.data.rating}-star review`,
    });

    await audit("review.created", {
      entityType: "Review",
      entityId: review.id,
      metadata: { orderId: order.id, rating: parsed.data.rating },
    });

    return NextResponse.json({ review }, { status: 201 });
  } catch (err) {
    if (err instanceof TransitionError) {
      // Review row already exists while the order stayed "completed" — audit
      // loudly so ops can reconcile; the client's review data is preserved.
      await audit("review.transition_failed", {
        entityType: "Review",
        entityId: parsed.data.orderId,
        metadata: { error: err.message },
      });
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
