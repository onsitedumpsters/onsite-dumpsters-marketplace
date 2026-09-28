import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession } from "@/lib/server-auth";

/**
 * GET /api/admin/disputes/[id] — full dispute detail for the admin dispute center.
 * Includes order, counterparties, evidence photos, adjustments, timeline, and ledger context.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(["admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const dispute = await db.dispute.findUnique({
    where: { id },
    include: {
      raisedBy: { select: { id: true, name: true, email: true } },
      order: {
        include: {
          client: { select: { id: true, name: true, email: true } },
          provider: { select: { id: true, name: true, email: true } },
          evidence: { orderBy: { createdAt: "desc" } },
          adjustments: { orderBy: { createdAt: "desc" } },
          events: { orderBy: { createdAt: "desc" }, take: 50 },
          listing: { select: { id: true, slug: true, title: true } },
          payouts: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!dispute) return NextResponse.json({ error: "Dispute not found" }, { status: 404 });

  const ledger = await db.ledgerEntry.findMany({
    where: { orderId: dispute.orderId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, type: true, amountCents: true, description: true, createdAt: true },
  });

  return NextResponse.json({ dispute, ledger });
}
