// src/lib/balance.ts
import { redis } from "./redis";
import { getAccount, getProfiles, type UserAccount, type VpnProfile } from "./accounts";
import { listInbounds } from "./xpanel";
import { updateClientExpirySync } from "./xpanel-sync";

/**
 * 1 device = 100 ₽/month (~3.33 ₽/day)
 * Balance burns daily. When balance=0, profiles expire.
 * On topup, all profile expiries get extended on 3X-UI.
 *
 * Trial: first device can be created with just 10₽ (~3 days).
 * First topup minimum: 10₽. Subsequent: 100₽.
 */

export const DEVICE_MONTHLY_COST = 100;
const DEVICE_DAILY_COST = DEVICE_MONTHLY_COST / 30;

export const TRIAL_MIN_BALANCE = 10;  // ₽ minimum for first device
export const MIN_TOPUP_FIRST = 10;    // ₽ first topup minimum (card)
export const MIN_TOPUP = 100;         // ₽ subsequent topup minimum (card)
export const MIN_TOPUP_CRYPTO = 600;  // ₽ minimum for crypto topup (NOWPayments per-pair min ≥$5)
export const MIN_TOPUP_ENOT_RUB = 100;     // ₽ minimum for Enot RUB (card/sbp)
export const MIN_TOPUP_ENOT_CRYPTO = 150;  // ₽ minimum for Enot crypto (LTC ≈ 150 ₽ floor)
export const MIN_TOPUP_CRYPTOBOT = 200;  // RUB minimum for CryptoBot (@send)
export const MAX_TOPUP = 10000;

/** Topup bonus tiers: amount → bonus ₽ */
const TOPUP_BONUSES: { min: number; bonus: number }[] = [
  { min: 1000, bonus: 200 }, // 20%
  { min: 500,  bonus: 75 },  // 15%
  { min: 300,  bonus: 30 },  // 10%
];

/** Calculate bonus for a given topup amount */
export function getTopupBonus(amount: number): number {
  for (const tier of TOPUP_BONUSES) {
    if (amount >= tier.min) return tier.bonus;
  }
  return 0;
}

export interface BalanceInfo {
  balance: number;
  dailyRate: number;
  daysRemaining: number;
  devices: number;
  costPerDevice: number;
}

export function getDailyRate(profileCount: number): number {
  return profileCount * DEVICE_DAILY_COST;
}

export function getCurrentBalance(account: UserAccount, profileCount: number): number {
  if (!account.balance || account.balance <= 0) return 0;

  const dailyRate = getDailyRate(profileCount);
  if (dailyRate <= 0) return account.balance;

  const elapsed = (Date.now() - (account.balanceUpdatedAt || account.createdAt)) / 86400000;
  const consumed = elapsed * dailyRate;
  return Math.max(0, Math.round((account.balance - consumed) * 100) / 100);
}

export function getBalanceInfo(account: UserAccount, profileCount: number): BalanceInfo {
  const balance = getCurrentBalance(account, profileCount);
  const dailyRate = getDailyRate(profileCount);
  const daysRemaining = dailyRate > 0 ? Math.floor(balance / dailyRate) : (balance > 0 ? 999 : 0);
  return { balance, dailyRate: Math.round(dailyRate * 100) / 100, daysRemaining, devices: profileCount, costPerDevice: DEVICE_MONTHLY_COST };
}

/** Calculate expiry timestamp based on balance and device count */
export function calcExpiry(balance: number, deviceCount: number): number {
  if (deviceCount <= 0 || balance <= 0) return Date.now();
  const dailyRate = getDailyRate(deviceCount);
  if (dailyRate <= 0) return Date.now() + 365 * 86400000;
  return Date.now() + (balance / dailyRate) * 86400000;
}

/** Sync all profile expiry times on 3X-UI panel based on current balance */
export async function syncAllExpiry(userId: string): Promise<void> {
  try {
    const account = await getAccount(userId);
    if (!account) return;
    const profiles = await getProfiles(userId);
    if (profiles.length === 0) return;

    const balance = getCurrentBalance(account, profiles.length);
    const expiryTime = calcExpiry(balance, profiles.length);

    account.paidUntil = expiryTime;
    account.balance = balance;
    account.balanceUpdatedAt = Date.now();
    await redis.set(`account:${userId}`, JSON.stringify(account));

    const inbounds = await listInbounds();
    const inbound = inbounds.obj?.[0];
    if (!inbound) return;

    for (const p of profiles) {
      try {
        await updateClientExpirySync(inbound.id, p.uuid, p.clientEmail, expiryTime);
      } catch (err) {
        console.error(`[syncExpiry] Failed to update ${p.uuid}:`, err);
      }
    }

    console.log(`[syncExpiry] ${userId}: ${profiles.length} devices, balance=${balance.toFixed(2)}, expiry=${new Date(expiryTime).toISOString()}`);
  } catch (err) {
    console.error("[syncExpiry] Error:", err);
  }
}

/** Add funds and sync expiry (with mutex lock) */
export async function addBalance(userId: string, amount: number): Promise<UserAccount> {
  const { acquireLock } = await import("./ratelimit");
  const unlock = await acquireLock(`bal:${userId}`, 15);
  if (!unlock) throw new Error("Balance operation in progress");

  try {
    const account = await getAccount(userId);
    if (!account) throw new Error("Account not found");

    const profiles = await getProfiles(userId);
    const currentBalance = getCurrentBalance(account, profiles.length);
    account.balance = Math.round((currentBalance + amount) * 100) / 100;
    account.balanceUpdatedAt = Date.now();

    account.paidUntil = calcExpiry(account.balance, profiles.length);

    await redis.set(`account:${userId}`, JSON.stringify(account));

    if (profiles.length > 0) {
      await syncAllExpiry(userId);
    }

    return account;
  } finally {
    await unlock();
  }
}

/**
 * Check if user can create a new profile.
 * First device: need at least 10₽ (trial).
 * Additional devices: need at least 100₽ per device per month.
 */
export function canCreateProfile(account: UserAccount, currentProfileCount: number): { ok: boolean; error?: string } {
  if (currentProfileCount >= 100) {
    return { ok: false, error: "Максимум 100 устройств" };
  }

  const balance = getCurrentBalance(account, currentProfileCount);

  // First device — trial: just 10₽
  if (currentProfileCount === 0) {
    if (balance < TRIAL_MIN_BALANCE) {
      return { ok: false, error: `Пополните баланс на ${TRIAL_MIN_BALANCE} ₽ чтобы попробовать VPN на 3 дня.` };
    }
    return { ok: true };
  }

  // Additional devices — need enough balance for 1 month per new device
  if (balance < DEVICE_MONTHLY_COST) {
    const needed = Math.ceil(DEVICE_MONTHLY_COST - balance);
    return { ok: false, error: `Пополните баланс на ${needed} ₽. Для подключения нужно минимум 100 ₽ на балансе.` };
  }
  return { ok: true };
}

export async function settleBalance(userId: string): Promise<UserAccount> {
  const account = await getAccount(userId);
  if (!account) throw new Error("Account not found");
  const profiles = await getProfiles(userId);
  account.balance = getCurrentBalance(account, profiles.length);
  account.balanceUpdatedAt = Date.now();
  account.paidUntil = calcExpiry(account.balance, profiles.length);
  await redis.set(`account:${userId}`, JSON.stringify(account));
  return account;
}
