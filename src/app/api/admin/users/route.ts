import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, audit, badRequest, sessionUserId } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const ROLES = ["client", "provider", "fleet_owner", "admin"] as const;

const querySchema = z.object({
  role: z.enum(ROLES).optional(),
  search: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(25),
});

export async function GET(req: Request) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return badRequest("Invalid query parameters", parsed.error.flatten());
  const q = parsed.data;

  const where = {
    ...(q.role ? { role: q.role } : {}),
    ...(q.search
      ? { OR: [{ name: { contains: q.search, mode: "insensitive" as const } }, { email: { contains: q.search, mode: "insensitive" as const } }] }
      : {}),
  };

  const [total, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.perPage,
      take: q.perPage,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        createdAt: true,
        providerProfile: { select: { businessName: true, verificationStatus: true } },
        fleetProfile: { select: { companyName: true } },
        _count: { select: { clientOrders: true, providerOrders: true } },
      },
    }),
  ]);

  return NextResponse.json({
    users,
    pagination: { page: q.page, perPage: q.perPage, total, pages: Math.ceil(total / q.perPage) },
  });
}

const patchSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES),
});

export async function PATCH(req: Request) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;
  const session = authz;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid role update", parsed.error.flatten());
  const { userId, role } = parsed.data;

  if (userId === sessionUserId(session)) {
    return badRequest("You cannot change your own role");
  }

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const updated = await db.user.update({
    where: { id: userId },
    data: { role },
    select: { id: true, email: true, role: true },
  });

  await audit("user.role_changed", {
    entityType: "User",
    entityId: userId,
    metadata: { from: user.role, to: role },
  });

  return NextResponse.json({ user: updated });
}
