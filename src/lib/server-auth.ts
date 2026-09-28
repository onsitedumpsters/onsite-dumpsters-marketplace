import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export type { Session };

export async function getSession(): Promise<Session | null> {
  return auth();
}

export function sessionRole(session: Session | null): string | null {
  return session?.user?.role ?? null;
}

export function sessionUserId(session: Session): string {
  return session.user.id;
}

export function unauthorized(message = "Unauthorized") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden: insufficient role") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

/** Guard helper for API routes. Returns the session or a NextResponse to return directly. */
export async function requireApiSession(roles?: string[]): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session?.user) return unauthorized();
  if (roles) {
    const role = sessionRole(session);
    if (!role || !roles.includes(role)) return forbidden();
  }
  return session;
}

export async function audit(
  action: string,
  opts: { entityType?: string; entityId?: string; metadata?: unknown } = {},
) {
  const session = await auth().catch(() => null);
  const h = await headers();
  await db.auditLog.create({
    data: {
      actorId: session?.user?.id ?? null,
      action,
      entityType: opts.entityType,
      entityId: opts.entityId,
      metadata: (opts.metadata ?? undefined) as never,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });
}

export async function notify(userId: string, title: string, body?: string, link?: string) {
  await db.notification.create({ data: { userId, title, body, link } });
}
