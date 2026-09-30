// src/lib/admin-wallet.ts
//
// The admin bot's «💰 Изменить баланс» on the REAL wallet.
//
// 30.09.2026 the owner credited a user from the admin bot and nothing arrived:
// the admin tool still edited `account.balance`, the old rouble field that
// nothing reads since the unified wallet (audit finding KM-08). Money lives in
// `balance_usd:{userId}` as integer cents (lib/bot-wallet.ts), and the bot,
// the Mini App and the web cabinet all spend it from there.
//
// The change runs under the same lock as a wallet purchase
// (`lock:wallet:{userId}`, lib/wallet-purchase.ts), so an admin «=N» cannot
// interleave with a purchase and silently undo it. Every change is written to
// an audit list `wallet_admin_log:{userId}` (last 50, 180 days).

import { addBalanceCents, chargeBalanceCents, getBalanceCents } from "./bot-wallet";
import { acquireLock } from "./ratelimit";
import { redis } from "./redis";

/** Largest amount one admin change may move or set: $10,000. */
export const ADMIN_MAX_CENTS = 1_000_000;
const LOCK_TTL_SEC = 15;
const LOG_KEEP = 50;
const LOG_TTL_SEC = 180 * 24 * 3600;

export type AdminWalletOp = { readonly op: "+" | "-" | "="; readonly cents: number };

/**
 * Parses «+10», «-5.50», «=0», «+ $25», «=12,5» into an operation in cents.
 * A sign is required, so a stray number typed into the chat is never taken
 * as a credit. Null when the input is not one of these or is out of range.
 */
export function parseAdminWalletInput(raw: string): AdminWalletOp | null {
  if (typeof raw !== "string") return null;
  const m = /^([+\-=])\s*\$?\s*(\d{1,7}(?:[.,]\d{1,2})?)\s*\$?$/.exec(raw.trim());
  if (!m) return null;
  const op = m[1] as AdminWalletOp["op"];
  const cents = Math.round(Number(m[2].replace(",", ".")) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > ADMIN_MAX_CENTS) return null;
  if (op !== "=" && cents === 0) return null;
  return { op, cents };
}

export type AdminWalletResult =
  | { readonly ok: true; readonly beforeCents: number; readonly afterCents: number }
  | { readonly ok: false; readonly reason: "busy" | "error" };

/** Formats integer cents as «$12.50». */
export function formatUsdCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Applies the operation to `balance_usd:{userId}`. «-N» larger than the
 * balance empties it (never below zero); «=N» moves the balance to N by one
 * credit or one charge. `adminId` goes to the audit record.
 */
export async function applyAdminWalletChange(
  userId: string,
  change: AdminWalletOp,
  adminId: string,
): Promise<AdminWalletResult> {
  const unlock = await acquireLock(`wallet:${userId}`, LOCK_TTL_SEC);
  if (!unlock) return { ok: false, reason: "busy" };
  try {
    const beforeCents = await getBalanceCents(userId);
    let target: number;
    if (change.op === "+") target = beforeCents + change.cents;
    else if (change.op === "-") target = Math.max(0, beforeCents - change.cents);
    else target = change.cents;

    let afterCents = beforeCents;
    const delta = target - beforeCents;
    if (delta > 0) {
      afterCents = await addBalanceCents(userId, delta);
    } else if (delta < 0) {
      const r = await chargeBalanceCents(userId, -delta);
      if (!r.ok) return { ok: false, reason: "error" };
      afterCents = r.balanceCents;
    }

    const record = JSON.stringify({ at: Date.now(), by: adminId, op: change.op, cents: change.cents, beforeCents, afterCents });
    const key = `wallet_admin_log:${userId}`;
    try {
      await redis.lpush(key, record);
      await redis.ltrim(key, 0, LOG_KEEP - 1);
      await redis.expire(key, LOG_TTL_SEC);
    } catch (err) {
      console.error("[admin-wallet] audit record not written:", err);
    }
    console.log(`[admin-wallet] ${userId} ${change.op}${change.cents}c: ${beforeCents} -> ${afterCents}`);
    return { ok: true, beforeCents, afterCents };
  } catch (err) {
    console.error("[admin-wallet] change failed:", err);
    return { ok: false, reason: "error" };
  } finally {
    await unlock();
  }
}
