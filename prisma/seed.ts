/**
 * Onsite Dumpsters Marketplace — demo seed script.
 * Run: npx tsx prisma/seed.ts   (also wired as `npm run db:seed`)
 *
 * Re-runnable: clears all existing rows (FK-safe order) before seeding.
 * Demo password for EVERY seeded user: Demo1234!  (bcryptjs, 12 rounds).
 * This password is a documented demo credential only — never use in production.
 *
 * NOTE: this script deletes ALL rows in the demo tables. Do not run against
 * a production database.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calculateFees, DEFAULT_FEE_SCHEDULE } from "../src/lib/fees";

const db = new PrismaClient();

const DEMO_PASSWORD = "Demo1234!";
const RIGHTS = "placeholder — replace with owned photography";
const pic = (seed: string) => `https://picsum.photos/seed/${seed}/800/600`;
const DAY = 86_400_000;
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
const daysFromNow = (d: number) => new Date(now.getTime() + d * DAY);
const hoursAfter = (base: Date, h: number) => new Date(base.getTime() + h * 3_600_000);

// ---------------------------------------------------------------------------
// 1. Clear existing data (FK-safe order: children before parents)
// ---------------------------------------------------------------------------
async function clearAll() {
  console.log("Clearing existing data…");
  await db.adEvent.deleteMany();
  await db.adInvoice.deleteMany();
  await db.ledgerEntry.deleteMany();
  await db.evidencePhoto.deleteMany();
  await db.adjustment.deleteMany();
  await db.orderEvent.deleteMany();
  await db.review.deleteMany();
  await db.dispute.deleteMany();
  await db.payout.deleteMany();
  await db.adCampaign.deleteMany();
  await db.order.deleteMany();
  await db.listing.deleteMany();
  await db.container.deleteMany();
  await db.adPlacement.deleteMany();
  await db.feeSchedule.deleteMany();
  await db.verificationDoc.deleteMany();
  await db.notification.deleteMany();
  await db.auditLog.deleteMany();
  await db.savedJob.deleteMany();
  await db.session.deleteMany();
  await db.account.deleteMany();
  await db.providerProfile.deleteMany();
  await db.fleetOwnerProfile.deleteMany();
  await db.user.deleteMany();
  await db.verificationToken.deleteMany();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
type OrderStatusString =
  | "quote" | "booked" | "accepted" | "dispatched" | "delivered" | "in_service"
  | "pickup_scheduled" | "picked_up" | "completed" | "reviewed" | "cancelled" | "disputed";

interface ChainStep {
  from: OrderStatusString;
  to: OrderStatusString;
  actorId?: string;
  actorRole?: string;
  note?: string;
  at: Date;
}

async function addEvents(orderId: string, chain: ChainStep[]) {
  for (const s of chain) {
    await db.orderEvent.create({
      data: {
        orderId,
        fromStatus: s.from,
        toStatus: s.to,
        actorId: s.actorId,
        actorRole: s.actorRole,
        note: s.note,
        createdAt: s.at,
      },
    });
  }
}

interface LedgerRow {
  type:
    | "charge_authorized" | "charge_captured" | "fee_booking" | "fee_dropping"
    | "fee_processing" | "fee_take_rate" | "hauler_payout" | "rental_refund"
    | "adjustment_charge" | "dispute_hold" | "dispute_release" | "ad_revenue"
    | "payout_transfer";
  amountCents: number;
  description: string;
}

async function addLedger(orderNumber: string, orderId: string | null, rows: LedgerRow[], adInvoiceId?: string) {
  for (const r of rows) {
    await db.ledgerEntry.create({
      data: {
        orderId,
        adInvoiceId,
        type: r.type,
        amountCents: r.amountCents,
        description: r.description,
        idempotencyKey: `seed:${orderNumber}:${r.type}`,
      },
    });
  }
}

function feeRows(b: ReturnType<typeof calculateFees>): LedgerRow[] {
  return [
    { type: "fee_booking", amountCents: b.bookingFeeCents, description: "Booking fee — platform revenue (non-refundable)" },
    { type: "fee_dropping", amountCents: b.droppingFeeCents, description: "Drop-off fee — platform revenue (non-refundable)" },
    { type: "fee_processing", amountCents: b.processingFeeCents, description: "Payment processing fee — platform revenue (non-refundable)" },
    { type: "fee_take_rate", amountCents: b.takeRateCents, description: "Take rate 8% of rental — platform revenue (non-refundable)" },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // Safety guard: this script WIPES the database and creates an admin account
  // with a publicly documented password. Refuse to run against anything that
  // does not look like a local/dev database unless explicitly overridden.
  const dbUrl = process.env.DATABASE_URL ?? "";
  const looksLocal = /localhost|127\.0\.0\.1|\/drilldb|_dev|_demo|_test/i.test(dbUrl);
  if (!looksLocal && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to seed: DATABASE_URL does not look like a local/dev database. " +
        "Set ALLOW_DEMO_SEED=true to override (you will wipe all data).",
    );
  }

  await clearAll();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  // ── Fee schedule v1 (binding, from DEFAULT_FEE_SCHEDULE) ─────────────────
  const feeSchedule = await db.feeSchedule.create({
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
  console.log(`FeeSchedule v1 created (booking $${(feeSchedule.bookingFeeCents / 100).toFixed(2)}, dropping $${(feeSchedule.droppingFeeCents / 100).toFixed(2)}, take rate ${(feeSchedule.takeRatePct * 100).toFixed(0)}%)`);

  // ── Ad placements ───────────────────────────────────────────────────────
  const sponsored = await db.adPlacement.create({
    data: { code: "sponsored_search", name: "Sponsored Search Boost", description: "Top-3 pinned slot in search results with a clear “Sponsored” badge.", priceCents: 4900, durationDays: 7, maxSlots: 3 },
  });
  const homepage = await db.adPlacement.create({
    data: { code: "homepage_feature", name: "Homepage Feature", description: "Featured carousel slot on the marketplace homepage.", priceCents: 9900, durationDays: 7, maxSlots: 3 },
  });
  const banner = await db.adPlacement.create({
    data: { code: "category_banner", name: "Category Page Banner", description: "Banner slot on category landing pages.", priceCents: 14900, durationDays: 7, maxSlots: 2 },
  });
  console.log("3 AdPlacements created (sponsored_search $49, homepage_feature $99, category_banner $149)");

  // ── Users ───────────────────────────────────────────────────────────────
  const admin = await db.user.create({
    data: { email: "admin@onsitedumpsters.example", name: "Marketplace Owner", role: "admin", passwordHash },
  });
  const maria = await db.user.create({
    data: { email: "maria.client@example.com", name: "Maria Santos", role: "client", passwordHash, phone: "(407) 555-0101" },
  });
  const bob = await db.user.create({
    data: { email: "contractor.bob@example.com", name: "Bob's Remodeling", role: "client", passwordHash, phone: "(407) 555-0102" },
  });

  const sunshine = await db.user.create({
    data: {
      email: "sunshine.hauling@example.com", name: "Sunshine Hauling Co.", role: "provider", passwordHash, phone: "(407) 555-0114",
      providerProfile: {
        create: {
          businessName: "Sunshine Hauling Co.",
          contactName: "Dana Whitfield",
          phone: "(407) 555-0114",
          address: "1420 W Colonial Dr", city: "Orlando", state: "FL", zip: "32801",
          lat: 28.55, lng: -81.38, serviceRadiusMiles: 30,
          serviceZips: ["32801", "32803", "32806"],
          bio: "Family-owned Orlando hauler since 2011. Same-week roll-off delivery across the metro.",
          insuranceProvider: "FL Commercial Casualty", insurancePolicyNo: "FCC-88213",
          insuranceExpiry: daysFromNow(300), authorityNumber: "FL-MC-44821",
          verificationStatus: "approved", verifiedAt: daysAgo(60),
          ratingAvg: 4.8, reviewCount: 2, completedJobs: 2, onTimeRate: 0.97,
        },
      },
    },
  });
  const cfl = await db.user.create({
    data: {
      email: "cfl.waste@example.com", name: "Central FL Waste Services", role: "provider", passwordHash, phone: "(407) 555-0115",
      providerProfile: {
        create: {
          businessName: "Central FL Waste Services",
          contactName: "Marcus Bell",
          phone: "(407) 555-0115",
          address: "88 Semoran Blvd", city: "Winter Park", state: "FL", zip: "32792",
          lat: 28.6, lng: -81.34, serviceRadiusMiles: 35,
          serviceZips: ["32801", "32789", "32792"],
          bio: "Full-service commercial and residential hauling across Orange and Seminole counties.",
          insuranceProvider: "SunState Insurance", insurancePolicyNo: "SSI-55190",
          insuranceExpiry: daysFromNow(210), authorityNumber: "FL-MC-51207",
          verificationStatus: "approved", verifiedAt: daysAgo(45),
          ratingAvg: 4.6, reviewCount: 1, completedJobs: 1, onTimeRate: 0.93,
        },
      },
    },
  });
  const rapid = await db.user.create({
    data: {
      email: "rapid.rolloff@example.com", name: "Rapid Roll-Offs LLC", role: "provider", passwordHash, phone: "(407) 555-0116",
      providerProfile: {
        create: {
          businessName: "Rapid Roll-Offs LLC",
          contactName: "Tanya Ruiz",
          phone: "(407) 555-0116",
          address: "500 W Oak Ridge Rd", city: "Orlando", state: "FL", zip: "32809",
          lat: 28.53, lng: -81.42, serviceRadiusMiles: 25,
          serviceZips: ["32809", "32819"],
          bio: "New hauler specializing in fast-turnaround roll-off rentals.",
          verificationStatus: "pending",
          verificationNotes: "Awaiting insurance certificate upload.",
          ratingAvg: 0, reviewCount: 0, completedJobs: 0,
        },
      },
    },
  });
  const fleetOwner = await db.user.create({
    data: {
      email: "fleet.owner@example.com", name: "Orlando Fleet Holdings", role: "fleet_owner", passwordHash, phone: "(407) 555-0117",
      fleetProfile: {
        create: {
          companyName: "Orlando Fleet Holdings",
          contactName: "Priya Nair",
          phone: "(407) 555-0117",
          address: "2700 Shader Rd", city: "Orlando", state: "FL", zip: "32808",
          lat: 28.52, lng: -81.4,
          bio: "Independent container fleet leasing roll-offs, front-loaders and compactors to verified Orlando haulers.",
        },
      },
    },
  });
  console.log("7 users created (1 admin, 2 clients, 3 providers, 1 fleet_owner)");

  // ── Fleet containers (6: 10/20/30/40 yd roll-offs + front-load + compactor) ──
  const containerDefs = [
    { assetTag: "OFH-10-001", sizeYards: 10, containerType: "roll_off" as const, assigned: true },
    { assetTag: "OFH-20-001", sizeYards: 20, containerType: "roll_off" as const, assigned: true },
    { assetTag: "OFH-30-001", sizeYards: 30, containerType: "roll_off" as const, assigned: false },
    { assetTag: "OFH-40-001", sizeYards: 40, containerType: "roll_off" as const, assigned: false },
    { assetTag: "OFH-FL-001", sizeYards: 6, containerType: "front_load" as const, assigned: false },
    { assetTag: "OFH-CP-001", sizeYards: 30, containerType: "compactor" as const, assigned: false },
  ];
  for (const c of containerDefs) {
    await db.container.create({
      data: {
        fleetOwnerId: fleetOwner.id,
        assetTag: c.assetTag,
        sizeYards: c.sizeYards,
        containerType: c.containerType,
        condition: "good",
        depotAddress: "2700 Shader Rd, Orlando, FL 32808",
        depotCity: "Orlando",
        depotLat: 28.52,
        depotLng: -81.4,
        photos: [pic(`container-${c.assetTag.toLowerCase()}`)],
        rightsStatus: RIGHTS,
        status: c.assigned ? "assigned" : "available",
        assignedProviderId: c.assigned ? sunshine.id : undefined,
        notes: `Demo container — ${c.sizeYards} yd ${c.containerType.replace("_", " ")}.`,
      },
    });
  }
  console.log("6 fleet containers created (2 assigned to Sunshine Hauling)");

  // ── Listings: 24 across 12 categories, spread over the 3 providers ────────
  const PROHIBITED = ["hazardous waste", "tires", "batteries", "liquids", "asbestos"];
  const MATERIALS: Record<string, string[]> = {
    roll_off: ["household junk", "furniture", "yard debris", "construction debris"],
    yard_waste: ["brush", "limbs", "leaves", "storm debris"],
    construction_debris: ["lumber", "drywall", "roofing", "flooring"],
    concrete_only: ["concrete", "brick", "block", "dirt"],
    recycling: ["cardboard", "metal", "single-stream recyclables"],
    compactor: ["commercial waste", "cardboard"],
    front_load: ["commercial waste", "cardboard"],
    rear_load: ["commercial waste", "cardboard"],
  };
  function materialsFor(category: string): string[] {
    if (category.startsWith("roll_off")) return MATERIALS.roll_off;
    return MATERIALS[category] ?? MATERIALS.roll_off;
  }
  const providers = [sunshine, cfl, rapid];
  const depots = [
    { lat: 28.55, lng: -81.38 }, // sunshine
    { lat: 28.6, lng: -81.34 }, // cfl
    { lat: 28.53, lng: -81.42 }, // rapid
  ];
  const short = ["sunshine", "cfl", "rapid"];

  interface ListingDef {
    category: "roll_off_10" | "roll_off_15" | "roll_off_20" | "roll_off_30" | "roll_off_40" | "front_load" | "rear_load" | "yard_waste" | "construction_debris" | "concrete_only" | "recycling" | "compactor";
    sizeYards: number | null;
    providerIdx: number;
    basePriceCents: number;
    title: string;
    blurb: string;
  }
  const LISTING_DEFS: ListingDef[] = [
    { category: "roll_off_10", sizeYards: 10, providerIdx: 0, basePriceCents: 29500, title: "10-Yard Roll-Off Dumpster", blurb: "Perfect for garage cleanouts and small remodels. Fits in a standard driveway." },
    { category: "roll_off_10", sizeYards: 10, providerIdx: 1, basePriceCents: 31500, title: "10-Yard Roll-Off — Contractor Special", blurb: "Low-profile 10-yarder for tight Orlando driveways and quick turnarounds." },
    { category: "roll_off_15", sizeYards: 15, providerIdx: 2, basePriceCents: 35900, title: "15-Yard Roll-Off Dumpster", blurb: "Mid-size workhorse for roofing tear-offs and basement cleanouts." },
    { category: "roll_off_15", sizeYards: 15, providerIdx: 0, basePriceCents: 34900, title: "15-Yard Roll-Off — Same-Week Delivery", blurb: "Popular pick for flooring removal and medium cleanouts." },
    { category: "roll_off_20", sizeYards: 20, providerIdx: 0, basePriceCents: 42500, title: "20-Yard Roll-Off Dumpster", blurb: "Our most-booked size: kitchen remodels, yard waste, and estate cleanouts." },
    { category: "roll_off_20", sizeYards: 20, providerIdx: 1, basePriceCents: 44500, title: "20-Yard Roll-Off — 7-Day Rental", blurb: "Driveway-friendly 20-yarder with flexible swap-outs for contractors." },
    { category: "roll_off_30", sizeYards: 30, providerIdx: 1, basePriceCents: 54900, title: "30-Yard Roll-Off Dumpster", blurb: "Whole-home cleanouts and bulky construction debris. High sidewalls, big capacity." },
    { category: "roll_off_30", sizeYards: 30, providerIdx: 2, basePriceCents: 52900, title: "30-Yard Roll-Off — Jobsite Ready", blurb: "Built for renovation debris: drywall, lumber, flooring, and more." },
    { category: "roll_off_40", sizeYards: 40, providerIdx: 0, basePriceCents: 64900, title: "40-Yard Roll-Off Dumpster", blurb: "Maximum capacity for major construction and commercial tear-outs." },
    { category: "roll_off_40", sizeYards: 40, providerIdx: 1, basePriceCents: 67500, title: "40-Yard Roll-Off — Commercial Grade", blurb: "The big one: new construction, demolition, and large-scale cleanouts." },
    { category: "front_load", sizeYards: 6, providerIdx: 0, basePriceCents: 15900, title: "6-Yard Front-Load Dumpster (Monthly)", blurb: "Recurring commercial service with scheduled weekly pickups." },
    { category: "front_load", sizeYards: 4, providerIdx: 1, basePriceCents: 13900, title: "4-Yard Front-Load Dumpster (Monthly)", blurb: "Compact commercial container for restaurants and small retail." },
    { category: "rear_load", sizeYards: 4, providerIdx: 1, basePriceCents: 14900, title: "4-Yard Rear-Load Dumpster (Monthly)", blurb: "Rear-load service for tight alleys and limited-access properties." },
    { category: "rear_load", sizeYards: 6, providerIdx: 2, basePriceCents: 16900, title: "6-Yard Rear-Load Dumpster (Monthly)", blurb: "Rear-load commercial container with flexible pickup schedules." },
    { category: "yard_waste", sizeYards: 20, providerIdx: 0, basePriceCents: 39500, title: "20-Yard Yard Waste Dumpster", blurb: "Storm debris, tree work, and landscaping cleanups. Vegetative waste only." },
    { category: "yard_waste", sizeYards: 20, providerIdx: 2, basePriceCents: 38500, title: "20-Yard Yard Waste — Storm Season", blurb: "Fast delivery for hurricane-season brush and limb removal." },
    { category: "construction_debris", sizeYards: 30, providerIdx: 1, basePriceCents: 55900, title: "30-Yard C&D Debris Dumpster", blurb: "Job-site C&D with heavy-material options for concrete and dirt." },
    { category: "construction_debris", sizeYards: 20, providerIdx: 0, basePriceCents: 46900, title: "20-Yard C&D Debris Dumpster", blurb: "Remodel debris: drywall, lumber, roofing, and flooring." },
    { category: "concrete_only", sizeYards: 10, providerIdx: 0, basePriceCents: 32500, title: "10-Yard Concrete-Only Dumpster", blurb: "Clean concrete, brick, and dirt. Lower rate for inert loads." },
    { category: "concrete_only", sizeYards: 10, providerIdx: 1, basePriceCents: 33900, title: "10-Yard Concrete & Dirt Dumpster", blurb: "Driveway tear-outs and patio demo. No trash mixed in." },
    { category: "recycling", sizeYards: 20, providerIdx: 2, basePriceCents: 37500, title: "20-Yard Recycling Dumpster", blurb: "Cardboard, metal, and single-stream recyclables for job sites." },
    { category: "recycling", sizeYards: 30, providerIdx: 1, basePriceCents: 45900, title: "30-Yard Recycling Dumpster", blurb: "High-volume recycling for commercial and construction projects." },
    { category: "compactor", sizeYards: null, providerIdx: 1, basePriceCents: 149500, title: "Self-Contained Compactor (Monthly)", blurb: "High-volume commercial waste compaction with scheduled hauls." },
    { category: "compactor", sizeYards: null, providerIdx: 0, basePriceCents: 169500, title: "Stationary Compactor 2-Yard Charge Box", blurb: "Retail and grocery waste compaction. Includes installation." },
  ];

  const listingIds: string[] = [];
  const listingsByKey: Record<string, string> = {};
  let n = 0;
  for (const def of LISTING_DEFS) {
    n += 1;
    const p = providers[def.providerIdx];
    const depot = depots[def.providerIdx];
    const lat = +(depot.lat + (n % 5) * 0.012 - 0.024).toFixed(4);
    const lng = +(depot.lng + ((n * 7) % 5) * 0.012 - 0.024).toFixed(4);
    const key = `${def.category}-${short[def.providerIdx]}`;
    const created = await db.listing.create({
      data: {
        slug: `${short[def.providerIdx]}-${def.category}-${n}`,
        providerId: p.id,
        title: `${def.title} — Orlando, FL`,
        category: def.category,
        sizeYards: def.sizeYards,
        description: `${def.blurb} Includes 7-day rental, delivery, pickup, and disposal up to the included tonnage. Prohibited materials are never accepted.`,
        basePriceCents: def.basePriceCents,
        includedDays: 7,
        includedTons: def.category.startsWith("roll_off") ? (def.sizeYards! >= 30 ? 4 : def.sizeYards! >= 20 ? 3 : 2) : 2,
        overagePerTonCents: 7500,
        extraDayCents: 1500,
        materialsAccepted: materialsFor(def.category),
        materialsProhibited: PROHIBITED,
        serviceLat: lat,
        serviceLng: lng,
        serviceRadiusMiles: 30,
        serviceZips: ["32801", "32803", "32806"],
        photos: [pic(`odump${n}`)],
        primaryPhoto: pic(`odump${n}`),
        rightsStatus: RIGHTS,
        status: "active",
        ratingAvg: 4.4 + ((n * 13) % 7) / 10,
        reviewCount: 3 + ((n * 29) % 34),
        bookingCount: 5 + ((n * 17) % 40),
      },
    });
    listingIds.push(created.id);
    listingsByKey[key] = created.id;
  }
  console.log(`24 listings created across ${new Set(LISTING_DEFS.map((d) => d.category)).size} categories`);

  // Mark the sponsored listing as featured
  await db.listing.update({
    where: { id: listingsByKey["roll_off_20-sunshine"] },
    data: { featuredUntil: daysFromNow(6) },
  });

  // ── Orders (every state) ──────────────────────────────────────────────
  // 1) reviewed #1 — Maria × Sunshine 20yd $425 — full happy path + review + overweight adjustment
  const b1 = calculateFees(42500);
  const o1 = await db.order.create({
    data: {
      orderNumber: "OD-2026-1001",
      clientId: maria.id, listingId: listingsByKey["roll_off_20-sunshine"], providerId: sunshine.id,
      feeScheduleId: feeSchedule.id,
      status: "reviewed", paymentStatus: "captured", escrowStatus: "released",
      rentalSubtotalCents: b1.rentalSubtotalCents, bookingFeeCents: b1.bookingFeeCents,
      droppingFeeCents: b1.droppingFeeCents, processingFeeCents: b1.processingFeeCents,
      takeRateCents: b1.takeRateCents, grandTotalCents: b1.grandTotalCents,
      haulerPayoutCents: b1.haulerPayoutCents,
      deliveryAddress: "1234 Lakeview Ave", deliveryCity: "Orlando", deliveryState: "FL", deliveryZip: "32803",
      deliveryLat: 28.545, deliveryLng: -81.375,
      placementNotes: "Driveway, left side near garage", projectType: "Kitchen remodel", materialType: "Construction debris",
      deliveryDate: daysAgo(28), deliveryWindow: "8am–12pm",
      cancellationPolicyAcceptedAt: daysAgo(31), cancellationPolicyVersion: 1,
      acceptedAt: hoursAfter(daysAgo(31), 3), dispatchedAt: hoursAfter(daysAgo(28), -3),
      deliveredAt: hoursAfter(daysAgo(28), 2), pickupScheduledAt: hoursAfter(daysAgo(21), 9),
      pickedUpAt: hoursAfter(daysAgo(20), 10), completedAt: hoursAfter(daysAgo(20), 12),
      stripePaymentIntentId: "pi_demo_1001", stripeChargeId: "ch_demo_1001",
    },
  });
  await addLedger("OD-2026-1001", o1.id, [
    { type: "charge_captured", amountCents: b1.grandTotalCents, description: "Customer charge captured — $487.02" },
    ...feeRows(b1),
    { type: "hauler_payout", amountCents: -b1.haulerPayoutCents, description: "Hauler payout released to Sunshine Hauling Co." },
    { type: "adjustment_charge", amountCents: 7500, description: "Overweight adjustment: 1.0 ton over included 3 tons @ $75/ton" },
  ]);
  await addEvents(o1.id, [
    { from: "quote", to: "booked", actorId: maria.id, actorRole: "client", note: "Payment authorized — $487.02 held in escrow.", at: daysAgo(31) },
    { from: "booked", to: "accepted", actorId: sunshine.id, actorRole: "provider", note: "Sunshine Hauling accepted the job.", at: hoursAfter(daysAgo(31), 3) },
    { from: "accepted", to: "dispatched", actorId: sunshine.id, actorRole: "provider", note: "Driver dispatched with 20-yard roll-off.", at: hoursAfter(daysAgo(28), -3) },
    { from: "dispatched", to: "delivered", actorId: sunshine.id, actorRole: "provider", note: "Delivered with photo proof.", at: hoursAfter(daysAgo(28), 2) },
    { from: "delivered", to: "in_service", actorId: sunshine.id, actorRole: "provider", note: "Container in service at customer site.", at: hoursAfter(daysAgo(28), 3) },
    { from: "in_service", to: "pickup_scheduled", actorId: maria.id, actorRole: "client", note: "Customer requested pickup.", at: hoursAfter(daysAgo(21), 9) },
    { from: "pickup_scheduled", to: "picked_up", actorId: sunshine.id, actorRole: "provider", note: "Picked up with photo proof.", at: hoursAfter(daysAgo(20), 10) },
    { from: "picked_up", to: "completed", actorId: sunshine.id, actorRole: "provider", note: "Escrow released to hauler.", at: hoursAfter(daysAgo(20), 12) },
    { from: "completed", to: "reviewed", actorId: maria.id, actorRole: "client", note: "Customer submitted a 5-star review.", at: hoursAfter(daysAgo(20), 30) },
  ]);
  await db.review.create({
    data: { orderId: o1.id, clientId: maria.id, providerId: sunshine.id, listingId: listingsByKey["roll_off_20-sunshine"], rating: 5, title: "On time and spotless pickup", body: "Driver placed the 20-yarder exactly where asked and pickup was a day early. Total price matched the quote to the cent." },
  });
  await db.evidencePhoto.createMany({
    data: [
      { orderId: o1.id, kind: "delivery", url: pic("odump-ev-del-1001"), caption: "Container placed in driveway", uploadedById: sunshine.id },
      { orderId: o1.id, kind: "pickup", url: pic("odump-ev-pick-1001"), caption: "Container picked up, site clean", uploadedById: sunshine.id },
      { orderId: o1.id, kind: "weight_ticket", url: pic("odump-ev-wt-1001"), caption: "Weight ticket: 4.0 tons (1.0 over included 3)", uploadedById: sunshine.id },
    ],
  });
  await db.adjustment.create({
    data: { orderId: o1.id, kind: "overweight", amountCents: 7500, description: "1.0 ton over included 3 tons @ $75/ton", evidenceUrls: [pic("odump-ev-wt-1001")], status: "charged", stripePaymentIntentId: "pi_demo_adj_1001" },
  });
  await db.payout.create({
    data: { providerId: sunshine.id, orderId: o1.id, amountCents: b1.haulerPayoutCents, status: "paid", stripeTransferId: "tr_demo_1001", paidAt: hoursAfter(daysAgo(20), 14) },
  });

  // 2) reviewed #2 — Bob × Central FL Waste 30yd $549
  const b2 = calculateFees(54900);
  const o2 = await db.order.create({
    data: {
      orderNumber: "OD-2026-1002",
      clientId: bob.id, listingId: listingsByKey["roll_off_30-cfl"], providerId: cfl.id,
      feeScheduleId: feeSchedule.id,
      status: "reviewed", paymentStatus: "captured", escrowStatus: "released",
      rentalSubtotalCents: b2.rentalSubtotalCents, bookingFeeCents: b2.bookingFeeCents,
      droppingFeeCents: b2.droppingFeeCents, processingFeeCents: b2.processingFeeCents,
      takeRateCents: b2.takeRateCents, grandTotalCents: b2.grandTotalCents,
      haulerPayoutCents: b2.haulerPayoutCents,
      deliveryAddress: "77 Renovation Way", deliveryCity: "Winter Park", deliveryState: "FL", deliveryZip: "32789",
      deliveryLat: 28.605, deliveryLng: -81.35,
      placementNotes: "Jobsite, behind the fence", projectType: "Whole-home cleanout", materialType: "Mixed debris",
      deliveryDate: daysAgo(16), deliveryWindow: "12pm–4pm",
      cancellationPolicyAcceptedAt: daysAgo(19), cancellationPolicyVersion: 1,
      acceptedAt: hoursAfter(daysAgo(19), 5), dispatchedAt: hoursAfter(daysAgo(16), -2),
      deliveredAt: hoursAfter(daysAgo(16), 1), pickupScheduledAt: hoursAfter(daysAgo(9), 8),
      pickedUpAt: hoursAfter(daysAgo(8), 11), completedAt: hoursAfter(daysAgo(8), 13),
      stripePaymentIntentId: "pi_demo_1002", stripeChargeId: "ch_demo_1002",
    },
  });
  await addLedger("OD-2026-1002", o2.id, [
    { type: "charge_captured", amountCents: b2.grandTotalCents, description: "Customer charge captured — $614.61" },
    ...feeRows(b2),
    { type: "hauler_payout", amountCents: -b2.haulerPayoutCents, description: "Hauler payout released to Central FL Waste Services." },
  ]);
  await addEvents(o2.id, [
    { from: "quote", to: "booked", actorId: bob.id, actorRole: "client", note: "Payment authorized — $614.61 held in escrow.", at: daysAgo(19) },
    { from: "booked", to: "accepted", actorId: cfl.id, actorRole: "provider", note: "Central FL Waste accepted the job.", at: hoursAfter(daysAgo(19), 5) },
    { from: "accepted", to: "dispatched", actorId: cfl.id, actorRole: "provider", note: "Driver dispatched with 30-yard roll-off.", at: hoursAfter(daysAgo(16), -2) },
    { from: "dispatched", to: "delivered", actorId: cfl.id, actorRole: "provider", note: "Delivered with photo proof.", at: hoursAfter(daysAgo(16), 1) },
    { from: "delivered", to: "in_service", actorId: cfl.id, actorRole: "provider", note: "Container in service at jobsite.", at: hoursAfter(daysAgo(16), 2) },
    { from: "in_service", to: "pickup_scheduled", actorId: bob.id, actorRole: "client", note: "Contractor requested pickup.", at: hoursAfter(daysAgo(9), 8) },
    { from: "pickup_scheduled", to: "picked_up", actorId: cfl.id, actorRole: "provider", note: "Picked up with photo proof.", at: hoursAfter(daysAgo(8), 11) },
    { from: "picked_up", to: "completed", actorId: cfl.id, actorRole: "provider", note: "Escrow released to hauler.", at: hoursAfter(daysAgo(8), 13) },
    { from: "completed", to: "reviewed", actorId: bob.id, actorRole: "client", note: "Customer submitted a 4-star review.", at: hoursAfter(daysAgo(8), 26) },
  ]);
  await db.review.create({
    data: { orderId: o2.id, clientId: bob.id, providerId: cfl.id, listingId: listingsByKey["roll_off_30-cfl"], rating: 4, title: "Solid hauler, slight delay", body: "Delivery ran about two hours late but the crew was professional and the 30-yarder swallowed a whole-house cleanout." },
  });
  await db.evidencePhoto.createMany({
    data: [
      { orderId: o2.id, kind: "delivery", url: pic("odump-ev-del-1002"), caption: "30-yarder placed at jobsite", uploadedById: cfl.id },
      { orderId: o2.id, kind: "pickup", url: pic("odump-ev-pick-1002"), caption: "Picked up, site swept", uploadedById: cfl.id },
    ],
  });
  await db.payout.create({
    data: { providerId: cfl.id, orderId: o2.id, amountCents: b2.haulerPayoutCents, status: "paid", stripeTransferId: "tr_demo_1002", paidAt: hoursAfter(daysAgo(8), 15) },
  });

  // 3) delivered — Maria × Sunshine 10yd $295 (payment captured, escrow held)
  const b3 = calculateFees(29500);
  const o3 = await db.order.create({
    data: {
      orderNumber: "OD-2026-1003",
      clientId: maria.id, listingId: listingsByKey["roll_off_10-sunshine"], providerId: sunshine.id,
      feeScheduleId: feeSchedule.id,
      status: "delivered", paymentStatus: "captured", escrowStatus: "held",
      rentalSubtotalCents: b3.rentalSubtotalCents, bookingFeeCents: b3.bookingFeeCents,
      droppingFeeCents: b3.droppingFeeCents, processingFeeCents: b3.processingFeeCents,
      takeRateCents: b3.takeRateCents, grandTotalCents: b3.grandTotalCents,
      haulerPayoutCents: b3.haulerPayoutCents,
      deliveryAddress: "1234 Lakeview Ave", deliveryCity: "Orlando", deliveryState: "FL", deliveryZip: "32803",
      deliveryLat: 28.545, deliveryLng: -81.375,
      placementNotes: "Same spot as last time", projectType: "Garage cleanout", materialType: "Household junk",
      deliveryDate: daysAgo(1), deliveryWindow: "8am–12pm",
      cancellationPolicyAcceptedAt: daysAgo(4), cancellationPolicyVersion: 1,
      acceptedAt: hoursAfter(daysAgo(4), 2), dispatchedAt: hoursAfter(daysAgo(1), -4),
      deliveredAt: hoursAfter(daysAgo(1), 1),
      stripePaymentIntentId: "pi_demo_1003", stripeChargeId: "ch_demo_1003",
    },
  });
  await addLedger("OD-2026-1003", o3.id, [
    { type: "charge_captured", amountCents: b3.grandTotalCents, description: "Customer charge captured on delivery — $353.25" },
    ...feeRows(b3),
  ]);
  await addEvents(o3.id, [
    { from: "quote", to: "booked", actorId: maria.id, actorRole: "client", note: "Payment authorized — $353.25 held in escrow.", at: daysAgo(4) },
    { from: "booked", to: "accepted", actorId: sunshine.id, actorRole: "provider", note: "Sunshine Hauling accepted the job.", at: hoursAfter(daysAgo(4), 2) },
    { from: "accepted", to: "dispatched", actorId: sunshine.id, actorRole: "provider", note: "Driver dispatched with 10-yard roll-off.", at: hoursAfter(daysAgo(1), -4) },
    { from: "dispatched", to: "delivered", actorId: sunshine.id, actorRole: "provider", note: "Delivered with photo proof.", at: hoursAfter(daysAgo(1), 1) },
  ]);
  await db.evidencePhoto.create({
    data: { orderId: o3.id, kind: "delivery", url: pic("odump-ev-del-1003"), caption: "10-yarder in driveway", uploadedById: sunshine.id },
  });

  // 4) in_service — Bob × Rapid 15yd $359 (payment captured, escrow held)
  const b4 = calculateFees(35900);
  const o4 = await db.order.create({
    data: {
      orderNumber: "OD-2026-1004",
      clientId: bob.id, listingId: listingsByKey["roll_off_15-rapid"], providerId: rapid.id,
      feeScheduleId: feeSchedule.id,
      status: "in_service", paymentStatus: "captured", escrowStatus: "held",
      rentalSubtotalCents: b4.rentalSubtotalCents, bookingFeeCents: b4.bookingFeeCents,
      droppingFeeCents: b4.droppingFeeCents, processingFeeCents: b4.processingFeeCents,
      takeRateCents: b4.takeRateCents, grandTotalCents: b4.grandTotalCents,
      haulerPayoutCents: b4.haulerPayoutCents,
      deliveryAddress: "200 Jobsite Blvd", deliveryCity: "Orlando", deliveryState: "FL", deliveryZip: "32819",
      deliveryLat: 28.52, deliveryLng: -81.43,
      placementNotes: "Rear of property", projectType: "Roofing tear-off", materialType: "Shingles",
      deliveryDate: daysAgo(2), deliveryWindow: "8am–12pm",
      cancellationPolicyAcceptedAt: daysAgo(6), cancellationPolicyVersion: 1,
      acceptedAt: hoursAfter(daysAgo(6), 6), dispatchedAt: hoursAfter(daysAgo(2), -5),
      deliveredAt: hoursAfter(daysAgo(2), 2),
      stripePaymentIntentId: "pi_demo_1004", stripeChargeId: "ch_demo_1004",
    },
  });
  await addLedger("OD-2026-1004", o4.id, [
    { type: "charge_captured", amountCents: b4.grandTotalCents, description: "Customer charge captured on delivery — $419.10" },
    ...feeRows(b4),
  ]);
  await addEvents(o4.id, [
    { from: "quote", to: "booked", actorId: bob.id, actorRole: "client", note: "Payment authorized — $419.10 held in escrow.", at: daysAgo(6) },
    { from: "booked", to: "accepted", actorId: rapid.id, actorRole: "provider", note: "Rapid Roll-Offs accepted the job.", at: hoursAfter(daysAgo(6), 6) },
    { from: "accepted", to: "dispatched", actorId: rapid.id, actorRole: "provider", note: "Driver dispatched with 15-yard roll-off.", at: hoursAfter(daysAgo(2), -5) },
    { from: "dispatched", to: "delivered", actorId: rapid.id, actorRole: "provider", note: "Delivered with photo proof.", at: hoursAfter(daysAgo(2), 2) },
    { from: "delivered", to: "in_service", actorId: rapid.id, actorRole: "provider", note: "Container in service at jobsite.", at: hoursAfter(daysAgo(2), 3) },
  ]);
  await db.evidencePhoto.create({
    data: { orderId: o4.id, kind: "delivery", url: pic("odump-ev-del-1004"), caption: "15-yarder at rear of property", uploadedById: rapid.id },
  });

  // 5) booked — Maria × Central FL Waste recycling 20yd $375 (escrow held, not yet accepted)
  const b5 = calculateFees(37500);
  const o5 = await db.order.create({
    data: {
      orderNumber: "OD-2026-1005",
      clientId: maria.id, listingId: listingsByKey["recycling-cfl"], providerId: cfl.id,
      feeScheduleId: feeSchedule.id,
      status: "booked", paymentStatus: "authorized", escrowStatus: "held",
      rentalSubtotalCents: b5.rentalSubtotalCents, bookingFeeCents: b5.bookingFeeCents,
      droppingFeeCents: b5.droppingFeeCents, processingFeeCents: b5.processingFeeCents,
      takeRateCents: b5.takeRateCents, grandTotalCents: b5.grandTotalCents,
      haulerPayoutCents: b5.haulerPayoutCents,
      deliveryAddress: "1234 Lakeview Ave", deliveryCity: "Orlando", deliveryState: "FL", deliveryZip: "32803",
      deliveryLat: 28.545, deliveryLng: -81.375,
      placementNotes: "Office cleanout", projectType: "Office cleanout", materialType: "Cardboard & paper",
      deliveryDate: daysFromNow(5), deliveryWindow: "12pm–4pm",
      cancellationPolicyAcceptedAt: daysAgo(1), cancellationPolicyVersion: 1,
      stripePaymentIntentId: "pi_demo_1005",
    },
  });
  await addLedger("OD-2026-1005", o5.id, [
    { type: "charge_authorized", amountCents: b5.grandTotalCents, description: "Customer payment authorized — $445.57 held in escrow" },
  ]);
  await addEvents(o5.id, [
    { from: "quote", to: "booked", actorId: maria.id, actorRole: "client", note: "Payment authorized — $445.57 held in escrow.", at: daysAgo(1) },
  ]);

  // 6) disputed — Bob × Sunshine C&D 20yd $469 (disputed from delivered)
  const b6 = calculateFees(46900);
  const o6 = await db.order.create({
    data: {
      orderNumber: "OD-2026-1006",
      clientId: bob.id, listingId: listingsByKey["construction_debris-sunshine"], providerId: sunshine.id,
      feeScheduleId: feeSchedule.id,
      status: "disputed", paymentStatus: "captured", escrowStatus: "held_dispute",
      rentalSubtotalCents: b6.rentalSubtotalCents, bookingFeeCents: b6.bookingFeeCents,
      droppingFeeCents: b6.droppingFeeCents, processingFeeCents: b6.processingFeeCents,
      takeRateCents: b6.takeRateCents, grandTotalCents: b6.grandTotalCents,
      haulerPayoutCents: b6.haulerPayoutCents,
      deliveryAddress: "200 Jobsite Blvd", deliveryCity: "Orlando", deliveryState: "FL", deliveryZip: "32819",
      deliveryLat: 28.52, deliveryLng: -81.43,
      placementNotes: "Front lot", projectType: "Bathroom remodel", materialType: "Construction debris",
      deliveryDate: daysAgo(4), deliveryWindow: "8am–12pm",
      cancellationPolicyAcceptedAt: daysAgo(8), cancellationPolicyVersion: 1,
      acceptedAt: hoursAfter(daysAgo(8), 4), dispatchedAt: hoursAfter(daysAgo(4), -3),
      deliveredAt: hoursAfter(daysAgo(4), 2),
      stripePaymentIntentId: "pi_demo_1006", stripeChargeId: "ch_demo_1006",
    },
  });
  await addLedger("OD-2026-1006", o6.id, [
    { type: "charge_captured", amountCents: b6.grandTotalCents, description: "Customer charge captured on delivery — $531.29" },
    ...feeRows(b6),
    { type: "dispute_hold", amountCents: -b6.haulerPayoutCents, description: "Hauler payout held pending dispute resolution" },
  ]);
  await addEvents(o6.id, [
    { from: "quote", to: "booked", actorId: bob.id, actorRole: "client", note: "Payment authorized — $531.29 held in escrow.", at: daysAgo(8) },
    { from: "booked", to: "accepted", actorId: sunshine.id, actorRole: "provider", note: "Sunshine Hauling accepted the job.", at: hoursAfter(daysAgo(8), 4) },
    { from: "accepted", to: "dispatched", actorId: sunshine.id, actorRole: "provider", note: "Driver dispatched.", at: hoursAfter(daysAgo(4), -3) },
    { from: "dispatched", to: "delivered", actorId: sunshine.id, actorRole: "provider", note: "Delivered with photo proof.", at: hoursAfter(daysAgo(4), 2) },
    { from: "delivered", to: "disputed", actorId: bob.id, actorRole: "client", note: "Customer disputes an overweight charge; payout held.", at: hoursAfter(daysAgo(3), 10) },
  ]);
  await db.dispute.create({
    data: {
      orderId: o6.id,
      raisedById: bob.id,
      fromStatus: "delivered",
      reason: "Overweight charge disputed",
      description: "Customer claims the container was not overweight; requests weight-ticket evidence from the hauler.",
      amountCents: 7500,
      status: "open",
      slaDueAt: hoursAfter(daysAgo(3), 10 + 72),
    },
  });
  await db.evidencePhoto.create({
    data: { orderId: o6.id, kind: "delivery", url: pic("odump-ev-del-1006"), caption: "Container delivered to front lot", uploadedById: sunshine.id },
  });

  // 7) cancelled — Maria × Central FL Waste 30yd $549, cancelled 72h before delivery (full rental refund; fees NOT refunded)
  const b7 = calculateFees(54900);
  const o7 = await db.order.create({
    data: {
      orderNumber: "OD-2026-1007",
      clientId: maria.id, listingId: listingsByKey["roll_off_30-cfl"], providerId: cfl.id,
      feeScheduleId: feeSchedule.id,
      status: "cancelled", paymentStatus: "partially_refunded", escrowStatus: "released",
      rentalSubtotalCents: b7.rentalSubtotalCents, bookingFeeCents: b7.bookingFeeCents,
      droppingFeeCents: b7.droppingFeeCents, processingFeeCents: b7.processingFeeCents,
      takeRateCents: b7.takeRateCents, grandTotalCents: b7.grandTotalCents,
      haulerPayoutCents: b7.haulerPayoutCents,
      refundedRentalCents: b7.rentalSubtotalCents, // full rental refund (>48h)
      deliveryAddress: "1234 Lakeview Ave", deliveryCity: "Orlando", deliveryState: "FL", deliveryZip: "32803",
      deliveryLat: 28.545, deliveryLng: -81.375,
      projectType: "Estate cleanout", materialType: "Mixed debris",
      deliveryDate: daysFromNow(6), deliveryWindow: "8am–12pm",
      cancellationPolicyAcceptedAt: daysAgo(2), cancellationPolicyVersion: 1,
      acceptedAt: hoursAfter(daysAgo(2), 4),
      cancelledAt: daysAgo(1), // 7 days before delivery → 168h > 48h → full rental refund
      stripePaymentIntentId: "pi_demo_1007", stripeChargeId: "ch_demo_1007",
    },
  });
  await addLedger("OD-2026-1007", o7.id, [
    { type: "charge_captured", amountCents: b7.grandTotalCents, description: "Customer charge captured — $614.61" },
    ...feeRows(b7), // fees kept: NEVER refunded
    { type: "rental_refund", amountCents: -b7.rentalSubtotalCents, description: "Rental refunded in full (cancelled >48h before delivery). Booking, drop-off, and processing fees are non-refundable and were retained." },
  ]);
  await addEvents(o7.id, [
    { from: "quote", to: "booked", actorId: maria.id, actorRole: "client", note: "Payment authorized — $614.61 held in escrow.", at: daysAgo(2) },
    { from: "booked", to: "accepted", actorId: cfl.id, actorRole: "provider", note: "Central FL Waste accepted the job.", at: hoursAfter(daysAgo(2), 4) },
    { from: "accepted", to: "cancelled", actorId: maria.id, actorRole: "client", note: "Cancelled 7 days before delivery — rental refunded in full; platform fees retained per policy.", at: daysAgo(1) },
  ]);

  console.log("7 orders created: 2 reviewed, 1 delivered, 1 in_service, 1 booked, 1 disputed, 1 cancelled");

  // ── Ad campaigns ──────────────────────────────────────────────────────
  const camp1 = await db.adCampaign.create({
    data: {
      ownerId: sunshine.id,
      listingId: listingsByKey["roll_off_20-sunshine"],
      placementId: sponsored.id,
      title: "Sunshine Hauling — 20-Yard Roll-Off, Same-Week Delivery",
      imageUrl: pic("odump5"),
      targetUrl: "/listings",
      startsAt: daysAgo(1), endsAt: daysFromNow(6),
      status: "active", paidAt: daysAgo(1),
      impressions: 48, clicks: 9,
      stripeCheckoutSessionId: "cs_demo_ad_1", stripePaymentIntentId: "pi_demo_ad_1",
    },
  });
  const camp1Events: { type: string; createdAt: Date }[] = [];
  for (let i = 0; i < 48; i++) camp1Events.push({ type: "impression", createdAt: hoursAfter(daysAgo(1), i * 0.4) });
  for (let i = 0; i < 9; i++) camp1Events.push({ type: "click", createdAt: hoursAfter(daysAgo(1), i * 2 + 1) });
  await db.adEvent.createMany({ data: camp1Events.map((e) => ({ campaignId: camp1.id, ...e })) });
  const inv1 = await db.adInvoice.create({
    data: { campaignId: camp1.id, amountCents: 4900, currency: "usd", stripePaymentIntentId: "pi_demo_ad_1", status: "paid" },
  });
  await addLedger("AD-1001", null, [
    { type: "ad_revenue", amountCents: 4900, description: "Ad revenue — sponsored_search campaign (non-refundable)" },
  ], inv1.id);

  const camp2 = await db.adCampaign.create({
    data: {
      ownerId: fleetOwner.id,
      listingId: null,
      placementId: homepage.id,
      title: "Orlando Fleet Holdings — Containers for Lease",
      imageUrl: pic("odump-fleet"),
      targetUrl: "/fleet",
      startsAt: daysAgo(2), endsAt: daysFromNow(5),
      status: "active", paidAt: daysAgo(2),
      impressions: 30, clicks: 5,
      stripeCheckoutSessionId: "cs_demo_ad_2", stripePaymentIntentId: "pi_demo_ad_2",
    },
  });
  const camp2Events: { type: string; createdAt: Date }[] = [];
  for (let i = 0; i < 30; i++) camp2Events.push({ type: "impression", createdAt: hoursAfter(daysAgo(2), i * 0.8) });
  for (let i = 0; i < 5; i++) camp2Events.push({ type: "click", createdAt: hoursAfter(daysAgo(2), i * 4 + 2) });
  await db.adEvent.createMany({ data: camp2Events.map((e) => ({ campaignId: camp2.id, ...e })) });
  const inv2 = await db.adInvoice.create({
    data: { campaignId: camp2.id, amountCents: 9900, currency: "usd", stripePaymentIntentId: "pi_demo_ad_2", status: "paid" },
  });
  await addLedger("AD-1002", null, [
    { type: "ad_revenue", amountCents: 9900, description: "Ad revenue — homepage_feature campaign (non-refundable)" },
  ], inv2.id);
  console.log("2 active AdCampaigns created (sponsored_search + homepage_feature) with events, invoices, ad_revenue ledger rows");

  // ── Notifications ─────────────────────────────────────────────────────
  await db.notification.createMany({
    data: [
      { userId: maria.id, title: "Order OD-2026-1003 delivered", body: "Your 10-yard dumpster was delivered with photo proof.", link: "/orders/OD-2026-1003", createdAt: hoursAfter(daysAgo(1), 1) },
      { userId: maria.id, title: "How was your rental?", body: "Rate Sunshine Hauling for order OD-2026-1001.", link: "/orders/OD-2026-1001", readAt: daysAgo(19) },
      { userId: maria.id, title: "Refund processed — OD-2026-1007", body: "Your $549.00 rental refund was issued. Booking, drop-off, and processing fees are non-refundable per policy.", link: "/orders/OD-2026-1007", createdAt: daysAgo(1) },
      { userId: bob.id, title: "Pickup scheduled — OD-2026-1004", body: "Your hauler will pick up the 15-yard container tomorrow.", link: "/orders/OD-2026-1004", createdAt: daysAgo(1) },
      { userId: bob.id, title: "Dispute opened — OD-2026-1006", body: "Your dispute is under review. Our team responds within 72 hours.", link: "/orders/OD-2026-1006", createdAt: hoursAfter(daysAgo(3), 10) },
      { userId: sunshine.id, title: "New booking — OD-2026-1003", body: "Maria Santos booked your 10-yard roll-off. Accept within 4 hours.", link: "/provider/orders", createdAt: daysAgo(4) },
      { userId: sunshine.id, title: "Payout on the way — $391.00", body: "Escrow released for order OD-2026-1001.", link: "/provider/payouts", createdAt: hoursAfter(daysAgo(20), 14) },
      { userId: cfl.id, title: "New booking — OD-2026-1005", body: "Maria Santos booked your 20-yard recycling dumpster.", link: "/provider/orders", createdAt: daysAgo(1) },
      { userId: rapid.id, title: "Complete verification to go live", body: "Upload your insurance certificate to finish provider verification.", link: "/provider/verification", createdAt: daysAgo(10) },
      { userId: admin.id, title: "Dispute opened — OD-2026-1006", body: "Overweight charge dispute requires review (72h SLA).", link: "/admin/disputes", createdAt: hoursAfter(daysAgo(3), 10) },
      { userId: admin.id, title: "Provider verification pending", body: "Rapid Roll-Offs LLC is awaiting insurance review.", link: "/admin/verification", createdAt: daysAgo(9) },
      { userId: fleetOwner.id, title: "Ad campaign live", body: "Your homepage feature is live through next week (30 impressions, 5 clicks so far).", link: "/fleet/promote", createdAt: daysAgo(2) },
    ],
  });
  console.log("12 notifications created");

  // ── Summary ───────────────────────────────────────────────────────────
  console.log("\nSeed complete. Demo logins (password for all):");
  console.table([
    { email: "admin@onsitedumpsters.example", role: "admin", name: "Marketplace Owner", password: DEMO_PASSWORD },
    { email: "maria.client@example.com", role: "client", name: "Maria Santos", password: DEMO_PASSWORD },
    { email: "contractor.bob@example.com", role: "client", name: "Bob's Remodeling", password: DEMO_PASSWORD },
    { email: "sunshine.hauling@example.com", role: "provider", name: "Sunshine Hauling Co. (approved)", password: DEMO_PASSWORD },
    { email: "cfl.waste@example.com", role: "provider", name: "Central FL Waste Services (approved)", password: DEMO_PASSWORD },
    { email: "rapid.rolloff@example.com", role: "provider", name: "Rapid Roll-Offs LLC (pending)", password: DEMO_PASSWORD },
    { email: "fleet.owner@example.com", role: "fleet_owner", name: "Orlando Fleet Holdings", password: DEMO_PASSWORD },
  ]);
  console.log("Orders: OD-2026-1001/1002 reviewed · 1003 delivered · 1004 in_service · 1005 booked · 1006 disputed · 1007 cancelled");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
