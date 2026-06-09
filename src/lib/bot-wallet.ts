// src/lib/bot-wallet.ts
// Bot-only prepaid USD wallet. Independent of the site: the site charges
// crypto per-purchase (sub_/dev_ order_ids) and never touches this balance.
//
// Stored as integer CENTS in `balance_usd:{userId}` to avoid float drift.
// Public API speaks dollars (number).

import { redis } from "./redis";

const KEY = (userId: string) => `balance_usd:${userId}`;

/** Current balance in USD (dollars). */
export async function getBalanceUsd(userId: string): Promise<number> {
  const raw = await redis.get<number | string>(KEY(userId));
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(n) ? n / 100 : 0;
}

/** Credit balance. `usd` rounded to cents. Returns new USD balance. */
export async function addBalanceUsd(userId: string, usd: number): Promise<number> {
  const cents = Math.round(usd * 100);
  if (!Number.isFinite(cents) || cents <= 0) return getBalanceUsd(userId);
  const next = await redis.incrby(KEY(userId), cents);
  return next / 100;
}

/**
 * Atomically charge `usd`. Returns true if charged, false if insufficient.
 * Concurrency-safe: atomic INCRBY decrement + compensating rollback on
 * overdraft (two racing charges can't both succeed past zero).
 */
export async function chargeBalanceUsd(userId: string, usd: number): Promise<boolean> {
  const cents = Math.round(usd * 100);
  if (!Number.isFinite(cents) || cents <= 0) return false;
  const after = await redis.incrby(KEY(userId), -cents);
  if (after < 0) {
    await redis.incrby(KEY(userId), cents); // rollback
    return false;
  }
  return true;
}

/** Bot top-up order_id: topup_<userId>_<ts>. */
export function buildTopupOrderId(userId: string): string {
  return `topup_${userId}_${Date.now()}`;
}

/** Parse topup_<userId>_<ts> (userId may contain underscores). */
export function parseTopupOrderId(
  orderId: string,
): { userId: string; ts: number } | null {
  if (!orderId?.startsWith("topup_")) return null;
  const rest = orderId.slice("topup_".length);
  const lu = rest.lastIndexOf("_");
  if (lu <= 0) return null;
  const userId = rest.slice(0, lu);
  const ts = Number(rest.slice(lu + 1));
  if (!userId || !Number.isFinite(ts)) return null;
  return { userId, ts };
}
