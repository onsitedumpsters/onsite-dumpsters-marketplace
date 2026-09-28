import { NextResponse } from "next/server";
import { auth } from "@/auth";

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

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_API.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (PUBLIC_API_EXACT.includes(pathname)) return NextResponse.next();

  const session = req.auth;
  const match = ROLE_ROUTES.find((r) => pathname.startsWith(r.prefix));

  if (!match) {
    // Authenticated-only API routes (orders, checkout, uploads, reviews…)
    if (pathname.startsWith("/api/") && !session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!session?.user) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  if (!role || !match.roles.includes(role)) {
    return NextResponse.json({ error: "Forbidden: insufficient role" }, { status: 403 });
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*", "/api/:path*"],
};
