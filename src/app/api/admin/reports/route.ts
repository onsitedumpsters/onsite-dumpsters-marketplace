import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/server-auth";
import { buildReport } from "@/lib/admin-reports";

export const dynamic = "force-dynamic";

/** GET /api/admin/reports — contribution-margin report (JSON). */
export async function GET() {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;
  return NextResponse.json(await buildReport());
}
