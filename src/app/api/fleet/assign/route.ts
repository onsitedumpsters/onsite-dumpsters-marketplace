import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  audit,
  notify,
} from "@/lib/server-auth";

const bodySchema = z.object({
  containerId: z.string().min(1),
  /** Set null to unassign. */
  providerId: z.string().min(1).nullable(),
});

/**
 * GET /api/fleet/assign — approved providers eligible for container assignment.
 * (Supports the fleet container detail page's assign dropdown.)
 */
export async function GET() {
  const session = await requireApiSession(["fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;

  const providers = await db.user.findMany({
    where: {
      role: "provider",
      providerProfile: { verificationStatus: "approved" },
    },
    select: {
      id: true,
      name: true,
      providerProfile: { select: { businessName: true, city: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ providers });
}

/**
 * POST /api/fleet/assign — {containerId, providerId | null}.
 * Assigns (or unassigns) a container; the provider must be verification-approved.
 */
export async function POST(req: Request) {
  const session = await requireApiSession(["fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const role = sessionRole(session) ?? "fleet_owner";
  const actorId = sessionUserId(session);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { containerId, providerId } = parsed.data;

  const container = await db.container.findUnique({ where: { id: containerId } });
  if (!container) return NextResponse.json({ error: "Container not found" }, { status: 404 });
  if (role !== "admin" && container.fleetOwnerId !== actorId) {
    return NextResponse.json({ error: "Not your container" }, { status: 403 });
  }

  if (providerId) {
    const provider = await db.user.findUnique({
      where: { id: providerId },
      include: { providerProfile: true },
    });
    if (!provider || provider.role !== "provider") {
      return NextResponse.json({ error: "Target user is not a provider" }, { status: 400 });
    }
    if (provider.providerProfile?.verificationStatus !== "approved") {
      return NextResponse.json(
        { error: "Provider must be verification-approved before assignment" },
        { status: 400 },
      );
    }
  }

  const updated = await db.container.update({
    where: { id: containerId },
    data: {
      assignedProviderId: providerId,
      status: providerId ? "assigned" : "available",
    },
  });

  if (providerId) {
    await notify(
      providerId,
      "Container assigned to you",
      `Container ${container.assetTag ?? container.id} (${container.sizeYards} yd) was assigned to you.`,
      "/dashboard/provider",
    );
  }
  await audit("fleet.container_assigned", {
    entityType: "Container",
    entityId: containerId,
    metadata: { providerId },
  });

  return NextResponse.json({ container: updated });
}
