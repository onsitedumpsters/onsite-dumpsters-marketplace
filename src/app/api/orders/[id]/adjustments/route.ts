import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createAdjustmentIntent } from "@/lib/payments";
import { isStripeConfigured } from "@/lib/stripe";
import { recordLedger } from "@/lib/ledger";
import { formatCents } from "@/lib/fees";
import {
  requireApiSession,
  sessionUserId,
  sessionRole,
  forbidden,
  badRequest,
  audit,
  notify,
} from "@/lib/server-auth";

/** Accepts an absolute https URL or a local /uploads/ path from POST /api/uploads. */
const uploadUrl = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("/uploads/") || /^https?:\/\//i.test(v), {
    message: "Must be an https:// URL or an /uploads/ path",
  });

const adjustmentSchema = z.object({
  kind: z.enum(["overweight", "extra_days", "contamination", "damage", "other"]),
  amountCents: z.number().int().positive().max(100_000),
  description: z.string().trim().min(5).max(2000),
  evidenceUrls: z.array(uploadUrl).max(10).default([]),
});

async function authorizeOrder(orderId: string, userId: string, role: string | null) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, providerId: true, clientId: true, status: true },
  });
  if (!order) return { error: NextResponse.json({ error: "Order not found" }, { status: 404 }) };
  if (order.providerId !== userId && role !== "admin") {
    return { error: forbidden("Only the hauler or an admin may manage adjustments") };
  }
  return { order };
}

/** GET /api/orders/[id]/adjustments — list adjustments on an order. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(["provider", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const { order, error } = await authorizeOrder(id, sessionUserId(session), sessionRole(session));
  if (error) return error;
  const adjustments = await db.adjustment.findMany({
    where: { orderId: order.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ adjustments });
}

/**
 * POST /api/orders/[id]/adjustments — provider creates an adjustment
 * (overweight, extra days, contamination…). Created as `pending`; when Stripe
 * is configured a separate automatic-capture PaymentIntent is created via
 * createAdjustmentIntent — charged immediately if the customer has a saved
 * card (ledger adjustment_charge written), otherwise the clientSecret is
 * returned for the customer to complete payment (webhook flips it to charged).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(["provider", "admin"]);
  if (session instanceof NextResponse) return session;
  const userId = sessionUserId(session);
  const role = sessionRole(session);
  const { id } = await ctx.params;

  const { order, error } = await authorizeOrder(id, userId, role);
  if (error) return error;
  if (["cancelled", "reviewed"].includes(order.status)) {
    return badRequest("Cannot adjust a closed order");
  }

  const body = await req.json().catch(() => null);
  const parsed = adjustmentSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid adjustment data", parsed.error.flatten());
  const input = parsed.data;

  const adjustment = await db.adjustment.create({
    data: {
      orderId: order.id,
      kind: input.kind,
      amountCents: input.amountCents,
      description: input.description,
      evidenceUrls: input.evidenceUrls,
      status: "pending",
    },
  });

  let clientSecret: string | null = null;
  let finalAdjustment = adjustment;
  if (isStripeConfigured()) {
    const { intent, charged } = await createAdjustmentIntent({
      id: adjustment.id,
      orderId: order.id,
      amountCents: input.amountCents,
      description: input.description,
    });
    if (charged) {
      finalAdjustment = await db.adjustment.update({
        where: { id: adjustment.id },
        data: { status: "charged", stripePaymentIntentId: intent.id },
      });
      await recordLedger({
        orderId: order.id,
        type: "adjustment_charge",
        amountCents: input.amountCents,
        stripeRef: intent.id,
        description: `Adjustment charged (${input.kind}) — order ${order.orderNumber}`,
        idempotencyKey: `adjustment:${adjustment.id}`,
      });
      await notify(
        order.clientId,
        "Adjustment charged",
        `${input.description} — ${formatCents(input.amountCents)} charged for order ${order.orderNumber}.`,
      );
    } else {
      finalAdjustment = await db.adjustment.update({
        where: { id: adjustment.id },
        data: { stripePaymentIntentId: intent.id },
      });
      clientSecret = intent.client_secret;
      await notify(
        order.clientId,
        `Adjustment proposed on order ${order.orderNumber}`,
        `${input.kind}: ${formatCents(input.amountCents)} — ${input.description}`,
      );
    }
  }

  await audit("adjustment.created", {
    entityType: "Adjustment",
    entityId: adjustment.id,
    metadata: {
      orderId: order.id,
      kind: input.kind,
      amountCents: input.amountCents,
      status: finalAdjustment.status,
    },
  });

  return NextResponse.json({ adjustment: finalAdjustment, clientSecret }, { status: 201 });
}
