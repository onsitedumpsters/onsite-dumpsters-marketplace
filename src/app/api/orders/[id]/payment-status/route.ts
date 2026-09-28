import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, sessionUserId, sessionRole, forbidden } from "@/lib/server-auth";

/** Polled by the checkout page until the webhook flips the order to booked. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const userId = sessionUserId(session);
  const role = sessionRole(session);
  const { id } = await ctx.params;

  const order = await db.order.findUnique({
    where: { id },
    select: {
      id: true,
      clientId: true,
      providerId: true,
      status: true,
      paymentStatus: true,
      escrowStatus: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.clientId !== userId && order.providerId !== userId && role !== "admin") {
    return forbidden();
  }

  return NextResponse.json({
    paymentStatus: order.paymentStatus,
    escrowStatus: order.escrowStatus,
    orderStatus: order.status,
  });
}
