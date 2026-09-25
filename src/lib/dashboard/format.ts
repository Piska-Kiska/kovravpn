// src/lib/dashboard/format.ts
// Formatting helpers and the hero state rule for the dashboard.
import type { Lang } from "@/i18n/dict";
import type { AccountData } from "./types";

/** Reward days per friend who buys a plan (copy and maths use this one constant). */
export const REF_REWARD_DAYS = 14;

/** Days at or below which an active plan counts as "expiring". */
export const EXPIRING_DAYS = 7;

/** Localized short date that never wraps inside ("12 июн. 2026 г." stays one unit). */
export function fmtDate(ms: number, lang: string): string {
  if (!ms) return "—";
  try {
    return new Date(ms)
      .toLocaleDateString(lang === "en" ? "en-US" : lang, { year: "numeric", month: "short", day: "numeric" })
      .replace(/\s/g, "\u00A0");
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/**
 * Prices are set in US dollars for every language, written the way the
 * language writes money: "$79.08" (en), "79,08 $" (de, fr, es, ru).
 */
export function fmtUsd(n: number, lang: Lang): string {
  return fmtMoney(n, "USD", lang);
}

/**
 * Any charge currency the way the language writes money, so a method row
 * ("PayPal · $79.08" from lava-price.ts formatCharge, which the bot keeps
 * using) does not sit in English format next to "79,08 $".
 */
export function fmtMoney(n: number, currency: "USD" | "EUR" | "RUB", lang: Lang): string {
  const v = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(lang === "en" ? "en-US" : lang, {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

export type HeroState = "active" | "expiring" | "expired" | "none";

/** Whole days left on the plan: the server value, else derived from maxExpiry. */
export function daysLeft(account: AccountData, now: number): number {
  if (Number.isFinite(account.daysRemaining) && account.daysRemaining > 0) return Math.floor(account.daysRemaining);
  if (account.maxExpiry > now) return Math.ceil((account.maxExpiry - now) / 864e5);
  return 0;
}

/**
 * active   — hasActive and more than 7 days left;
 * expiring — hasActive and 7 days or fewer;
 * expired  — no active plan but one existed (maxExpiry > 0);
 * none     — never had a plan.
 */
export function heroState(account: AccountData | null, now: number): HeroState {
  if (!account) return "none";
  if (account.hasActive) return daysLeft(account, now) > EXPIRING_DAYS ? "active" : "expiring";
  return account.maxExpiry > 0 ? "expired" : "none";
}
