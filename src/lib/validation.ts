import { z } from "zod";
import { ContainerStatus, ContainerType } from "@prisma/client";
import { CATEGORIES } from "@/lib/cities";

/** Category codes from the canonical CATEGORIES list (BUILD_SPEC §2). */
const CATEGORY_VALUES = CATEGORIES.map((c) => c.code) as [string, ...string[]];

const CONTAINER_TYPES = Object.values(ContainerType) as [string, ...string[]];
const CONTAINER_STATUSES = Object.values(ContainerStatus) as [string, ...string[]];

/** Accepts an absolute https URL or a local /uploads/ path from POST /api/uploads. */
export const uploadUrl = z
  .string()
  .max(500)
  .refine((v) => v.startsWith("/uploads/") || /^https?:\/\//i.test(v), {
    message: "Must be an https:// URL or an /uploads/ path",
  });

/** Provider listing create/update validation. */
export const listingSchema = z.object({
  title: z.string().min(3).max(120),
  category: z.enum(CATEGORY_VALUES),
  sizeYards: z.number().int().positive().max(100).optional().nullable(),
  description: z.string().min(10).max(5000),
  basePriceCents: z.number().int().min(0),
  includedDays: z.number().int().min(1).max(90).default(7),
  includedTons: z.number().positive().max(50).default(2),
  overagePerTonCents: z.number().int().min(0).default(7500),
  extraDayCents: z.number().int().min(0).default(1500),
  materialsAccepted: z.array(z.string().max(80)).max(30).default([]),
  materialsProhibited: z.array(z.string().max(80)).max(30).default([]),
  serviceLat: z.number().min(-90).max(90).optional().nullable(),
  serviceLng: z.number().min(-180).max(180).optional().nullable(),
  serviceRadiusMiles: z.number().positive().max(500).default(30),
  serviceZips: z.array(z.string().regex(/^\d{5}$/)).max(50).default([]),
  photos: z.array(uploadUrl).max(20).default([]),
  primaryPhoto: uploadUrl.optional().nullable(),
  status: z.enum(["draft", "active", "paused"]).default("draft"),
});

/** Fleet container create/update validation. */
export const containerSchema = z.object({
  assetTag: z.string().max(40).optional().nullable(),
  sizeYards: z.number().int().positive().max(100),
  containerType: z.enum(CONTAINER_TYPES),
  condition: z.string().max(40).default("good"),
  depotAddress: z.string().max(200).optional().nullable(),
  depotCity: z.string().max(80).optional(),
  depotLat: z.number().min(-90).max(90).optional().nullable(),
  depotLng: z.number().min(-180).max(180).optional().nullable(),
  photos: z.array(uploadUrl).max(20).default([]),
  status: z.enum(CONTAINER_STATUSES).default("available"),
  notes: z.string().max(2000).optional().nullable(),
});
