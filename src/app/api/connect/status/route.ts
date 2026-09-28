import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiSession, sessionUserId } from "@/lib/server-auth";

/** GET /api/connect/status — Connect onboarding / capability state for the current user. */
export async function GET() {
  const session = await requireApiSession(["provider", "fleet_owner", "admin"]);
  if (session instanceof NextResponse) return session;

  const user = await db.user.findUnique({
    where: { id: sessionUserId(session) },
    select: {
      stripeConnectId: true,
      connectChargesEnabled: true,
      connectPayoutsEnabled: true,
    },
  });

  return NextResponse.json({
    onboarded: Boolean(user?.stripeConnectId),
    chargesEnabled: user?.connectChargesEnabled ?? false,
    payoutsEnabled: user?.connectPayoutsEnabled ?? false,
  });
}
