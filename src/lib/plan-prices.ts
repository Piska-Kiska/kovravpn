// src/lib/plan-prices.ts
//
// Plan prices (USD), without I/O, so the landing pages, their metadata and
// the tests read the very numbers the server charges. subscriptions.ts
// re-exports them; it stays the module that stores and applies plans.
//
// Every plan is a one-time payment for its whole term. Nothing renews by
// itself: a new term is a new purchase at the same price.

export type PlanKind = "plan1" | "plan3";
export type Term = 1 | 6 | 12;

export interface PlanPrice {
  term: Term;
  total: number; // USD charged once
  perMonth: number; // USD/mo (display)
  refMonthly: number; // the 1-month price, for "vs paying monthly"
}

export const PLAN_SLOTS: Record<PlanKind, number> = {
  plan1: 1,
  plan3: 3,
};

// plan1 = 1 device. Base $5/mo. 6mo -25%, 12mo -45% (mirrors plan3 discount curve).
// plan3 = 3 devices. 1mo 11.99, 6mo 8.99/mo, 12mo 6.59/mo.
export const PLAN_PRICES: Record<PlanKind, Record<Term, PlanPrice>> = {
  plan1: {
    1: { term: 1, total: 5.0, perMonth: 5.0, refMonthly: 5.0 },
    6: { term: 6, total: 22.5, perMonth: 3.75, refMonthly: 5.0 },
    12: { term: 12, total: 33.0, perMonth: 2.75, refMonthly: 5.0 },
  },
  plan3: {
    1: { term: 1, total: 11.99, perMonth: 11.99, refMonthly: 11.99 },
    6: { term: 6, total: 53.94, perMonth: 8.99, refMonthly: 11.99 },
    12: { term: 12, total: 79.08, perMonth: 6.59, refMonthly: 11.99 },
  },
};

export const TERMS: readonly Term[] = [1, 6, 12];

export const DEVICE_ADDON_PRICE = 5.0; // USD, 30 days, 1 slot
export const DEVICE_ADDON_DAYS = 30;
export const MAX_SLOTS = 100; // hard ceiling on total active slots

/** Refund window in days (Terms §5): only when the service failed through our fault. */
export const REFUND_WINDOW_DAYS = 14;

/** "$5", "$22.50", "$79.08": whole dollars without cents, otherwise two decimals. */
export function usd(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`not a price: ${amount}`);
  const cents = Math.round(amount * 100);
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** "$5.00" style, for price tags that sit in a column. */
export function usd2(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`not a price: ${amount}`);
  return `$${(Math.round(amount * 100) / 100).toFixed(2)}`;
}

/** Percent saved against paying the 1-month price for every month of the term. */
export function discountPercent(kind: PlanKind, term: Term): number {
  const p = PLAN_PRICES[kind][term];
  const monthly = p.refMonthly * term;
  return Math.round((1 - p.total / monthly) * 100);
}

/** The lowest per-month price of any plan (the annual one-device plan). */
export function lowestPerMonth(): number {
  let min = Infinity;
  for (const kind of Object.keys(PLAN_PRICES) as PlanKind[]) {
    for (const term of TERMS) min = Math.min(min, PLAN_PRICES[kind][term].perMonth);
  }
  return min;
}
