import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

/**
 * Edge middleware — deliberately SELF-CONTAINED and tiny.
 *
 * It must NOT import "@/auth": that pulls the entire NextAuth stack
 * (Prisma adapter, providers, bcrypt, zod…) into the Edge Function bundle,
 * which exceeds Vercel Hobby's 1 MB edge-function size limit.
 *
 * Instead we verify the Auth.js session JWT directly with `jose`. The JWT is
 * issued by src/auth.ts with `role` and `userId` claims, so the role gates
 * below see the same claims the full `auth()` session exposes.
 *
 * This middleware is defense-in-depth for pages and a fast 401/403 for API
 * routes. Every API route ALSO enforces auth/roles itself via
 * requireApiSession()/requireRole() (which use the full auth() stack and
 * refresh the role from the DB) — those checks are authoritative.
 */

const ROLE_ROUTES: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/dashboard/provider", roles: ["provider", "admin"] },
  { prefix: "/dashboard/fleet", roles: ["fleet_owner", "admin"] },
  { prefix: "/dashboard/client", roles: ["client", "provider", "fleet_owner", "admin"] },
  { prefix: "/api/admin", roles: ["admin"] },
  { prefix: "/api/provider", roles: ["provider", "admin"] },
  { prefix: "/api/fleet", roles: ["fleet_owner", "admin"] },
  { prefix: "/api/ads", roles: ["provider", "fleet_owner", "admin"] },
];

const PUBLIC_API = ["/api/auth", "/api/health", "/api/webhooks", "/api/search", "/api/listings"];

// Exact paths that stay public even under a role-gated prefix (e.g. /api/ads).
// /api/ads/events records impressions/clicks from ALL visitors, including
// anonymous ones — ad telemetry is meaningless if it requires a login.
// /api/backup/export and /api/backup/ping are called by the Apps Script
// keepalive/backup scheduler with a shared bearer token (BACKUP_CRON_SECRET);
// they authenticate themselves, so the session middleware must let them through.
const PUBLIC_API_EXACT = ["/api/ads/events", "/api/backup/export", "/api/backup/ping"];

type SessionUser = { id: string; role: string };

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

async function sessionUser(req: NextRequest): Promise<SessionUser | null> {
  // Auth.js v5 session cookie; __Secure- prefix on HTTPS (production).
  const token =
    req.cookies.get("__Secure-authjs.session-token")?.value ??
    req.cookies.get("authjs.session-token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const id =
      typeof payload.userId === "string"
        ? payload.userId
        : typeof payload.sub === "string"
          ? payload.sub
          : "";
    if (!id) return null;
    const role = typeof payload.role === "string" ? payload.role : "client";
    return { id, role };
  } catch {
    return null; // expired, tampered, or wrong-secret tokens are simply anonymous
  }
}

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (PUBLIC_API_EXACT.includes(pathname)) return NextResponse.next();

  const user = await sessionUser(req);
  const match = ROLE_ROUTES.find((r) => pathname.startsWith(r.prefix));

  if (!match) {
    // Authenticated-only API routes (orders, checkout, uploads, reviews…)
    if (pathname.startsWith("/api/") && !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (!match.roles.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden: insufficient role" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/api/:path*"],
};
