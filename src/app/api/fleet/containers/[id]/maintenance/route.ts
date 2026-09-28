import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  audit,
} from "@/lib/server-auth";

const logSchema = z.object({
  servicedAt: z.string().datetime().optional(),
  kind: z.string().min(2).max(40),
  description: z.string().min(3).max(2000),
  costCents: z.number().int().min(0).max(10_000_000).default(0),
});

async function ownedContainer(session: Session, containerId: string) {
  const role = sessionRole(session);
  return db.container.findFirst({
    where:
      role === "admin"
        ? { id: containerId }
        : { id: containerId, fleetOwnerId: sessionUserId(session) },
  });
}

/** GET /api/fleet/containers/[id]/maintenance — service history (owner or admin). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(["fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const container = await ownedContainer(session, id);
  if (!container) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const log = await db.maintenanceLog.findMany({
    where: { containerId: id },
    orderBy: { servicedAt: "desc" },
  });
  return NextResponse.json({ log });
}

/** POST /api/fleet/containers/[id]/maintenance — add a service entry. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiSession(["fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const container = await ownedContainer(session, id);
  if (!container) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = logSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const entry = await db.maintenanceLog.create({
    data: {
      containerId: id,
      servicedAt: parsed.data.servicedAt ? new Date(parsed.data.servicedAt) : new Date(),
      kind: parsed.data.kind,
      description: parsed.data.description,
      costCents: parsed.data.costCents,
      createdById: sessionUserId(session),
    },
  });
  await audit("fleet.maintenance_logged", { entityType: "Container", entityId: id });
  return NextResponse.json({ entry }, { status: 201 });
}
