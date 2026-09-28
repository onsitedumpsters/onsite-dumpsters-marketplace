import { NextResponse } from "next/server";
import { Category } from "@prisma/client";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  audit,
} from "@/lib/server-auth";
import { listingSchema } from "@/lib/validation";

async function getOwned(id: string, session: { userId: string; role: string }) {
  const listing = await db.listing.findUnique({ where: { id } });
  if (!listing) return null;
  if (session.role !== "admin" && listing.providerId !== session.userId) return "forbidden";
  return listing;
}

/** GET /api/provider/listings/[id] */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(["provider", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const listing = await getOwned(id, { userId: sessionUserId(session), role: sessionRole(session) ?? "" });
  if (listing === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  return NextResponse.json({ listing });
}

/** PATCH /api/provider/listings/[id] */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(["provider", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const listing = await getOwned(id, { userId: sessionUserId(session), role: sessionRole(session) ?? "" });
  if (listing === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = listingSchema.partial().safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { category: rawCategory, ...rest } = parsed.data;
  const updated = await db.listing.update({
    where: { id },
    data: {
      ...rest,
      ...(rawCategory ? { category: rawCategory as Category } : {}),
    },
  });
  await audit("listing.updated", { entityType: "Listing", entityId: id });
  return NextResponse.json({ listing: updated });
}

/** DELETE /api/provider/listings/[id] — blocked when orders exist. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession(["provider", "admin"]);
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const listing = await getOwned(id, { userId: sessionUserId(session), role: sessionRole(session) ?? "" });
  if (listing === "forbidden") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });

  const orderCount = await db.order.count({ where: { listingId: id } });
  if (orderCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete: ${orderCount} order(s) reference this listing. Pause it instead.` },
      { status: 409 },
    );
  }

  await db.listing.delete({ where: { id } });
  await audit("listing.deleted", { entityType: "Listing", entityId: id });
  return NextResponse.json({ ok: true });
}
