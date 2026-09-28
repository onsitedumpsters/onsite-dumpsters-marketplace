import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, audit, badRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const placements = await db.adPlacement.findMany({
    orderBy: { code: "asc" },
    include: {
      campaigns: {
        where: { status: { in: ["active", "pending_approval"] } },
        select: { id: true, status: true },
      },
    },
  });

  return NextResponse.json({
    placements: placements.map((p) => ({
      ...p,
      liveCampaigns: p.campaigns.filter((c) => c.status === "active").length,
      pendingCampaigns: p.campaigns.filter((c) => c.status === "pending_approval").length,
      campaigns: undefined,
    })),
  });
}

const createSchema = z.object({
  code: z.string().min(2).max(60).regex(/^[a-z0-9_]+$/, "code must be lowercase letters, numbers, or underscores"),
  name: z.string().min(2).max(120),
  description: z.string().max(1000).optional(),
  priceCents: z.coerce.number().int().min(0),
  durationDays: z.coerce.number().int().min(1).default(7),
  maxSlots: z.coerce.number().int().min(1).default(3),
  active: z.boolean().default(true),
});

export async function POST(req: Request) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid placement", parsed.error.flatten());

  try {
    const placement = await db.adPlacement.create({ data: parsed.data });
    await audit("ad_placement.created", {
      entityType: "AdPlacement",
      entityId: placement.id,
      metadata: { code: placement.code },
    });
    return NextResponse.json({ placement }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "A placement with this code already exists" }, { status: 409 });
    }
    throw e;
  }
}
