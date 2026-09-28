import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  unauthorized,
} from "@/lib/server-auth";
import { ORDER_STATUSES } from "@/lib/order-machine";
import { orderScopeWhere } from "@/lib/order-scopes";
import type { Prisma } from "@prisma/client";

const querySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/orders — role-scoped list. Filters: status; pagination: page, limit. */
export async function GET(req: Request) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  if (!session.user) return unauthorized();

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.flatten() }, { status: 400 });
  }
  const { status, page, limit } = parsed.data;

  const where: Prisma.OrderWhereInput = {
    ...orderScopeWhere(session),
    ...(status ? { status } : {}),
  };

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        listing: { select: { id: true, title: true, sizeYards: true, category: true } },
        provider: { select: { id: true, name: true, providerProfile: { select: { businessName: true } } } },
        client: { select: { id: true, name: true } },
      },
    }),
  ]);

  return NextResponse.json({ orders, page, limit, total, totalPages: Math.ceil(total / limit) });
}

// ── POST /api/orders — create a booking quote (payments owner) ──────────
import { calculateFees, type FeeScheduleInput } from "@/lib/fees";
import { generateOrderNumber } from "@/lib/payments";
import { rateLimit, BOOKING_RATE_LIMIT } from "@/lib/rate-limit";
import { badRequest, audit } from "@/lib/server-auth";

const createOrderSchema = z.object({
  listingId: z.string().min(1).max(64),
  deliveryAddress: z.string().trim().min(5).max(255),
  deliveryCity: z.string().trim().max(120).optional(),
  deliveryState: z.string().trim().max(40).optional(),
  deliveryZip: z.string().trim().max(20).optional(),
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),
  placementNotes: z.string().trim().max(2000).optional(),
  projectType: z.string().trim().max(120).optional(),
  materialType: z.string().trim().max(120).optional(),
  deliveryDate: z
    .string()
    .refine(
      (v) => {
        const d = new Date(v);
        return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
      },
      { error: "deliveryDate must be a valid ISO date in the future" },
    ),
  deliveryWindow: z.string().trim().max(60).optional(),
  channel: z.string().trim().max(60).optional(),
  policyAccepted: z.literal(true, { error: "You must accept the cancellation policy" }),
});

export async function POST(req: Request) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const userId = sessionUserId(session);
  const role = sessionRole(session);

  const rl = await rateLimit(`booking:${userId}`, BOOKING_RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many booking attempts. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid order data", parsed.error.flatten());
  const input = parsed.data;

  const listing = await db.listing.findUnique({
    where: { id: input.listingId },
    select: { id: true, status: true, basePriceCents: true, providerId: true, title: true },
  });
  if (!listing || listing.status !== "active") {
    return NextResponse.json({ error: "Listing is not available for booking" }, { status: 404 });
  }

  const feeSchedule = await db.feeSchedule.findFirst({
    where: { isActive: true },
    orderBy: { version: "desc" },
  });
  if (!feeSchedule) {
    return NextResponse.json({ error: "No active fee schedule configured" }, { status: 500 });
  }

  const schedule: FeeScheduleInput = {
    bookingFeeCents: feeSchedule.bookingFeeCents,
    droppingFeeCents: feeSchedule.droppingFeeCents,
    processingPct: feeSchedule.processingPct,
    processingFlatCents: feeSchedule.processingFlatCents,
    takeRatePct: feeSchedule.takeRatePct,
    cancelFullHours: feeSchedule.cancelFullHours,
    cancelHalfHours: feeSchedule.cancelHalfHours,
  };
  const breakdown = calculateFees(listing.basePriceCents, schedule);

  // Unique order number (uniqueness checked by caller, per generateOrderNumber contract).
  let orderNumber = "";
  for (let i = 0; i < 5; i++) {
    const candidate = generateOrderNumber();
    const exists = await db.order.findUnique({
      where: { orderNumber: candidate },
      select: { id: true },
    });
    if (!exists) {
      orderNumber = candidate;
      break;
    }
  }
  if (!orderNumber) {
    return NextResponse.json({ error: "Could not generate an order number" }, { status: 500 });
  }

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        clientId: userId,
        listingId: listing.id,
        providerId: listing.providerId,
        feeScheduleId: feeSchedule.id,
        status: "quote",
        rentalSubtotalCents: breakdown.rentalSubtotalCents,
        bookingFeeCents: breakdown.bookingFeeCents,
        droppingFeeCents: breakdown.droppingFeeCents,
        processingFeeCents: breakdown.processingFeeCents,
        takeRateCents: breakdown.takeRateCents,
        grandTotalCents: breakdown.grandTotalCents,
        haulerPayoutCents: breakdown.haulerPayoutCents,
        deliveryAddress: input.deliveryAddress,
        deliveryCity: input.deliveryCity ?? "Orlando",
        deliveryState: input.deliveryState ?? "FL",
        deliveryZip: input.deliveryZip,
        deliveryLat: input.deliveryLat,
        deliveryLng: input.deliveryLng,
        placementNotes: input.placementNotes,
        projectType: input.projectType,
        materialType: input.materialType,
        deliveryDate: new Date(input.deliveryDate),
        deliveryWindow: input.deliveryWindow,
        channel: input.channel ?? "organic",
        cancellationPolicyAcceptedAt: new Date(),
        cancellationPolicyVersion: feeSchedule.version,
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: created.id,
        fromStatus: null,
        toStatus: "quote",
        actorId: userId,
        actorRole: role ?? undefined,
        note: `Quote created for listing "${listing.title}"`,
      },
    });
    return created;
  });

  await audit("order.created", {
    entityType: "Order",
    entityId: order.id,
    metadata: { orderNumber, grandTotalCents: breakdown.grandTotalCents, listingId: listing.id },
  });

  return NextResponse.json({ orderId: order.id, orderNumber, breakdown }, { status: 201 });
}
