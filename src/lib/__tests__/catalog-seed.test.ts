import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    listing: { count: vi.fn() },
    feeSchedule: { findFirst: vi.fn(), create: vi.fn() },
    user: { upsert: vi.fn() },
    providerProfile: { upsert: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { assertCatalogSeedAllowed, seedCatalog, DEMO_PROVIDER_EMAIL } from "@/lib/catalog-seed";

describe("catalog seed guard", () => {
  beforeEach(() => {
    delete process.env.ALLOW_CATALOG_SEED;
    vi.clearAllMocks();
  });

  it("refuses to run without ALLOW_CATALOG_SEED=true", () => {
    expect(() => assertCatalogSeedAllowed()).toThrow(/disabled/);
  });

  it("seedCatalog throws when the flag is missing (never touches the DB)", async () => {
    await expect(seedCatalog()).rejects.toThrow(/disabled/);
    expect(db.listing.count).not.toHaveBeenCalled();
  });

  it("skips idempotently when demo listings already exist", async () => {
    process.env.ALLOW_CATALOG_SEED = "true";
    vi.mocked(db.listing.count).mockResolvedValue(12);
    const res = await seedCatalog();
    expect(res.skipped).toBe(true);
    expect(res.reason).toMatch(/already present/);
    expect(db.user.upsert).not.toHaveBeenCalled();
    expect(DEMO_PROVIDER_EMAIL).toContain("example");
  });
});
