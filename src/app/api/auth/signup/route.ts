import { headers } from "next/headers";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/server-auth";
import { AUTH_RATE_LIMIT, clientIp, rateLimit } from "@/lib/rate-limit";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  role: z.enum(["client", "provider", "fleet_owner"]),
});

export async function POST(req: Request) {
  // Rate limit: 10 signups/min per IP (same budget as other auth endpoints).
  const ip = clientIp(await headers());
  const rl = await rateLimit(`signup:${ip}`, AUTH_RATE_LIMIT);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a minute and try again." },
      { status: 429 },
    );
  }

  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = signupSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { name, email, password, role } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await db.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await db.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role,
      // Shell profiles so role dashboards have something to attach to.
      providerProfile: role === "provider" ? { create: { businessName: name.trim() } } : undefined,
      fleetProfile: role === "fleet_owner" ? { create: { companyName: name.trim() } } : undefined,
    },
    select: { id: true, email: true, role: true },
  });

  // Best-effort audit — never fail the signup on a logging error.
  try {
    await audit("user.signup", { entityType: "User", entityId: user.id, metadata: { role: user.role } });
  } catch {
    /* audit is best-effort */
  }

  return NextResponse.json({ id: user.id, email: user.email, role: user.role }, { status: 201 });
}
