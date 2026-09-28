import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession, sessionRole, sessionUserId } from "@/lib/server-auth";
import { ORDER_STATUSES } from "@/lib/order-machine";
import { performTransition, TransitionError } from "@/lib/transitions";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  to: z.enum(ORDER_STATUSES),
  note: z.string().max(2000).optional(),
  /** ISO date for the scheduled pickup (used when to = pickup_scheduled). */
  pickupDate: z.string().datetime({ offset: true }).optional(),
});

/** POST /api/orders/[id]/transition — {to, note?, pickupDate?}. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const order = await performTransition({
      orderId: id,
      to: parsed.data.to,
      actorId: sessionUserId(session),
      role: sessionRole(session) ?? "client",
      note: parsed.data.note,
      pickupDate: parsed.data.pickupDate,
    });
    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof TransitionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
