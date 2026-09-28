import { NextResponse } from "next/server";
import { z } from "zod";
import type { LedgerType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireApiSession, badRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const LEDGER_TYPES = [
  "charge_authorized",
  "charge_captured",
  "fee_booking",
  "fee_dropping",
  "fee_processing",
  "fee_take_rate",
  "hauler_payout",
  "rental_refund",
  "adjustment_charge",
  "dispute_hold",
  "dispute_release",
  "ad_revenue",
  "payout_transfer",
] as const;

const FEE_TYPES = ["fee_booking", "fee_dropping", "fee_processing", "fee_take_rate"] as const satisfies readonly LedgerType[];

const querySchema = z.object({
  type: z.enum(LEDGER_TYPES).optional(),
  orderId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(req: Request) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return badRequest("Invalid query parameters", parsed.error.flatten());
  const q = parsed.data;

  const where = {
    ...(q.type ? { type: q.type } : {}),
    ...(q.orderId ? { orderId: q.orderId } : {}),
    ...((q.from || q.to)
      ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
      : {}),
  };

  const [total, entries, sumsByType, revenueSum] = await Promise.all([
    db.ledgerEntry.count({ where }),
    db.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      include: { order: { select: { orderNumber: true } } },
    }),
    db.ledgerEntry.groupBy({
      by: ["type"],
      _sum: { amountCents: true },
      where,
    }),
    db.ledgerEntry.aggregate({
      _sum: { amountCents: true },
      where: { ...where, type: { in: [...FEE_TYPES] } },
    }),
  ]);

  const totalsByType = Object.fromEntries(sumsByType.map((r) => [r.type, r._sum.amountCents ?? 0]));

  return NextResponse.json({
    entries,
    totals: {
      byType: totalsByType,
      platformRevenueCents: revenueSum._sum?.amountCents ?? 0,
    },
    pagination: { page: q.page, perPage: q.perPage, total, pages: Math.ceil(total / q.perPage) },
  });
}
