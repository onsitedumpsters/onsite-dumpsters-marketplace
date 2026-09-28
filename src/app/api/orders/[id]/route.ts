import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  unauthorized,
  type Session,
} from "@/lib/server-auth";
import { orderScopeWhere } from "@/lib/order-scopes";

/** GET /api/orders/[id] — role-scoped detail with listing, parties, events, evidence, adjustments, review, dispute. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  if (!session.user) return unauthorized();
  const { id } = await params;

  const order = await db.order.findFirst({
    where: { id, ...orderScopeWhere(session as Session) },
    include: {
      listing: true,
      feeSchedule: true,
      provider: {
        select: {
          id: true,
          name: true,
          phone: true,
          // Narrow projection: the full ProviderProfile contains PII
          // (insurance policy no., address, exact lat/lng, verification
          // notes) that a counterparty must not receive.
          providerProfile: {
            select: {
              businessName: true,
              bio: true,
              city: true,
              state: true,
              verificationStatus: true,
              ratingAvg: true,
              reviewCount: true,
            },
          },
        },
      },
      client: { select: { id: true, name: true, email: true, phone: true } },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { id: true, name: true } } },
      },
      evidence: { orderBy: { createdAt: "desc" } },
      adjustments: { orderBy: { createdAt: "desc" } },
      review: true,
      dispute: true,
    },
  });

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order });
}
