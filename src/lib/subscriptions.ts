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
// Pricing is authoritative HERE (server). The landing/dashboard mirror these
// numbers for display only; the server always recomputes the charge.

import { redis } from "./redis";
import { randomBytes } from "crypto";

export type SubKind = "plan1" | "plan3" | "device" | "referral";
export type PlanKind = "plan1" | "plan3";
export type Term = 1 | 6 | 12;

export interface Subscription {
  id: string;
  kind: SubKind;
  slots: number;
  createdAt: number; // unix ms
  expiresAt: number; // unix ms
}

const DAY_MS = 86_400_000;
const MONTH_DAYS = 30;

// ─── Pricing (USD) ────────────────────────────────────
// price = total charge for the whole term, in USD.
// perMonth is derived for display. Keep in sync with landing TERMS.

export interface PlanPrice {
  term: Term;
  total: number;   // USD charged once (crypto)
  perMonth: number; // USD/mo (display)
  refMonthly: number; // reference monthly (1-mo price) for "save vs" display
}

export const PLAN_SLOTS: Record<PlanKind, number> = {
  plan1: 1,
  plan3: 3,
};

// plan1 = 1 device. Base $5/mo. 6mo -25%, 12mo -45% (mirrors plan3 discount curve).
// plan3 = 3 devices. From landing: 1mo 11.99, 6mo 8.99/mo, 12mo 6.59/mo.
export const PLAN_PRICES: Record<PlanKind, Record<Term, PlanPrice>> = {
  plan1: {
    1:  { term: 1,  total: 5.0,   perMonth: 5.0,  refMonthly: 5.0 },
    6:  { term: 6,  total: 22.5,  perMonth: 3.75, refMonthly: 5.0 },
    12: { term: 12, total: 33.0,  perMonth: 2.75, refMonthly: 5.0 },
  },
  plan3: {
    1:  { term: 1,  total: 11.99, perMonth: 11.99, refMonthly: 11.99 },
    6:  { term: 6,  total: 53.94, perMonth: 8.99,  refMonthly: 11.99 },
    12: { term: 12, total: 79.08, perMonth: 6.59,  refMonthly: 11.99 },
  },
};

export const DEVICE_ADDON_PRICE = 5.0; // USD, 30 days, 1 slot
export const DEVICE_ADDON_DAYS = 30;
export const REFERRAL_REWARD_DAYS = 14; // free, 1 slot
export const MAX_SLOTS = 100; // hard ceiling on total active slots

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
  const now = Date.now();
  let subs = prune(await getSubscriptions(userId));

  if (kind === "plan1" || kind === "plan3") {
    const existing = subs.find((s) => s.kind === kind && s.expiresAt > now);
    if (existing) {
      existing.expiresAt += days * DAY_MS;
      existing.slots = slots; // normalize (in case of schema change)
    } else {
      subs.push({
        id: newId(),
        kind,
        slots,
        createdAt: now,
        expiresAt: now + days * DAY_MS,
      });
    }
  } else {
    // device / referral — independent window
    subs.push({
      id: newId(),
      kind,
      slots,
      createdAt: now,
      expiresAt: now + days * DAY_MS,
    });
  }

  await saveSubscriptions(userId, subs);
  return subs;
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
