import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, audit } from "@/lib/server-auth";
import { seedCatalog, DEMO_PROVIDER_EMAIL } from "@/lib/catalog-seed";

export const dynamic = "force-dynamic";

/** Catalog status: how many demo listings exist, and is booking math available? */
export async function GET() {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;
  const [demoListings, feeSchedule] = await Promise.all([
    db.listing.count({ where: { provider: { email: DEMO_PROVIDER_EMAIL } } }),
    db.feeSchedule.findFirst({ where: { isActive: true }, select: { id: true } }),
  ]);
  return NextResponse.json({ demoListings, hasFeeSchedule: feeSchedule !== null });
}

/**
 * Seed the demo catalog (admin only). Idempotent: returns { skipped: true }
 * when the demo listings already exist. Never deletes or modifies data.
 */
export async function POST() {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;
  try {
    const result = await seedCatalog();
    await audit("admin.seed_catalog", { metadata: result });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Catalog seed failed";
    const status = message.includes("disabled") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
