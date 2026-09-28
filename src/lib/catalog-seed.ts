/**
 * Production-safe demo catalog seeder.
 *
 * Unlike prisma/seed.ts (which WIPES the database and creates users with a
 * publicly documented password — dev only), this module:
 *   - never deletes or modifies existing rows,
 *   - never creates a credential a stranger could use: the demo provider is
 *     created with passwordHash=null and no OAuth account, so it cannot sign in,
 *   - is idempotent: a second run detects the existing demo listings and skips,
 *   - refuses to run unless ALLOW_CATALOG_SEED=true is set.
 *
 * Intended to be invoked once from the admin-only POST /api/admin/seed-catalog
 * endpoint so the marketplace's search / category / city / homepage surfaces
 * have real content before real haulers onboard. The owner can delete the
 * demo listings from the dashboard at any time.
 */
import { db } from "@/lib/db";
import { DEFAULT_FEE_SCHEDULE } from "@/lib/fees";

export const DEMO_PROVIDER_EMAIL = "demo-hauler@onsitedumpsters.example";

export interface CatalogSeedResult {
  skipped: boolean;
  reason?: string;
  providerId?: string;
  listingsCreated?: number;
  feeScheduleCreated?: boolean;
}

export function assertCatalogSeedAllowed(): void {
  if (process.env.ALLOW_CATALOG_SEED !== "true") {
    throw new Error(
      "Catalog seeding is disabled. Set ALLOW_CATALOG_SEED=true to enable it.",
    );
  }
}

interface ListingDef {
  category:
    | "roll_off_10"
    | "roll_off_15"
    | "roll_off_20"
    | "roll_off_30"
    | "roll_off_40"
    | "front_load"
    | "yard_waste"
    | "construction_debris"
    | "concrete_only"
    | "recycling";
  sizeYards: number | null;
  title: string;
  blurb: string;
  basePriceCents: number;
}

// Downtown Orlando depot; listings are jittered around it.
const DEPOT = { lat: 28.5383, lng: -81.3792 };

const LISTINGS: ListingDef[] = [
  { category: "roll_off_10", sizeYards: 10, title: "10-Yard Roll-Off — Garage Cleanout", blurb: "Garage junk, small remodel debris, and household cleanouts.", basePriceCents: 32900 },
  { category: "roll_off_15", sizeYards: 15, title: "15-Yard Roll-Off — Mid-Size Cleanout", blurb: "Roofing tear-offs, flooring removal, and medium cleanouts.", basePriceCents: 38900 },
  { category: "roll_off_20", sizeYards: 20, title: "20-Yard Roll-Off — Most Popular", blurb: "Remodels, flooring, and yard waste. Our most-booked size.", basePriceCents: 44900 },
  { category: "roll_off_20", sizeYards: 20, title: "20-Yard Roll-Off — Contractor Rate", blurb: "Jobsite-ready container with flexible swap scheduling.", basePriceCents: 46900 },
  { category: "roll_off_30", sizeYards: 30, title: "30-Yard Roll-Off — Whole-Home Cleanout", blurb: "Estate cleanouts, large renovations, and bulky debris.", basePriceCents: 54900 },
  { category: "roll_off_40", sizeYards: 40, title: "40-Yard Roll-Off — Commercial Grade", blurb: "Maximum capacity for construction and demolition.", basePriceCents: 66900 },
  { category: "front_load", sizeYards: 6, title: "6-Yard Front-Load (Monthly Service)", blurb: "Recurring commercial service with scheduled weekly pickups.", basePriceCents: 15900 },
  { category: "yard_waste", sizeYards: 20, title: "20-Yard Yard Waste Dumpster", blurb: "Storm debris, tree work, and landscaping cleanups. Vegetative waste only.", basePriceCents: 39500 },
  { category: "construction_debris", sizeYards: 30, title: "30-Yard C&D Debris Dumpster", blurb: "Job-site construction and demolition debris.", basePriceCents: 55900 },
  { category: "construction_debris", sizeYards: 20, title: "20-Yard C&D Debris Dumpster", blurb: "Remodel debris: drywall, lumber, roofing, and flooring.", basePriceCents: 46900 },
  { category: "concrete_only", sizeYards: 10, title: "10-Yard Concrete-Only Dumpster", blurb: "Clean concrete, brick, and dirt. Lower rate for inert loads.", basePriceCents: 32500 },
  { category: "recycling", sizeYards: 20, title: "20-Yard Recycling Dumpster", blurb: "Cardboard, metal, and single-stream recyclables for job sites.", basePriceCents: 37500 },
];

const PROHIBITED = [
  "hazardous waste",
  "tires",
  "batteries",
  "paint",
  "appliances with freon",
  "asbestos",
];

function materialsFor(category: ListingDef["category"]): string[] {
  switch (category) {
    case "yard_waste":
      return ["brush", "limbs", "leaves", "grass", "storm debris"];
    case "concrete_only":
      return ["concrete", "brick", "block", "dirt", "asphalt"];
    case "recycling":
      return ["cardboard", "metal", "paper", "plastic", "wood (untreated)"];
    case "front_load":
      return ["general commercial waste", "cardboard", "office waste"];
    case "construction_debris":
      return ["drywall", "lumber", "roofing", "flooring", "siding"];
    default:
      return ["household junk", "furniture", "drywall", "lumber", "flooring", "yard waste"];
  }
}

export async function seedCatalog(): Promise<CatalogSeedResult> {
  assertCatalogSeedAllowed();

  const existing = await db.listing.count({
    where: { provider: { email: DEMO_PROVIDER_EMAIL } },
  });
  if (existing > 0) {
    return {
      skipped: true,
      reason: `Demo catalog already present (${existing} listings). Delete them from the dashboard to re-seed.`,
    };
  }

  // Booking math reads the active fee schedule from the DB — ensure one exists.
  let feeScheduleCreated = false;
  const activeSchedule = await db.feeSchedule.findFirst({ where: { isActive: true } });
  if (!activeSchedule) {
    await db.feeSchedule.create({
      data: {
        version: 1,
        bookingFeeCents: DEFAULT_FEE_SCHEDULE.bookingFeeCents,
        droppingFeeCents: DEFAULT_FEE_SCHEDULE.droppingFeeCents,
        processingPct: DEFAULT_FEE_SCHEDULE.processingPct,
        processingFlatCents: DEFAULT_FEE_SCHEDULE.processingFlatCents,
        takeRatePct: DEFAULT_FEE_SCHEDULE.takeRatePct,
        cancelFullHours: DEFAULT_FEE_SCHEDULE.cancelFullHours,
        cancelHalfHours: DEFAULT_FEE_SCHEDULE.cancelHalfHours,
        isActive: true,
      },
    });
    feeScheduleCreated = true;
  }

  // Demo provider with NO password and NO OAuth account: the row exists so
  // listings have an owner, but nobody can ever sign in as this user.
  const provider = await db.user.upsert({
    where: { email: DEMO_PROVIDER_EMAIL },
    update: { passwordHash: null },
    create: {
      email: DEMO_PROVIDER_EMAIL,
      name: "Demo Hauler (sample listings)",
      role: "provider",
      passwordHash: null,
    },
  });
  await db.providerProfile.upsert({
    where: { userId: provider.id },
    update: {},
    create: {
      userId: provider.id,
      businessName: "Demo Hauler (sample listings)",
      city: "Orlando",
      state: "FL",
      zip: "32801",
      lat: DEPOT.lat,
      lng: DEPOT.lng,
      verificationStatus: "pending",
      bio: "Sample listings published by the marketplace owner for demonstration. Replace with real hauler onboarding.",
    },
  });

  let n = 0;
  for (const def of LISTINGS) {
    n += 1;
    const lat = +(DEPOT.lat + (n % 5) * 0.012 - 0.024).toFixed(4);
    const lng = +(DEPOT.lng + ((n * 7) % 5) * 0.012 - 0.024).toFixed(4);
    await db.listing.create({
      data: {
        slug: `demo-${def.category}-${n}`,
        providerId: provider.id,
        title: `${def.title} — Orlando, FL`,
        category: def.category,
        sizeYards: def.sizeYards,
        description:
          `SAMPLE LISTING — published for demonstration; the owner can remove it any time. ` +
          `${def.blurb} Includes 7-day rental, delivery, pickup, and disposal up to the included tonnage.`,
        basePriceCents: def.basePriceCents,
        includedDays: 7,
        includedTons:
          def.category.startsWith("roll_off") && (def.sizeYards ?? 0) >= 30
            ? 4
            : def.category.startsWith("roll_off") && (def.sizeYards ?? 0) >= 20
              ? 3
              : 2,
        overagePerTonCents: 7500,
        extraDayCents: 1500,
        materialsAccepted: materialsFor(def.category),
        materialsProhibited: PROHIBITED,
        serviceLat: lat,
        serviceLng: lng,
        serviceRadiusMiles: 30,
        serviceZips: ["32801", "32803", "32806"],
        photos: [`https://picsum.photos/seed/odump-catalog-${n}/800/600`],
        primaryPhoto: `https://picsum.photos/seed/odump-catalog-${n}/800/600`,
        rightsStatus: "placeholder — replace with owned photography",
        status: "active",
        ratingAvg: 4.5,
        reviewCount: 0,
        bookingCount: 0,
      },
    });
  }

  return {
    skipped: false,
    providerId: provider.id,
    listingsCreated: LISTINGS.length,
    feeScheduleCreated,
  };
}
