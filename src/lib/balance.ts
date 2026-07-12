// src/lib/balance.ts
//
// ⚠️ LEGACY SHIM. The prepaid-balance model is gone; Kovra is subscription-
// based (see subscriptions.ts). This file is kept ONLY so the ~16 modules
// that still `import ... from "@/lib/balance"` keep compiling. Every export
// below is re-expressed in terms of the subscription model.
//
// Behavioural mapping:
//   • "balance"        → no longer money. We surface 0; callers that show
//                        a balance number now show $0 (dashboard is rewritten
//                        to read subscriptions directly, so this only matters
//                        for legacy/bot paths).
//   • daysRemaining    → days until the furthest active subscription expires.
//   • dailyRate        → 0 (no daily burn).
//   • addBalance(n)    → NO-OP for money. Real crediting happens by adding a
//                        subscription in the webhook. Returns the account
//                        unchanged. (Kept so promo/legacy webhooks don't crash.)
//   • canCreateProfile → allowed iff active slots > current profile count.
//   • syncAllExpiry    → sets every profile's 3X-UI expiry to the furthest
//                        active subscription expiry (or now → disabled).
//   • calcExpiry       → furthest active expiry for the user's subs.
//
// New code should import from "@/lib/subscriptions" directly, not from here.

import { redis } from "./redis";
import {
  getAccount,
  getProfiles,
  type UserAccount,
} from "./accounts";
import {
  getSubscriptions,
  summarize,
  maxActiveExpiry,
  activeSlots,
} from "./subscriptions";
import { updateClientOnStaticPanels } from "./kovra-servers-sync";

// ─── Legacy constants (still imported by name in some routes) ─────────
// Values are now meaningless for billing but must exist. Crypto-only.
export const DEVICE_MONTHLY_COST = 5;        // USD (display only, legacy)
export const TRIAL_MIN_BALANCE = 0;          // trial removed
export const MIN_TOPUP_FIRST = 0;            // legacy rub paths disabled
export const MIN_TOPUP = 0;
export const MIN_TOPUP_CRYPTO = 5;           // USD floor (NOWPayments min varies by coin)
export const MIN_TOPUP_ENOT_RUB = 0;
export const MIN_TOPUP_ENOT_CRYPTO = 0;
export const MIN_TOPUP_CRYPTOBOT = 0;
export const MAX_TOPUP = 100000;

/** Legacy bonus tiers removed (no balance to credit). Always 0. */
export function getTopupBonus(_amount: number): number {
  return 0;
}

export interface BalanceInfo {
  balance: number;
  dailyRate: number;
  daysRemaining: number;
  devices: number;
  costPerDevice: number;
}

export function getDailyRate(_profileCount: number): number {
  return 0;
}

/** Subscription model has no spendable balance. Always 0. */
export function getCurrentBalance(_account: UserAccount, _profileCount: number): number {
  return 0;
}

/**
 * Legacy info object. balance/dailyRate are 0; daysRemaining comes from the
 * furthest active subscription. devices = profileCount. Reads subs via the
 * synchronous-looking path is impossible (Redis is async), so this stays a
 * pure function over the account and returns 0 days — callers that need real
 * days now use the async helpers below or read /api/account.
 */
export function getBalanceInfo(_account: UserAccount, profileCount: number): BalanceInfo {
  return {
    balance: 0,
    dailyRate: 0,
    daysRemaining: 0,
    devices: profileCount,
    costPerDevice: DEVICE_MONTHLY_COST,
  };
}

/** Async variant that actually reflects subscriptions. Prefer this. */
export async function getBalanceInfoAsync(userId: string): Promise<BalanceInfo> {
  const subs = await getSubscriptions(userId);
  const s = summarize(subs);
  const profiles = await getProfiles(userId);
  return {
    balance: 0,
    dailyRate: 0,
    daysRemaining: s.daysRemaining,
    devices: profiles.length,
    costPerDevice: DEVICE_MONTHLY_COST,
  };
}

/** Furthest active subscription expiry (or now if none). */
export async function calcExpiryForUser(userId: string): Promise<number> {
  const subs = await getSubscriptions(userId);
  const max = maxActiveExpiry(subs);
  return max > Date.now() ? max : Date.now();
}

/**
 * Legacy signature kept (balance, deviceCount) but both args are ignored —
 * expiry is now derived from subscriptions, not balance. Returns now as a
 * safe default; real expiry is applied via syncAllExpiry which reads subs.
 *
 * NOTE: vpn/create is rewritten to call syncAllExpiry after creating a
 * profile, so the panel expiry is corrected regardless of this return.
 */
export function calcExpiry(_balance: number, _deviceCount: number): number {
  return Date.now();
}

/** Sync all profile expiry times on 3X-UI panel to the furthest active sub. */
export async function syncAllExpiry(userId: string): Promise<void> {
  try {
    const account = await getAccount(userId);
    if (!account) return;
    const profiles = await getProfiles(userId);
    if (profiles.length === 0) return;

    const subs = await getSubscriptions(userId);
    const max = maxActiveExpiry(subs);
    const expiryTime = max > Date.now() ? max : Date.now();

    account.paidUntil = expiryTime;
    await redis.set(`account:${userId}`, JSON.stringify(account));

    for (const p of profiles) {
      try {
        await updateClientOnStaticPanels({ uuid: p.uuid, email: p.clientEmail, subId: p.clientEmail, expiryTimeMs: expiryTime });
      } catch (err) {
        console.error(`[syncExpiry] Failed to update ${p.uuid}:`, err);
      }
    }

    console.log(
      `[syncExpiry] ${userId}: ${profiles.length} devices, activeSlots=${activeSlots(subs)}, expiry=${new Date(expiryTime).toISOString()}`,
    );
  } catch (err) {
    console.error("[syncExpiry] Error:", err);
  }
}

/**
 * Legacy money-credit entrypoint. In the subscription model there is no
 * balance to add, so this is a NO-OP that returns the account unchanged.
 * Real entitlement is granted by adding a subscription in the payment
 * webhook (see api/payment/crypto-webhook). Kept so any lingering caller
 * (promo, disabled rub webhooks) compiles and does not throw.
 */
export async function addBalance(userId: string, _amount: number): Promise<UserAccount> {
  const account = await getAccount(userId);
  if (!account) throw new Error("Account not found");
  return account;
}

/**
 * Can the user create another profile?
 * Allowed iff active device-slots strictly exceed current profile count.
 */
export function canCreateProfile(
  _account: UserAccount,
  _currentProfileCount: number,
): { ok: boolean; error?: string } {
  // This sync signature can't read Redis. vpn/create is rewritten to use
  // canCreateProfileAsync. Keep a permissive-but-safe default here: callers
  // still using the sync form will be gated by the async check in the route.
  return { ok: true };
}

/** Async gate used by the rewritten vpn/create route. */
export async function canCreateProfileAsync(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const subs = await getSubscriptions(userId);
  const slots = activeSlots(subs);
  const profiles = await getProfiles(userId);

  if (profiles.length >= 100) {
    return { ok: false, error: "Maximum 100 devices" };
  }
  if (slots <= profiles.length) {
    return {
      ok: false,
      error:
        "No active device slot. Buy a plan or add a device to connect.",
    };
  }
  return { ok: true };
}

/** Legacy settle — now just refreshes paidUntil from subscriptions. */
export async function settleBalance(userId: string): Promise<UserAccount> {
  const account = await getAccount(userId);
  if (!account) throw new Error("Account not found");
  account.paidUntil = await calcExpiryForUser(userId);
  await redis.set(`account:${userId}`, JSON.stringify(account));
  return account;
}
