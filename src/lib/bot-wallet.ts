// src/lib/bot-wallet.ts
// Prepaid USD wallet, shared by the bot, the Mini App and the web cabinet
// (unified balance). The site can still charge per purchase (sub_/dev_
// order_ids) without touching it; top-ups (topup_ order_ids) credit it.
//
// Stored as integer CENTS in `balance_usd:{userId}` to avoid float drift.
// The *Cents functions are exact; the *Usd wrappers keep the bot's old API.

import { redis } from "./redis";

const KEY = (userId: string) => `balance_usd:${userId}`;

/** Largest amount one wallet operation may move: $1,000,000 in cents. */
const MAX_OP_CENTS = 100_000_000;

/**
 * Dollars → integer cents, rounded to the nearest cent. Null unless the
 * result is a positive amount within MAX_OP_CENTS.
 */
export function usdToCents(usd: number): number | null {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return null;
  const cents = Math.round(usd * 100);
  return cents > 0 && cents <= MAX_OP_CENTS ? cents : null;
}

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_OP_CENTS) {
    throw new Error(`wallet: invalid cents amount ${cents}`);
  }
}

/** Current balance in integer cents (0 when unset). */
export async function getBalanceCents(userId: string): Promise<number> {
  const raw = await redis.get<number | string>(KEY(userId));
  const n = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isSafeInteger(n) ? n : 0;
}

/** Credit `cents` (> 0). Returns the new balance in cents. */
export async function addBalanceCents(userId: string, cents: number): Promise<number> {
  assertCents(cents);
  return redis.incrby(KEY(userId), cents);
}

export type ChargeResult = { ok: true; balanceCents: number } | { ok: false; balanceCents: number };

/**
 * Atomically charge `cents` (> 0). Concurrency-safe on its own: an atomic
 * INCRBY decrement plus a compensating rollback on overdraft, so two racing
 * charges can never both go past zero.
 */
export async function chargeBalanceCents(userId: string, cents: number): Promise<ChargeResult> {
  assertCents(cents);
  const after = await redis.incrby(KEY(userId), -cents);
  if (after < 0) {
    const restored = await redis.incrby(KEY(userId), cents); // rollback
    return { ok: false, balanceCents: restored };
  }
  return { ok: true, balanceCents: after };
}

/** Current balance in USD (dollars). */
export async function getBalanceUsd(userId: string): Promise<number> {
  return (await getBalanceCents(userId)) / 100;
}

/** Credit balance. `usd` rounded to cents. Returns new USD balance. */
export async function addBalanceUsd(userId: string, usd: number): Promise<number> {
  const cents = usdToCents(usd);
  if (cents === null) return getBalanceUsd(userId);
  return (await addBalanceCents(userId, cents)) / 100;
}

/** Atomically charge `usd`. Returns true if charged, false if insufficient. */
export async function chargeBalanceUsd(userId: string, usd: number): Promise<boolean> {
  const cents = usdToCents(usd);
  if (cents === null) return false;
  return (await chargeBalanceCents(userId, cents)).ok;
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
