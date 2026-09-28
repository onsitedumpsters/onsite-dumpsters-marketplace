// Distributed rate limiter backed by Upstash Redis (REST), with an automatic
// in-memory token-bucket fallback when the Upstash env vars are not set
// (local dev, tests, CI without network).
//
// Set in production (Vercel env):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN
//
// Design notes:
// - Sliding-window counters in Redis are shared across every serverless
//   instance, so the limit is actually enforced in production.
// - If Redis is unreachable at request time we FAIL OPEN (allow the request)
//   and log a warning: rate limiting is defense-in-depth, not an auth gate,
//   and an outage should not take the marketplace down.
// - The in-memory fallback keeps the same token-bucket semantics and the same
//   MAX_BUCKETS bound as before, so behavior without Upstash is unchanged.

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

export interface RateLimitConfig {
  max: number; // max requests
  windowMs: number; // per window
}

export const AUTH_RATE_LIMIT: RateLimitConfig = { max: 10, windowMs: 60_000 };
export const BOOKING_RATE_LIMIT: RateLimitConfig = { max: 30, windowMs: 60_000 };
export const UPLOAD_RATE_LIMIT: RateLimitConfig = { max: 30, windowMs: 60_000 };
export const AD_EVENT_RATE_LIMIT: RateLimitConfig = { max: 120, windowMs: 60_000 };

// ── Backend selection (resolved lazily, once) ────────────────────────────────

let redisClient: Redis | null | undefined; // undefined = not yet resolved

function getRedis(): Redis | null {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    redisClient = new Redis({ url, token });
  } else {
    redisClient = null;
  }
  return redisClient;
}

// One Ratelimit instance per distinct (max, window) config — they are
// inexpensive wrappers around the shared Redis client.
const upstashLimiters = new Map<string, Ratelimit>();

function getUpstashLimiter(config: RateLimitConfig): Ratelimit {
  const cacheKey = `${config.max}:${config.windowMs}`;
  let limiter = upstashLimiters.get(cacheKey);
  if (!limiter) {
    const redis = getRedis();
    if (!redis) throw new Error("Upstash Redis is not configured");
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.max, `${config.windowMs} ms`),
      analytics: true,
      prefix: "od:rl",
    });
    upstashLimiters.set(cacheKey, limiter);
  }
  return limiter;
}

// ── In-memory fallback (same semantics as the pre-Upstash implementation) ────

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

// Bound memory: the key space is per-IP, but a flood of distinct keys (e.g.
// spoofed X-Forwarded-For in front of a misconfigured proxy) must not grow
// the map without limit. Evict the oldest bucket when over capacity — Map
// preserves insertion order, so the first key is the oldest.
const MAX_BUCKETS = 10_000;

function memoryRateLimit(key: string, config: RateLimitConfig): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) {
      const oldest = buckets.keys().next();
      if (!oldest.done) buckets.delete(oldest.value);
    }
    bucket = { tokens: config.max, lastRefill: now };
    buckets.set(key, bucket);
  }
  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor((elapsed / config.windowMs) * config.max);
  if (refill > 0) {
    bucket.tokens = Math.min(config.max, bucket.tokens + refill);
    bucket.lastRefill = now;
  }
  if (bucket.tokens <= 0) {
    buckets.set(key, bucket);
    return { ok: false, retryAfterMs: Math.max(0, config.windowMs - elapsed) };
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return { ok: true, retryAfterMs: 0 };
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function rateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ ok: boolean; retryAfterMs: number }> {
  const redis = getRedis();
  if (!redis) {
    return memoryRateLimit(key, config);
  }
  try {
    const { success, reset } = await getUpstashLimiter(config).limit(key);
    return {
      ok: success,
      retryAfterMs: success ? 0 : Math.max(0, reset - Date.now()),
    };
  } catch (err) {
    // Fail open: a Redis outage must not take the marketplace down.
    console.warn("[rate-limit] Upstash error, failing open:", err instanceof Error ? err.message : err);
    return { ok: true, retryAfterMs: 0 };
  }
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

/** True when the distributed (Upstash) backend is active. Useful for /api/health. */
export function isDistributedRateLimitActive(): boolean {
  return getRedis() !== null;
}
