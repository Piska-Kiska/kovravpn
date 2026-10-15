// src/lib/code-attempts.ts
//
// One try at a one-time e-mail code (password reset, sign-up, linking an
// address), counted BEFORE the code is compared.
//
// Audit 15.10.2026, item 1. The three routes compared the code first and
// counted only the wrong answers afterwards. Requests sent in parallel all
// read the live code before any of them reached the counter, so a burst made
// far more than five comparisons, and a right guess among them went through
// even when the counter was already past the limit. INCR is atomic: taken
// first, it hands out exactly `max` comparisons per code however the requests
// overlap.
//
// The counter belongs to one issued code (attemptsKeyFor) and is never
// deleted, only left to expire. Deleting it when the code burns would hand
// fresh tries to requests of the same burst that had already read the code;
// a new code gets a new counter by itself.

import { createHash } from "crypto";
import { redis } from "./redis";

/** Wrong answers a code survives before it is burned. */
export const MAX_CODE_ATTEMPTS = 5;
/** The codes' own lifetime: a counter must not outlive its code. */
export const CODE_TTL_SEC = 600;

/**
 * The attempts counter of one issued code: `<codeKey>:attempts:<digest>`,
 * where the digest is taken over the key and the code. A newly issued code
 * under the same `codeKey` starts from zero; the old one keeps its count.
 */
export function attemptsKeyFor(codeKey: string, issuedCode: unknown): string {
  const digest = createHash("sha256").update(`${codeKey}\n${String(issuedCode)}`).digest("hex").slice(0, 16);
  return `${codeKey}:attempts:${digest}`;
}

export interface CodeAttempt {
  /** False: this try is past the limit; do not compare, burn the code. */
  allowed: boolean;
  /** True: this is the last allowed try; a wrong answer burns the code. */
  last: boolean;
}

/**
 * Takes one try from `attemptsKey`. The counter lives as long as the code
 * (`ttlSec`), so it never outlives it; the first try sets that expiry.
 *
 * A counter left without expiry (the EXPIRE call lost after the INCR) gets
 * one on the next try instead of counting forever.
 */
export async function takeCodeAttempt(
  attemptsKey: string,
  max: number = MAX_CODE_ATTEMPTS,
  ttlSec: number = CODE_TTL_SEC,
): Promise<CodeAttempt> {
  if (!Number.isInteger(max) || max < 1) throw new Error("takeCodeAttempt: max must be a positive integer");
  const count = Number(await redis.incr(attemptsKey)) || 0;
  if (count === 1) {
    await redis.expire(attemptsKey, ttlSec);
  } else if ((await redis.ttl(attemptsKey)) === -1) {
    await redis.expire(attemptsKey, ttlSec);
  }
  return { allowed: count >= 1 && count <= max, last: count >= max };
}
