import { describe, expect, it } from "vitest";
import {
  isDistributedRateLimitActive,
  rateLimit,
  type RateLimitConfig,
} from "./rate-limit";

// These tests run WITHOUT Upstash env vars, so they exercise the in-memory
// fallback with its token-bucket semantics.

const cfg: RateLimitConfig = { max: 3, windowMs: 60_000 };

describe("rateLimit (in-memory fallback)", () => {
  it("allows up to max requests, then blocks", async () => {
    const key = `test:${Date.now()}:a`;
    for (let i = 0; i < 3; i++) {
      const r = await rateLimit(key, cfg);
      expect(r.ok).toBe(true);
    }
    const blocked = await rateLimit(key, cfg);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks keys independently", async () => {
    const k1 = `test:${Date.now()}:b1`;
    const k2 = `test:${Date.now()}:b2`;
    for (let i = 0; i < 3; i++) await rateLimit(k1, cfg);
    expect((await rateLimit(k1, cfg)).ok).toBe(false);
    expect((await rateLimit(k2, cfg)).ok).toBe(true);
  });

  it("reports the distributed backend as inactive without env vars", () => {
    expect(isDistributedRateLimitActive()).toBe(false);
  });
});
