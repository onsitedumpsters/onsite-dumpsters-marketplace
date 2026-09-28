import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, audit, badRequest, notify } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** GET — verification queue: providers pending or rejected, with user + docs. */
export async function GET() {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const queue = await db.providerProfile.findMany({
    where: { verificationStatus: { in: ["pending", "rejected"] } },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          createdAt: true,
          verificationDocs: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });

  return NextResponse.json({ queue });
}

const decisionSchema = z.object({
  userId: z.string().min(1),
  decision: z.enum(["approved", "rejected", "suspended"]),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const parsed = decisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid decision", parsed.error.flatten());
  const { userId, decision, notes } = parsed.data;

  const profile = await db.providerProfile.findUnique({
    where: { userId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!profile) return NextResponse.json({ error: "Provider profile not found" }, { status: 404 });

  const updated = await db.providerProfile.update({
    where: { userId },
    data: {
      verificationStatus: decision,
      verificationNotes: notes ?? null,
      ...(decision === "approved" ? { verifiedAt: new Date() } : {}),
    },
  });

  const titles: Record<string, string> = {
    approved: "Verification approved",
    rejected: "Verification rejected",
    suspended: "Account suspended",
  };
  const bodies: Record<string, string> = {
    approved: "Your hauler account has been verified. You can now accept bookings.",
    rejected: notes ? `Your verification was rejected: ${notes}` : "Your verification was rejected. Please update your documents and reapply.",
    suspended: notes ? `Your provider account has been suspended: ${notes}` : "Your provider account has been suspended. Contact support.",
  };
  await notify(userId, titles[decision], bodies[decision], "/dashboard/provider");

  await audit("provider.verification_decision", {
    entityType: "ProviderProfile",
    entityId: updated.id,
    metadata: { userId, decision, notes: notes ?? null },
  });

  return NextResponse.json({ profile: updated });
}
