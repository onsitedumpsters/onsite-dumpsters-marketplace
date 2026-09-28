import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireApiSession, audit, badRequest } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const faqItemSchema = z.object({
  q: z.string().min(1).max(300),
  a: z.string().min(1).max(2000),
});

const upsertSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9:_-]+$/, "key may only contain lowercase letters, digits, :, _ and -"),
  title: z.string().min(1).max(160),
  metaDescription: z.string().max(320).default(""),
  h1: z.string().max(160).default(""),
  intro: z.string().max(5000).default(""),
  faq: z.array(faqItemSchema).max(20).default([]),
});

export async function GET() {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const pages = await db.contentPage.findMany({ orderBy: { key: "asc" } });
  return NextResponse.json({ pages });
}

export async function POST(req: Request) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid content page", parsed.error.flatten());
  const v = parsed.data;

  const page = await db.contentPage.upsert({
    where: { key: v.key },
    create: {
      key: v.key,
      title: v.title,
      metaDescription: v.metaDescription,
      h1: v.h1,
      intro: v.intro,
      faqJson: v.faq,
    },
    update: {
      title: v.title,
      metaDescription: v.metaDescription,
      h1: v.h1,
      intro: v.intro,
      faqJson: v.faq,
    },
  });

  await audit("content.upsert", {
    entityType: "ContentPage",
    entityId: page.id,
    metadata: { key: page.key },
  });

  return NextResponse.json({ page });
}

export async function DELETE(req: Request) {
  const authz = await requireApiSession(["admin"]);
  if (authz instanceof NextResponse) return authz;

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) return badRequest("Missing key");

  const existing = await db.contentPage.findUnique({ where: { key } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.contentPage.delete({ where: { key } });

  await audit("content.delete", {
    entityType: "ContentPage",
    entityId: existing.id,
    metadata: { key },
  });

  return NextResponse.json({ ok: true });
}
