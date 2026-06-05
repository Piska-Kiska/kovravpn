// src/lib/ratelimit.ts
import { redis } from "./redis";
import { randomBytes, randomInt } from "crypto";

/** Rate limiter using Redis INCR */
export async function rateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  const redisKey = `rl:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, windowSeconds);

  if (count > maxRequests) {
    const ttl = await redis.ttl(redisKey);
    return { ok: false, remaining: 0, retryAfter: ttl > 0 ? ttl : windowSeconds };
  }
  return { ok: true, remaining: maxRequests - count, retryAfter: 0 };
}

/** Get client IP */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/** Cryptographically secure 6-digit code */
export function secureCode6(): string {
  return String(randomInt(100000, 999999));
}

/** Cryptographically secure 6-char alphanumeric code */
export function secureCodeAlpha(): string {
  return randomBytes(4).toString("hex").substring(0, 6).toUpperCase();
}

/**
 * Redis mutex lock. Returns unlock function or null if lock failed.
 * Prevents race conditions on balance operations.
 */
export async function acquireLock(
  key: string,
  ttlSeconds = 10
): Promise<(() => Promise<void>) | null> {
  const lockKey = `lock:${key}`;
  const token = randomBytes(8).toString("hex");

  // SET NX EX — atomic
  const result = await redis.set(lockKey, token, { nx: true, ex: ttlSeconds });
  if (!result) return null; // Lock held by another process

  return async () => {
    // Only delete if we still own the lock
    const current = await redis.get(lockKey);
    if (current === token) await redis.del(lockKey);
  };
}

interface RateLimitWindowResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets. */
  resetIn: number;
}

/**
 * Variant of rateLimit() returning `allowed/remaining/resetIn` (used by
 * Enot top-up flow). Lives in this file so all rate-limit logic stays
 * together. Internally identical to rateLimit().
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitWindowResult> {
  const fullKey = `rl:${key}`;
  const count = await redis.incr(fullKey);
  if (count === 1) {
    await redis.expire(fullKey, windowSeconds);
  }
  const ttl = await redis.ttl(fullKey);
  const resetIn = typeof ttl === "number" && ttl > 0 ? ttl : windowSeconds;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetIn,
  };
}
