// src/lib/ratelimit.ts
import { redis } from "./redis";
import { randomBytes, randomInt } from "crypto";
import { rateLimitSubject } from "./client-ip";
import { normalizeEmail } from "./email";

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

/**
 * The per-account sign-in limiter (audit 15.10.2026, item 2): /api/auth/login
 * counts every try at one e-mail's password, a success and /api/auth/reset
 * clear it. Keyed on normalizeEmail, the form registration keys accounts by.
 */
export function loginAccountLimitKey(normalizedEmail: string): string {
  return `login-acct:${normalizedEmail}`;
}

/**
 * Code letters to one mailbox per hour, for each purpose (audit 15.10.2026,
 * item 4). The per-address limits alone let many addresses mail one victim
 * without end, burning the Resend quota and the domain's reputation that
 * sign-up and reset depend on. Keyed on normalizeEmail, so the written forms
 * of one gmail box share the count.
 */
export const MAILS_PER_RECIPIENT = 3;
export const MAIL_RECIPIENT_WINDOW_SEC = 60 * 60;
export type MailPurpose = "register" | "reset" | "link";

/**
 * Takes one letter from the recipient's hourly allowance. Returns null when
 * the letter may go, or the 429 text (lib/server-errors.ts MINUTE_LIMITS
 * translates it in the cabinet).
 */
export async function takeMailToRecipient(purpose: MailPurpose, email: string): Promise<string | null> {
  const rl = await rateLimit(`mail-to:${purpose}:${normalizeEmail(email)}`, MAILS_PER_RECIPIENT, MAIL_RECIPIENT_WINDOW_SEC);
  if (rl.ok) return null;
  const minutes = Math.max(1, Math.ceil(rl.retryAfter / 60));
  return `Слишком много писем на этот адрес. Подождите ${minutes} мин`;
}

/** Forgets a limiter's count (`key` as given to rateLimit), e.g. after a success. */
export async function clearRateLimit(key: string): Promise<void> {
  await redis.del(`rl:${key}`);
}

/**
 * The client's address as rate limits count it.
 *
 * Every caller puts the result into a limiter or anti-abuse key, so since
 * 15.10.2026 an IPv6 address comes back as its /64 network
 * (lib/client-ip.ts rateLimitSubject): with the full address one line had
 * 2^64 buckets. IPv4 is unchanged.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0] : req.headers.get("x-real-ip") || "unknown";
  return rateLimitSubject(ip);
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
  // Letter prefix: an all-digit hex token would come back from Upstash's
  // automatic JSON parsing as a number and never match on release.
  const token = `t${randomBytes(8).toString("hex")}`;

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
