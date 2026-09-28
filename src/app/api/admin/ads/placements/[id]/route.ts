import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, audit, badRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(1000).nullable().optional(),
  priceCents: z.coerce.number().int().min(0).optional(),
  durationDays: z.coerce.number().int().min(1).optional(),
  maxSlots: z.coerce.number().int().min(1).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid placement update", parsed.error.flatten());

  const existing = await db.adPlacement.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Placement not found" }, { status: 404 });

  const placement = await db.adPlacement.update({ where: { id }, data: parsed.data });

  await audit("ad_placement.updated", {
    entityType: "AdPlacement",
    entityId: id,
    metadata: { changes: parsed.data },
  });

  return NextResponse.json({ placement });
}
