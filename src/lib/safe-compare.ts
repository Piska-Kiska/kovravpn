// src/lib/safe-compare.ts
//
// Constant-time comparison of secrets (webhook secret tokens, internal API
// keys). Both sides are hashed first, so neither the content nor the LENGTH
// of the expected secret leaks through timing, and timingSafeEqual always
// gets two buffers of the same size.

import { createHash, timingSafeEqual } from "crypto";

export function safeEqual(given: string, expected: string): boolean {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  const a = createHash("sha256").update(given, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
