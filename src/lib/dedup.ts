// src/lib/dedup.ts
//
// Atomic deduplication helper for webhook processing.
//
// Why this exists: webhook providers (Enot, YooKassa, NOWPayments) retry
// failed deliveries. The naive GET-then-SET pattern has a race window where
// two concurrent webhooks both see "not done" and both credit the user.
// `redis.set(key, val, { nx: true })` is atomic and gives us a definitive
// answer about who got there first.

import { redis } from "@/lib/redis";

/**
 * Atomically reserve a dedup key.
 *
 * Returns true if THIS call won the race (caller MUST process the event).
 * Returns false if the key was already set (caller MUST skip processing).
 *
 * Usage:
 *   if (!(await reserveDedupKey(`enot_done:${invoiceId}`, 90 * 86400))) {
 *     return NextResponse.json({ ok: true }); // already credited
 *   }
 *   // ... safe to process exactly once ...
 */
export async function reserveDedupKey(
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  // Upstash JS client returns "OK" on success, null when NX condition fails.
  // Treating any truthy return as success keeps us forward-compatible.
  const result = await redis.set(key, "1", { nx: true, ex: ttlSeconds });
  return Boolean(result);
}

/** Release a previously-reserved key (use rarely; mostly for tests). */
export async function releaseDedupKey(key: string): Promise<void> {
  await redis.del(key);
}
