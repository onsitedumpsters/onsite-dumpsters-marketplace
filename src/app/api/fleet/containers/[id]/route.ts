import { NextResponse } from "next/server";
import { ContainerStatus, ContainerType } from "@prisma/client";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  audit,
} from "@/lib/server-auth";
import { containerSchema } from "@/lib/validation";

async function getOwned(id: string, session: { userId: string; role: string }) {
  const container = await db.container.findUnique({
    where: { id },
    include: { assignedProvider: { select: { id: true, name: true } } },
  });
  if (!container) return null;
  if (session.role !== "admin" && container.fleetOwnerId !== session.userId) return "forbidden";
  return container;
}

/** GET /api/fleet/containers/[id] */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(["fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const container = await getOwned(id, { userId: sessionUserId(session), role: sessionRole(session) ?? "" });
  if (container === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!container) return NextResponse.json({ error: "Container not found" }, { status: 404 });
  return NextResponse.json({ container });
}

/** PATCH /api/fleet/containers/[id] */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(["fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const container = await getOwned(id, { userId: sessionUserId(session), role: sessionRole(session) ?? "" });
  if (container === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!container) return NextResponse.json({ error: "Container not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = containerSchema.partial().safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { containerType: rawType, status: rawStatus, ...rest } = parsed.data;
  // "assigned" is only ever set together with assignedProviderId by
  // POST /api/fleet/assign (which enforces provider verification). Setting it
  // here would create an assigned-status container with no provider.
  if (rawStatus === "assigned") {
    return NextResponse.json(
      { error: 'Use POST /api/fleet/assign to assign a container to a provider.' },
      { status: 400 },
    );
  }
  const updated = await db.container.update({
    where: { id },
    data: {
      ...rest,
      ...(rawType ? { containerType: rawType as ContainerType } : {}),
      ...(rawStatus ? { status: rawStatus as ContainerStatus } : {}),
    },
  });
  await audit("fleet.container_updated", { entityType: "Container", entityId: id });
  return NextResponse.json({ container: updated });
}

/** DELETE /api/fleet/containers/[id] — blocked while assigned to a provider. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(["fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const container = await getOwned(id, { userId: sessionUserId(session), role: sessionRole(session) ?? "" });
  if (container === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!container) return NextResponse.json({ error: "Container not found" }, { status: 404 });
  if (container.assignedProviderId) {
    return NextResponse.json(
      { error: "Cannot delete a container that is assigned to a provider. Unassign it first." },
      { status: 409 },
    );
  }

  await db.container.delete({ where: { id } });
  await audit("fleet.container_deleted", { entityType: "Container", entityId: id });
  return NextResponse.json({ ok: true });
}
