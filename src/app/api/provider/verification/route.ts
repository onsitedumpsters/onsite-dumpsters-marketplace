import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  requireApiSession,
  sessionUserId,
  audit,
  notify,
} from "@/lib/server-auth";

/** Accepts an absolute https URL or a local /uploads/ path from POST /api/uploads. */
const uploadUrl = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("/uploads/") || /^https?:\/\//i.test(v), {
    message: "Must be an https:// URL or an /uploads/ path",
  });

const docSchema = z.object({
  kind: z.enum(["insurance", "authority", "business_license", "other"]),
  url: uploadUrl,
  expiryDate: z.string().datetime({ offset: true }).optional(),
});

const bodySchema = z.object({
  businessName: z.string().min(2).max(120),
  contactName: z.string().max(120).optional(),
  phone: z.string().max(30).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(80).optional(),
  state: z.string().max(10).optional(),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  serviceRadiusMiles: z.number().positive().max(500).optional(),
  serviceZips: z.array(z.string().regex(/^\d{5}$/)).max(50).optional(),
  bio: z.string().max(2000).optional(),
  logoUrl: uploadUrl.optional(),
  insuranceProvider: z.string().max(120).optional(),
  insurancePolicyNo: z.string().max(80).optional(),
  insuranceExpiry: z.string().datetime({ offset: true }).optional(),
  authorityNumber: z.string().max(80).optional(),
  docs: z.array(docSchema).max(10).default([]),
});

/** GET /api/provider/verification — current profile + docs + status. */
export async function GET() {
  const session = await requireApiSession(["provider", "admin"]);
  if (session instanceof NextResponse) return session;
  const userId = sessionUserId(session);

  const profile = await db.providerProfile.findUnique({ where: { userId } });
  const docs = await db.verificationDoc.findMany({
    where: { providerId: userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ profile, docs });
}

/**
 * POST /api/provider/verification — upsert ProviderProfile + replace
 * VerificationDoc set, reset status to pending, audit, notify admins.
 */
export async function POST(req: Request) {
  const session = await requireApiSession(["provider", "admin"]);
  if (session instanceof NextResponse) return session;
  const userId = sessionUserId(session);

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { docs, insuranceExpiry, ...profileFields } = parsed.data;

  const profile = await db.providerProfile.upsert({
    where: { userId },
    create: {
      userId,
      ...profileFields,
      insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : null,
      verificationStatus: "pending",
    },
    update: {
      ...profileFields,
      insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : null,
      verificationStatus: "pending",
      verificationNotes: null,
      verifiedAt: null,
    },
  });

  await db.$transaction([
    db.verificationDoc.deleteMany({ where: { providerId: userId } }),
    ...(docs.length > 0
      ? [
          db.verificationDoc.createMany({
            data: docs.map((d) => ({
              providerId: userId,
              kind: d.kind,
              url: d.url,
              expiryDate: d.expiryDate ? new Date(d.expiryDate) : null,
              status: "pending",
            })),
          }),
        ]
      : []),
  ]);

  const admins = await db.user.findMany({ where: { role: "admin" }, select: { id: true } });
  await Promise.all(
    admins.map((a) =>
      notify(
        a.id,
        "Verification submitted",
        `${profile.businessName} submitted verification documents for review.`,
        "/admin",
      ),
    ),
  );
  await audit("provider.verification_submitted", {
    entityType: "ProviderProfile",
    entityId: profile.id,
    metadata: { docCount: docs.length },
  });

  return NextResponse.json({ profile, docCount: docs.length }, { status: 201 });
}
