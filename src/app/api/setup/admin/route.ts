import { headers } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/server-auth";
import { AUTH_RATE_LIMIT, clientIp, rateLimit } from "@/lib/rate-limit";

const setupSchema = z.object({
  setupSecret: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(12).max(128),
});

function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * POST /api/setup/admin — one-time first-admin bootstrap.
 *
 * Creates the FIRST admin account. Guards (all must pass):
 * 1. `SETUP_ADMIN_SECRET` env var must be set and match `setupSecret`
 *    (timing-safe comparison).
 * 2. No admin user may already exist (409 afterwards — the endpoint is
 *    permanently inert once bootstrapped).
 * 3. Email must not already be registered.
 *
 * Operational flow: set SETUP_ADMIN_SECRET in Vercel, deploy, call once,
 * then REMOVE the env var so the endpoint cannot be reached at all.
 * Rate-limited like other auth endpoints.
 */
export async function POST(req: Request) {
  const ip = clientIp(await headers());
  const rl = await rateLimit(`setup-admin:${ip}`, AUTH_RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  const expected = process.env.SETUP_ADMIN_SECRET;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = setupSchema.safeParse(json);
  // Validate input shape first, then the secret — but never reveal which failed.
  if (!parsed.success || !expected || !secretsMatch(parsed.data.setupSecret, expected)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const adminExists = await db.user.findFirst({
    where: { role: "admin" },
    select: { id: true },
  });
  if (adminExists) {
    return NextResponse.json({ error: "Setup is already complete." }, { status: 409 });
  }

  const emailTaken = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (emailTaken) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.user.create({
    data: { name: name.trim(), email: normalizedEmail, passwordHash, role: "admin" },
    select: { id: true, email: true, role: true },
  });

  try {
    await audit("admin.bootstrap", { entityType: "User", entityId: user.id, metadata: {} });
  } catch {
    /* audit is best-effort */
  }

  return NextResponse.json({ id: user.id, email: user.email, role: user.role }, { status: 201 });
}
