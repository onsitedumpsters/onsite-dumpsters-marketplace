import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, badRequest } from "@/lib/server-auth";
import { ORDER_STATUSES } from "@/lib/order-machine";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  city: z.string().max(120).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(req: Request) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return badRequest("Invalid query parameters", parsed.error.flatten());
  const q = parsed.data;

  const where = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.city ? { deliveryCity: { contains: q.city, mode: "insensitive" as const } } : {}),
    ...((q.from || q.to)
      ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
      : {}),
  };

  const [total, orders] = await Promise.all([
    db.order.count({ where }),
    db.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        escrowStatus: true,
        grandTotalCents: true,
        rentalSubtotalCents: true,
        deliveryCity: true,
        deliveryDate: true,
        createdAt: true,
        client: { select: { name: true, email: true } },
        provider: { select: { name: true, email: true } },
        listing: { select: { title: true, category: true, sizeYards: true } },
        dispute: { select: { id: true, reason: true, status: true, slaDueAt: true, createdAt: true } },
      },
    }),
  ]);

  return NextResponse.json({
    orders,
    pagination: { page: q.page, perPage: q.perPage, total, pages: Math.ceil(total / q.perPage) },
  });
}
