import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, audit, badRequest, sessionUserId } from "@/lib/server-auth";
import { DEFAULT_FEE_SCHEDULE } from "@/lib/fees";

export const dynamic = "force-dynamic";

export async function GET() {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const schedules = await db.feeSchedule.findMany({ orderBy: { version: "desc" } });
  const active = schedules.find((s) => s.isActive) ?? null;
  return NextResponse.json({ schedules, active, defaults: DEFAULT_FEE_SCHEDULE });
}

const newVersionSchema = z.object({
  bookingFeeCents: z.coerce.number().int().min(0),
  droppingFeeCents: z.coerce.number().int().min(0),
  processingPct: z.coerce.number().min(0).max(1),
  processingFlatCents: z.coerce.number().int().min(0),
  takeRatePct: z.coerce.number().min(0).max(1),
  cancelFullHours: z.coerce.number().int().min(0),
  cancelHalfHours: z.coerce.number().int().min(0),
});

export async function POST(req: Request) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;
  const session = authz;

  const parsed = newVersionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid fee schedule", parsed.error.flatten());
  const v = parsed.data;

  if (v.cancelHalfHours > v.cancelFullHours) {
    return badRequest("cancelHalfHours cannot exceed cancelFullHours");
  }

  const maxVersion = await db.feeSchedule.aggregate({ _max: { version: true } });
  const version = (maxVersion._max.version ?? 0) + 1;

  const schedule = await db.$transaction(async (tx) => {
    await tx.feeSchedule.updateMany({ where: { isActive: true }, data: { isActive: false } });
    return tx.feeSchedule.create({
      data: {
        version,
        bookingFeeCents: v.bookingFeeCents,
        droppingFeeCents: v.droppingFeeCents,
        processingPct: v.processingPct,
        processingFlatCents: v.processingFlatCents,
        takeRatePct: v.takeRatePct,
        cancelFullHours: v.cancelFullHours,
        cancelHalfHours: v.cancelHalfHours,
        isActive: true,
        createdById: sessionUserId(session),
      },
    });
  });

  await audit("fee_schedule.created", {
    entityType: "FeeSchedule",
    entityId: schedule.id,
    metadata: { version, ...v },
  });

  return NextResponse.json({ schedule }, { status: 201 });
}
