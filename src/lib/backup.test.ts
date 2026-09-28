import { afterEach, describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT_VERSION,
  BACKUP_TABLES,
  BACKUP_TABLE_NAMES,
  STATUS_KEYS,
  checkBackupAuth,
  countSnapshotRows,
  deserializeRow,
  importSnapshot,
  serializeRow,
} from "./backup";

describe("backup serialization", () => {
  it("round-trips dates, arrays, JSON and nulls", () => {
    const row = {
      id: "abc123",
      name: "Test",
      email: null,
      createdAt: new Date("2026-09-28T12:00:00.000Z"),
      tags: ["a", "b"],
      metadata: { nested: [1, 2, { x: true }], note: null },
      count: 42,
      price: 19.99,
      active: true,
    };
    const serialized = serializeRow(row);
    // Dates become ISO strings (Prisma accepts these for DateTime fields)
    expect(serialized.createdAt).toBe("2026-09-28T12:00:00.000Z");
    expect(serialized.tags).toEqual(["a", "b"]);
    expect(serialized.metadata).toEqual({ nested: [1, 2, { x: true }], note: null });
    // JSON round-trips cleanly
    const revived = deserializeRow(JSON.parse(JSON.stringify(serialized)));
    expect(revived.createdAt).toBe("2026-09-28T12:00:00.000Z");
    expect(revived.metadata).toEqual(row.metadata);
    expect(revived.email).toBeNull();
  });

  it("refuses non-finite floats instead of silently corrupting", () => {
    expect(() => serializeRow({ v: Number.NaN })).toThrow();
    expect(() => serializeRow({ v: Number.POSITIVE_INFINITY })).toThrow();
  });

  it("round-trips buffer/bigint markers", () => {
    const row = { b: Buffer.from("hi"), n: BigInt(10) };
    const back = deserializeRow(JSON.parse(JSON.stringify(serializeRow(row))));
    expect((back.b as Buffer).toString()).toBe("hi");
    expect(back.n).toBe(BigInt(10));
  });

  it("does not convert date-like strings into Dates", () => {
    const row = { note: "2026-09-28 is the date" };
    const back = deserializeRow(serializeRow(row));
    expect(back.note).toBe("2026-09-28 is the date");
  });
});

describe("backup table registry", () => {
  it("covers every model in the Prisma schema exactly once", () => {
    const names = BACKUP_TABLES.map((t) => t.table);
    expect(new Set(names).size).toBe(names.length);
    expect(BACKUP_TABLE_NAMES.size).toBe(names.length);
    // 26 models in schema.prisma (25 domain + SystemStatus)
    expect(names.length).toBe(26);
  });

  it("places parents before children (FK-safe order)", () => {
    const idx = (t: string) => BACKUP_TABLES.findIndex((e) => e.table === t);
    expect(idx("User")).toBeLessThan(idx("Order"));
    expect(idx("Listing")).toBeLessThan(idx("Order"));
    expect(idx("Order")).toBeLessThan(idx("LedgerEntry"));
    expect(idx("Order")).toBeLessThan(idx("Review"));
    expect(idx("AdCampaign")).toBeLessThan(idx("AdInvoice"));
    expect(idx("AdInvoice")).toBeLessThan(idx("LedgerEntry"));
  });

  it("status keys match the admin BackupStatusPanel", () => {
    expect(Object.values(STATUS_KEYS)).toContain("backup.status");
    expect(Object.values(STATUS_KEYS)).toContain("backup.last_sha256");
    expect(Object.values(STATUS_KEYS)).toContain("keepalive.db_ok");
    expect(Object.values(STATUS_KEYS)).toContain("restore.last_at");
  });
});

describe("snapshot validation", () => {
  function fakePrisma() {
    return {
      $transaction: async () => {
        throw new Error("should not reach the database");
      },
    };
  }

  it("rejects wrong versions and unknown tables without touching the DB", async () => {
    await expect(
      importSnapshot(fakePrisma() as never, { version: 999, tables: {} }),
    ).rejects.toThrow(/version/i);
    await expect(
      importSnapshot(fakePrisma() as never, {
        version: BACKUP_FORMAT_VERSION,
        tables: { EvilTable: { columns: [], rows: [] } },
      }),
    ).rejects.toThrow(/unknown table/i);
    await expect(importSnapshot(fakePrisma() as never, null)).rejects.toThrow();
  });

  it("counts rows across tables", () => {
    const snap = {
      version: BACKUP_FORMAT_VERSION,
      generator: "test",
      exportedAt: new Date().toISOString(),
      kind: "manual",
      tables: {
        User: { columns: ["id"], rows: [{ id: "1" }, { id: "2" }] },
        Order: { columns: ["id"], rows: [{ id: "a" }] },
      },
    };
    expect(countSnapshotRows(snap)).toBe(3);
  });
});

describe("backup endpoint auth", () => {
  const real = process.env.BACKUP_CRON_SECRET;
  afterEach(() => {
    if (real === undefined) delete process.env.BACKUP_CRON_SECRET;
    else process.env.BACKUP_CRON_SECRET = real;
  });

  const req = (auth: string | null) =>
    new Request("https://x/api/backup/export", {
      headers: auth ? { authorization: auth } : {},
    });

  it("rejects missing/mismatched secrets, accepts the right one", () => {
    process.env.BACKUP_CRON_SECRET = "s3cr3t";
    expect(checkBackupAuth(req(null))).toBe(false);
    expect(checkBackupAuth(req("Bearer wrong"))).toBe(false);
    expect(checkBackupAuth(req("Bearer s3cr3t"))).toBe(true);
    // timing-safe compare must not throw on length mismatch
    expect(checkBackupAuth(req("Bearer short"))).toBe(false);
  });

  it("denies everything when the secret is not configured", () => {
    delete process.env.BACKUP_CRON_SECRET;
    expect(checkBackupAuth(req("Bearer anything"))).toBe(false);
  });
});
