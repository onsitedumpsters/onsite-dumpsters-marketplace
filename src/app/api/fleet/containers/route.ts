import { NextResponse } from "next/server";
import { ContainerStatus, ContainerType } from "@prisma/client";
import { db } from "@/lib/db";
import { containerSchema } from "@/lib/validation";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  audit,
} from "@/lib/server-auth";

/** GET /api/fleet/containers — fleet owner's registry (admin: all). */
export async function GET() {
  const session = await requireApiSession(["fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const role = sessionRole(session);

  const containers = await db.container.findMany({
    where: role === "admin" ? {} : { fleetOwnerId: sessionUserId(session) },
    orderBy: { updatedAt: "desc" },
    include: {
      assignedProvider: { select: { id: true, name: true } },
      _count: { select: { listings: true } },
    },
  });
  return NextResponse.json({ containers });
}

/** POST /api/fleet/containers — register a container. */
export async function POST(req: Request) {
  const session = await requireApiSession(["fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;

  const json = await req.json().catch(() => null);
  const parsed = containerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const container = await db.container.create({
    data: {
      ...parsed.data,
      containerType: parsed.data.containerType as ContainerType,
      status: parsed.data.status as ContainerStatus,
      fleetOwnerId: sessionUserId(session),
    },
  });
  await audit("fleet.container_created", { entityType: "Container", entityId: container.id });
  return NextResponse.json({ container }, { status: 201 });
}
