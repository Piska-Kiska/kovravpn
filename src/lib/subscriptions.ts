// src/lib/subscriptions.ts
//
// Subscription billing model (Kovra). Replaces the legacy prepaid-balance
// model. Crypto-only, priced in USD.
//
// Model
// ─────
// • A user owns a list of Subscription objects, stored at `subs:{userId}`.
// • Each subscription grants `slots` device-slots for a fixed window
//   [createdAt, expiresAt]. Subscriptions are INDEPENDENT — a device add-on
//   keeps running its own 30 days even if the main plan already expired.
// • Active device capacity = Σ slots of all subscriptions where expiresAt>now.
// • Profiles (VpnProfile) are unchanged. A profile is "served" as long as
//   total active capacity covers its index; 3X-UI expiry for every profile
//   is set to the furthest active expiry (max), or now (disable) if none.
//
// Kinds
//   plan1     — main plan, 1 slot,  term 1/6/12 months
//   plan3     — main plan, 3 slots, term 1/6/12 months
//   device    — add-on,    1 slot,  fixed 30 days
//   referral  — reward,    1 slot,  fixed 14 days (granted free by webhook)
//
// Pricing is authoritative in plan-prices.ts and re-exported here. The
// landing pages import the same module; the server always recomputes the
// charge.

import { redis } from "./redis";
import { randomBytes } from "crypto";
import { acquireLock } from "./ratelimit";
import {
  PLAN_PRICES,
  PLAN_SLOTS,
  DEVICE_ADDON_PRICE,
  DEVICE_ADDON_DAYS,
  MAX_SLOTS,
  type PlanKind,
  type PlanPrice,
  type Term,
} from "./plan-prices";

// Prices live in plan-prices.ts (no I/O) so the landing pages render the
// numbers the server charges; they are re-exported here for the callers.
export { PLAN_PRICES, PLAN_SLOTS, DEVICE_ADDON_PRICE, DEVICE_ADDON_DAYS, MAX_SLOTS };
export type { PlanKind, PlanPrice, Term };

export type SubKind = "plan1" | "plan3" | "device" | "referral";

export interface Subscription {
  id: string;
  kind: SubKind;
  slots: number;
  createdAt: number; // unix ms
  expiresAt: number; // unix ms
}

const DAY_MS = 86_400_000;
const MONTH_DAYS = 30;

export const REFERRAL_REWARD_DAYS = 14; // free, 1 slot

export interface PlanResolved {
  kind: PlanKind;
  term: Term;
  slots: number;
  price: number;     // USD
  days: number;      // term * 30
}

/** Validate + resolve a plan purchase request. Returns null if invalid. */
export function resolvePlan(kind: string, term: number): PlanResolved | null {
  if (kind !== "plan1" && kind !== "plan3") return null;
  if (term !== 1 && term !== 6 && term !== 12) return null;
  const p = PLAN_PRICES[kind][term as Term];
  return {
    kind,
    term: term as Term,
    slots: PLAN_SLOTS[kind],
    price: p.total,
    days: (term as Term) * MONTH_DAYS,
  };
}

// ─── Storage ──────────────────────────────────────────

export async function getSubscriptions(userId: string): Promise<Subscription[]> {
  const raw = await redis.get(`subs:${userId}`);
  if (!raw) return [];
  const arr = typeof raw === "string" ? JSON.parse(raw) : (raw as Subscription[]);
  return Array.isArray(arr) ? arr : [];
}

async function saveSubscriptions(userId: string, subs: Subscription[]): Promise<void> {
  await redis.set(`subs:${userId}`, JSON.stringify(subs));
}

/** Drop subscriptions that expired more than `graceDays` ago (housekeeping). */
function prune(subs: Subscription[], graceDays = 30): Subscription[] {
  const cutoff = Date.now() - graceDays * DAY_MS;
  return subs.filter((s) => s.expiresAt > cutoff);
}

function newId(): string {
  return randomBytes(8).toString("hex");
}

// ─── Active capacity / expiry ─────────────────────────

export function activeSlots(subs: Subscription[], at: number = Date.now()): number {
  return subs.reduce((sum, s) => (s.expiresAt > at ? sum + s.slots : sum), 0);
}

/** Furthest active expiry, or 0 if nothing active. */
export function maxActiveExpiry(subs: Subscription[], at: number = Date.now()): number {
  let max = 0;
  for (const s of subs) {
    if (s.expiresAt > at && s.expiresAt > max) max = s.expiresAt;
  }
  return max;
}

/** Nearest upcoming expiry among active subs, or 0. Used for "expires in N days". */
export function nextActiveExpiry(subs: Subscription[], at: number = Date.now()): number {
  let min = 0;
  for (const s of subs) {
    if (s.expiresAt > at) {
      if (min === 0 || s.expiresAt < min) min = s.expiresAt;
    }
  }
  return min;
}

/**
 * The main plan tier currently running, or null. plan3 wins when both run.
 * Re-buying the same tier extends it (addSubscription stacks the expiry), so
 * while a plan runs, purchases are renewals of THAT tier; extra devices come
 * from the device add-on.
 */
export function activePlanKindOf(subs: Subscription[], at: number = Date.now()): PlanKind | null {
  if (subs.some((s) => s.kind === "plan3" && s.expiresAt > at)) return "plan3";
  if (subs.some((s) => s.kind === "plan1" && s.expiresAt > at)) return "plan1";
  return null;
}

export interface SubscriptionSummary {
  activeSlots: number;
  hasActive: boolean;
  maxExpiry: number;   // furthest active expiry (drives 3X-UI expiry)
  nextExpiry: number;  // soonest active expiry (drives reminders)
  daysRemaining: number; // based on maxExpiry
  subs: Subscription[];  // active only, sorted by expiry asc
}

export function summarize(subs: Subscription[], at: number = Date.now()): SubscriptionSummary {
  const active = subs
    .filter((s) => s.expiresAt > at)
    .sort((a, b) => a.expiresAt - b.expiresAt);
  const maxExpiry = maxActiveExpiry(subs, at);
  const nextExpiry = nextActiveExpiry(subs, at);
  const daysRemaining =
    maxExpiry > at ? Math.floor((maxExpiry - at) / DAY_MS) : 0;
  return {
    activeSlots: activeSlots(subs, at),
    hasActive: maxExpiry > at,
    maxExpiry,
    nextExpiry,
    daysRemaining,
    subs: active,
  };
}

// ─── Mutations ────────────────────────────────────────
//
// Every write of `subs:{userId}` is a read-modify-write of one JSON list, and
// grants come from many places at once: a purchase from the wallet, a payment
// webhook, the referral reward, an account merge. Two of them for the same
// user without a lock would each read the old list and the later write would
// drop the other's grant (paid for). So every mutation runs under
// `lock:subs:{userId}`, waiting a little for a lock another grant holds.

const SUBS_LOCK_TTL_SEC = 10;
const SUBS_LOCK_WAIT_MS = 3_000;
const SUBS_LOCK_RETRY_MS = 50;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Run `fn` holding `lock:subs:{userId}`. A lock still held after
 * SUBS_LOCK_WAIT_MS belongs to a writer that died (a grant is a few Redis
 * calls): the write then goes ahead without it, as before the lock existed,
 * and the log says so. A grant is never refused for the lock alone, because a
 * webhook that fails after its dedup key is taken would lose the payment.
 */
async function withSubsLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + SUBS_LOCK_WAIT_MS;
  let unlock: (() => Promise<void>) | null = null;
  for (;;) {
    try {
      unlock = await acquireLock(`subs:${userId}`, SUBS_LOCK_TTL_SEC);
    } catch (err) {
      // Redis is failing: the write below will report it.
      console.warn("[subs] lock error:", err instanceof Error ? err.message : err);
      break;
    }
    if (unlock || Date.now() >= deadline) break;
    await sleep(SUBS_LOCK_RETRY_MS);
  }
  if (!unlock) console.warn(JSON.stringify({ evt: "subs.lock_timeout", userId }));
  try {
    return await fn();
  } finally {
    if (unlock) {
      try {
        await unlock();
      } catch {
        /* the lock expires by TTL */
      }
    }
  }
}

/**
 * Take `lock:subs:{userId}` for a writer outside this module that must not
 * run without it (the account link's move script, lib/tg-link-merge.ts),
 * waiting up to `waitMs` for a grant that holds it. Null when it is still
 * held then. Unlike withSubsLock, a Redis error is thrown, not skipped.
 */
export async function lockSubscriptions(
  userId: string,
  waitMs: number = SUBS_LOCK_WAIT_MS,
): Promise<(() => Promise<void>) | null> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const unlock = await acquireLock(`subs:${userId}`, SUBS_LOCK_TTL_SEC);
    if (unlock || Date.now() >= deadline) return unlock;
    await sleep(SUBS_LOCK_RETRY_MS);
  }
}

/**
 * Change a user's subscription list under the per-user lock: `apply` gets the
 * current list (expired > 30 days pruned) and returns the new one, which is
 * saved. Returns what was saved. The one way to write `subs:{userId}`, apart
 * from the account link's move script, which holds the same lock.
 */
export async function mutateSubscriptions(
  userId: string,
  apply: (subs: Subscription[], now: number) => Subscription[],
): Promise<Subscription[]> {
  return withSubsLock(userId, async () => {
    const now = Date.now();
    const next = apply(prune(await getSubscriptions(userId)), now);
    await saveSubscriptions(userId, next);
    return next;
  });
}

/**
 * Add a subscription. Two stacking strategies:
 *   • "plan" kinds (plan1/plan3): EXTEND if an active plan of the SAME kind
 *     exists — renewal stacks on the existing window (expiry += days), so a
 *     user who renews early doesn't lose remaining time. Otherwise create new
 *     starting now.
 *   • "device"/"referral": always a NEW independent window from now.
 *
 * Returns the resulting full list (pruned).
 */
export async function addSubscription(
  userId: string,
  kind: SubKind,
  days: number,
  slots: number,
): Promise<Subscription[]> {
  return mutateSubscriptions(userId, (subs, now) => {
    if (kind === "plan1" || kind === "plan3") {
      const existing = subs.find((s) => s.kind === kind && s.expiresAt > now);
      if (existing) {
        existing.expiresAt += days * DAY_MS;
        existing.slots = slots; // normalize (in case of schema change)
        return subs;
      }
    }
    // device / referral, or a plan with no running window of its kind
    subs.push({
      id: newId(),
      kind,
      slots,
      createdAt: now,
      expiresAt: now + days * DAY_MS,
    });
    return subs;
  });
}

/** Convenience: apply a resolved plan purchase. */
export async function applyPlanPurchase(
  userId: string,
  plan: PlanResolved,
): Promise<Subscription[]> {
  return addSubscription(userId, plan.kind, plan.days, plan.slots);
}

/** Convenience: apply a device add-on (30d, 1 slot, fixed). */
export async function applyDeviceAddon(userId: string): Promise<Subscription[]> {
  return addSubscription(userId, "device", DEVICE_ADDON_DAYS, 1);
}

/**
 * Device add-on bought for `term` months at once: ONE extra slot for
 * term × 30 days. (Applying the 30-day add-on `term` times would instead give
 * `term` slots that all end in 30 days — not what "+1 device · 180 days"
 * promises.)
 */
export async function applyDeviceAddonTerm(userId: string, term: Term): Promise<Subscription[]> {
  if (term !== 1 && term !== 6 && term !== 12) throw new Error(`invalid device add-on term: ${term}`);
  return addSubscription(userId, "device", term * DEVICE_ADDON_DAYS, 1);
}

/** Convenience: grant a free referral reward (14d, 1 slot). */
export async function applyReferralReward(userId: string): Promise<Subscription[]> {
  return addSubscription(userId, "referral", REFERRAL_REWARD_DAYS, 1);
}

// ─── Order-ID encoding for NOWPayments round-trip ─────
//
// order_id formats (userId may contain underscores → parse from the right
// for the timestamp, and known prefixes from the left):
//   plan:    sub_<kind>_<term>_<userId>_<ts>     e.g. sub_plan3_6_tg_12345_1700000000000
//   device:  dev_<userId>_<ts>                   e.g. dev_tg_12345_1700000000000
//
// referral rewards are granted internally (no payment), so they need no order_id.

export type ParsedOrder =
  | { type: "plan"; kind: PlanKind; term: Term; userId: string; ts: number }
  | { type: "device"; userId: string; ts: number };

export function buildPlanOrderId(userId: string, kind: PlanKind, term: Term): string {
  return `sub_${kind}_${term}_${userId}_${Date.now()}`;
}

export function buildDeviceOrderId(userId: string): string {
  return `dev_${userId}_${Date.now()}`;
}

/** Parse our subscription order_id back into structured data. */
export function parseSubOrderId(orderId: string): ParsedOrder | null {
  if (!orderId) return null;

  // device: dev_<userId>_<ts>
  if (orderId.startsWith("dev_")) {
    const rest = orderId.slice(4);
    const lu = rest.lastIndexOf("_");
    if (lu <= 0) return null;
    const userId = rest.slice(0, lu);
    const ts = Number(rest.slice(lu + 1));
    if (!userId || !Number.isFinite(ts)) return null;
    return { type: "device", userId, ts };
  }

  // plan: sub_<kind>_<term>_<userId>_<ts>
  if (orderId.startsWith("sub_")) {
    const rest = orderId.slice(4); // "<kind>_<term>_<userId>_<ts>"
    // kind is plan1 or plan3
    const usIdx = rest.indexOf("_");
    if (usIdx <= 0) return null;
    const kind = rest.slice(0, usIdx);
    if (kind !== "plan1" && kind !== "plan3") return null;
    const afterKind = rest.slice(usIdx + 1); // "<term>_<userId>_<ts>"
    const termIdx = afterKind.indexOf("_");
    if (termIdx <= 0) return null;
    const term = Number(afterKind.slice(0, termIdx));
    if (term !== 1 && term !== 6 && term !== 12) return null;
    const afterTerm = afterKind.slice(termIdx + 1); // "<userId>_<ts>"
    const lu = afterTerm.lastIndexOf("_");
    if (lu <= 0) return null;
    const userId = afterTerm.slice(0, lu);
    const ts = Number(afterTerm.slice(lu + 1));
    if (!userId || !Number.isFinite(ts)) return null;
    return { type: "plan", kind, term: term as Term, userId, ts };
  }

  return null;
}
