import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true } },
      provider: { select: { id: true, name: true, email: true, phone: true } },
      listing: { select: { id: true, title: true, category: true, sizeYards: true } },
      feeSchedule: true,
      events: { orderBy: { createdAt: "asc" } },
      ledger: { orderBy: { createdAt: "asc" } },
      adjustments: { orderBy: { createdAt: "desc" } },
      payouts: { orderBy: { createdAt: "desc" } },
      evidence: { orderBy: { createdAt: "asc" } },
      dispute: { include: { raisedBy: { select: { name: true, email: true } } } },
      review: true,
    },
  });

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order });
}
