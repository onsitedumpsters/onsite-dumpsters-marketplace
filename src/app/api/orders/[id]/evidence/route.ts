import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  unauthorized,
  audit,
} from "@/lib/server-auth";
import { orderScopeWhere } from "@/lib/order-scopes";

/** Accepts an absolute https URL or a local /uploads/ path from POST /api/uploads. */
const uploadUrl = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("/uploads/") || /^https?:\/\//i.test(v), {
    message: "Must be an https:// URL or an /uploads/ path",
  });

const bodySchema = z.object({
  kind: z.enum(["delivery", "pickup", "weight_ticket", "damage", "other"]),
  url: uploadUrl,
  caption: z.string().max(500).optional(),
});

/** POST /api/orders/[id]/evidence — attach an uploaded photo as order evidence. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  if (!session.user) return unauthorized();
  const { id } = await params;

  const order = await db.order.findFirst({
    where: { id, ...orderScopeWhere(session) },
    select: { id: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const photo = await db.evidencePhoto.create({
    data: {
      orderId: id,
      kind: parsed.data.kind,
      url: parsed.data.url,
      caption: parsed.data.caption ?? null,
      uploadedById: sessionUserId(session),
    },
  });

  await audit("order.evidence_added", {
    entityType: "Order",
    entityId: id,
    metadata: { kind: parsed.data.kind },
  });

  return NextResponse.json({ photo }, { status: 201 });
}
