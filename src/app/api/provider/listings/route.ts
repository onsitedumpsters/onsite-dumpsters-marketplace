import { NextResponse } from "next/server";
import { Category } from "@prisma/client";
import { db } from "@/lib/db";
import { listingSchema } from "@/lib/validation";
import {
  requireApiSession,
  sessionRole,
  sessionUserId,
  audit,
} from "@/lib/server-auth";

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "listing"
  );
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  for (let i = 0; i < 10; i++) {
    const slug = i === 0 ? `${base}-${Date.now().toString(36)}` : `${base}-${Date.now().toString(36)}-${i}`;
    const exists = await db.listing.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  return `${base}-${Math.random().toString(36).slice(2, 10)}`;
}

/** GET /api/provider/listings — provider's own listings (admin: all). */
export async function GET(req: Request) {
  const session = await requireApiSession(["provider", "admin"]);
  if (session instanceof NextResponse) return session;
  const role = sessionRole(session);
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const listings = await db.listing.findMany({
    where: {
      ...(role === "admin" ? {} : { providerId: sessionUserId(session) }),
      ...(status === "active" || status === "draft" || status === "paused" ? { status } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ listings });
}

/** POST /api/provider/listings — create a listing (slug generated unique). */
export async function POST(req: Request) {
  const session = await requireApiSession(["provider", "admin"]);
  if (session instanceof NextResponse) return session;

  const json = await req.json().catch(() => null);
  const parsed = listingSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const providerId = sessionUserId(session);
  const listing = await db.listing.create({
    data: {
      ...parsed.data,
      category: parsed.data.category as Category,
      providerId,
      slug: await uniqueSlug(parsed.data.title),
    },
  });

  await audit("listing.created", { entityType: "Listing", entityId: listing.id });
  return NextResponse.json({ listing }, { status: 201 });
}
