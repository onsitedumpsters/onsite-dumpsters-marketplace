// Launch-market geography + category taxonomy (from the 17-post SEO blog).
// Used by public SEO pages (city/category landing pages with JSON-LD).

export interface CityInfo {
  slug: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  zips: string[];
  phase: 1 | 2 | 3;
  blurb: string;
}

export const LAUNCH_CITY: CityInfo = {
  slug: "orlando-fl",
  name: "Orlando",
  state: "FL",
  lat: 28.5383,
  lng: -81.3792,
  zips: ["32801", "32803", "32804", "32806", "32812", "32817", "32819", "32822", "32826", "32828"],
  phase: 1,
  blurb:
    "Orlando is the launch market for the Onsite Dumpsters marketplace: verified local haulers, total-price booking, and delivery-protected payments.",
};

export const FLORIDA_CITIES: CityInfo[] = [
  LAUNCH_CITY,
  { slug: "kissimmee-fl", name: "Kissimmee", state: "FL", lat: 28.292, lng: -81.4079, zips: ["34741", "34744"], phase: 1, blurb: "Phase 1 Orlando-core coverage: Kissimmee and greater Osceola County." },
  { slug: "winter-park-fl", name: "Winter Park", state: "FL", lat: 28.6, lng: -81.3392, zips: ["32789", "32792"], phase: 1, blurb: "Phase 1 Orlando-core coverage: Winter Park and north Orlando." },
  { slug: "sanford-fl", name: "Sanford", state: "FL", lat: 28.814, lng: -81.3275, zips: ["32771", "32773"], phase: 1, blurb: "Phase 1 Orlando-core coverage: Sanford and Seminole County." },
  { slug: "tampa-fl", name: "Tampa", state: "FL", lat: 27.9506, lng: -82.4572, zips: ["33602", "33607"], phase: 2, blurb: "Phase 2 Central Florida expansion: Tampa Bay (opens after Orlando metrics stabilize)." },
  { slug: "miami-fl", name: "Miami", state: "FL", lat: 25.7617, lng: -80.1918, zips: ["33128", "33132"], phase: 3, blurb: "Phase 3 statewide expansion: Miami-Dade (opens with verified supply only)." },
  { slug: "jacksonville-fl", name: "Jacksonville", state: "FL", lat: 30.3322, lng: -81.6557, zips: ["32202", "32207"], phase: 3, blurb: "Phase 3 statewide expansion: Jacksonville (opens with verified supply only)." },
];

export interface CategoryInfo {
  slug: string;
  code: string; // Prisma Category enum value
  name: string;
  tagline: string;
  sizes: number[];
}

export const CATEGORIES: CategoryInfo[] = [
  { slug: "10-yard-dumpster", code: "roll_off_10", name: "10-Yard Dumpsters", tagline: "Small cleanouts, garage junk, minor remodels.", sizes: [10] },
  { slug: "15-yard-dumpster", code: "roll_off_15", name: "15-Yard Dumpsters", tagline: "Mid-size cleanouts and roofing tear-offs.", sizes: [15] },
  { slug: "20-yard-dumpster", code: "roll_off_20", name: "20-Yard Dumpsters", tagline: "The most popular size: remodels, flooring, yard waste.", sizes: [20] },
  { slug: "30-yard-dumpster", code: "roll_off_30", name: "30-Yard Dumpsters", tagline: "Whole-home cleanouts and construction debris.", sizes: [30] },
  { slug: "40-yard-dumpster", code: "roll_off_40", name: "40-Yard Dumpsters", tagline: "Major construction and commercial projects.", sizes: [40] },
  { slug: "front-load-dumpster", code: "front_load", name: "Front-Load Dumpsters", tagline: "Recurring commercial service, 2–8 yd.", sizes: [2, 4, 6, 8] },
  { slug: "rear-load-dumpster", code: "rear_load", name: "Rear-Load Dumpsters", tagline: "Tight-access commercial routes.", sizes: [2, 4, 6] },
  { slug: "compactors", code: "compactor", name: "Compactors", tagline: "High-volume commercial waste compaction.", sizes: [] },
  { slug: "yard-waste", code: "yard_waste", name: "Yard Waste Dumpsters", tagline: "Storm debris, tree work, landscaping.", sizes: [10, 20, 30] },
  { slug: "construction-debris", code: "construction_debris", name: "Construction Debris (C&D)", tagline: "Job-site debris with heavy-material options.", sizes: [20, 30, 40] },
  { slug: "concrete-only", code: "concrete_only", name: "Concrete-Only Dumpsters", tagline: "Clean concrete, brick, and dirt loads.", sizes: [10, 20] },
  { slug: "recycling", code: "recycling", name: "Recycling Dumpsters", tagline: "Cardboard, metal, and single-stream recycling.", sizes: [20, 30] },
];

export const ORLANDO_PERMIT_RULES = [
  "Dumpsters placed on private property (driveway) in Orlando typically do not require a city permit.",
  "Placement in the public right-of-way (street, sidewalk, alley) generally requires a City of Orlando right-of-way permit — confirm before booking street placement.",
  "HOAs may have their own rules; check your community guidelines for container size and placement duration limits.",
  "Prohibited materials (hazardous waste, tires, batteries, liquids, asbestos) are never permitted in rental dumpsters.",
];

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
