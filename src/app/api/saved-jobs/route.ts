import { NextResponse } from "next/server";
import { z } from "zod";
import { Category } from "@prisma/client";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionUserId,
  audit,
} from "@/lib/server-auth";

const CATEGORY_VALUES = Object.values(Category) as [string, ...string[]];

const createSchema = z.object({
  name: z.string().min(2).max(120),
  category: z.enum(CATEGORY_VALUES),
  sizeYards: z.number().int().positive().max(100).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  city: z.string().max(80).optional().nullable(),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional().nullable(),
  materialType: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const deleteSchema = z.object({ id: z.string().min(1) });

/** GET /api/saved-jobs — client's saved job specs. */
export async function GET() {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const jobs = await db.savedJob.findMany({
    where: { clientId: sessionUserId(session) },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ savedJobs: jobs });
}

/** POST /api/saved-jobs — save a job spec for rebooking. */
export async function POST(req: Request) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const json = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const job = await db.savedJob.create({
    data: {
      ...parsed.data,
      category: parsed.data.category as Category,
      clientId: sessionUserId(session),
    },
  });
  return NextResponse.json({ savedJob: job }, { status: 201 });
}

/** DELETE /api/saved-jobs — {id} in body (or ?id= query). */
export async function DELETE(req: Request) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const userId = sessionUserId(session);

  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("id");
  const json = fromQuery ? { id: fromQuery } : await req.json().catch(() => null);
  const parsed = deleteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const job = await db.savedJob.findFirst({
    where: { id: parsed.data.id, clientId: userId },
  });
  if (!job) return NextResponse.json({ error: "Saved job not found" }, { status: 404 });

  await db.savedJob.delete({ where: { id: job.id } });
  await audit("saved_job.deleted", { entityType: "SavedJob", entityId: job.id });
  return NextResponse.json({ ok: true });
}
