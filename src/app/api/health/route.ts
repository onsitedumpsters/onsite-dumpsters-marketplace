import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  let database = "unreachable";
  try {
    await db.$queryRaw`SELECT 1`;
    database = "ok";
  } catch {
    database = "unreachable";
  }
  const ok = database === "ok";
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      service: "onsite-dumpsters-marketplace",
      database,
      stripe: process.env.STRIPE_SECRET_KEY ? "configured" : "not_configured",
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
