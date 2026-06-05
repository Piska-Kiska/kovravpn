// src/lib/referrals.ts
import { redis } from "./redis";
import { randomBytes } from "crypto";
import { reserveDedupKey } from "./dedup";

const REFERRAL_BONUS = 50;    // ₽ to referrer on referred user's first topup
const MAX_REFERRALS = 30;     // max referrals per account (cap: 30 × 50 = 1500₽)

/** Generate or get existing referral code */
export async function getReferralCode(userId: string): Promise<string> {
  const existing = await redis.get(`ref_code:${userId}`);
  if (existing) return String(existing);
  const code = randomBytes(4).toString("hex");
  await redis.set(`ref_code:${userId}`, code);
  await redis.set(`ref_lookup:${code}`, userId);
  return code;
}

/** Resolve referral code to userId */
export async function resolveReferralCode(code: string): Promise<string | null> {
  const userId = await redis.get(`ref_lookup:${code}`);
  return userId ? String(userId) : null;
}

/** Record referral link (with cap check) */
export async function recordReferral(referrerId: string, referredUserId: string): Promise<boolean> {
  const list = await getReferralList(referrerId);
  if (list.length >= MAX_REFERRALS) return false; // cap reached
  await redis.set(`ref_by:${referredUserId}`, referrerId);
  list.push({ userId: referredUserId, registeredAt: Date.now(), rewarded: false });
  await redis.set(`ref_list:${referrerId}`, JSON.stringify(list));
  return true;
}

export interface ReferralEntry {
  userId: string;
  registeredAt: number;
  rewarded: boolean;
}

export async function getReferralList(userId: string): Promise<ReferralEntry[]> {
  const raw = await redis.get(`ref_list:${userId}`);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : (raw as ReferralEntry[]);
}

export async function getReferrer(userId: string): Promise<string | null> {
  const r = await redis.get(`ref_by:${userId}`);
  return r ? String(r) : null;
}

/**
 * Grant one-time 50₽ bonus to referrer when referred user makes first topup.
 * Returns referrerId and bonus amount if granted.
 *
 * SAFETY: this function is called from THREE webhook handlers (YK, Enot,
 * NOWPayments) and they can theoretically run concurrently for the same
 * referredUserId. Without an atomic guard, a read-modify-write race on
 * `ref_list:<referrer>` can cause double-payout and/or lost referral
 * entries. We bracket the whole operation with a one-shot SET-NX dedup
 * key tied to the referredUserId. The first caller wins, the others
 * see `{ rewarded: false }` immediately.
 */
export async function grantReferralReward(
  referredUserId: string
): Promise<{ rewarded: boolean; referrerId?: string; bonus?: number }> {
  const referrerId = await getReferrer(referredUserId);
  if (!referrerId) return { rewarded: false };

  // Atomic single-shot guard. TTL 1 year is effectively permanent for this
  // purpose (a user can only have a "first topup" once). We don't release
  // it; once granted (or attempted), no concurrent caller proceeds.
  const won = await reserveDedupKey(
    `ref_granted:${referredUserId}`,
    365 * 86400,
  );
  if (!won) return { rewarded: false };

  const list = await getReferralList(referrerId);
  const entry = list.find((e) => e.userId === referredUserId);
  if (!entry || entry.rewarded) {
    // Either no record (shouldn't happen if `recordReferral` was called) or
    // already rewarded by a previous successful run. Leave dedup key set so
    // we never retry.
    return { rewarded: false };
  }

  entry.rewarded = true;
  await redis.set(`ref_list:${referrerId}`, JSON.stringify(list));

  return { rewarded: true, referrerId, bonus: REFERRAL_BONUS };
}

export async function getReferralStats(userId: string): Promise<{
  code: string;
  total: number;
  rewarded: number;
  pending: number;
  maxReferrals: number;
}> {
  const code = await getReferralCode(userId);
  const list = await getReferralList(userId);
  const rewarded = list.filter((e) => e.rewarded).length;
  return { code, total: list.length, rewarded, pending: list.length - rewarded, maxReferrals: MAX_REFERRALS };
}
