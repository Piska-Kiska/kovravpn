// src/lib/platega-fx.ts
//
// USD → EUR conversion for Platega card payments (method 12): Kovra prices
// are USD, the international method invoices in EUR.
//
// Rate source: Platega's own GET /rates/payment_method_rate with
// currencyFrom=USD & currencyTo=EUR. The docs do not pin down whether
// `rate` means "EUR per 1 USD" or the inverse (their USDT->RUB example
// reads inverted), so the value is NORMALIZED by sanity band: eurPerUsd
// must land in 0.70..1.00; a raw value in 1.00..1.43 is treated as
// usdPerEur and inverted; anything else is rejected. The first live
// response is logged verbatim to settle the semantics.
//
// Charged amount is rounded UP to whole euro cents. Rate cached in Redis
// for 5 minutes; last known value (no TTL) is the fallback when the rates
// API is down.

import { redis } from "@/lib/redis";
import { getPlategaRate } from "@/lib/platega";

const CACHE_KEY = "platega_fx:eur_per_usd";
const LAST_KEY = "platega_fx:eur_per_usd:last";
const CACHE_TTL_SEC = 300;

const MIN_EUR_PER_USD = 0.7;
const MAX_EUR_PER_USD = 1.0;

interface CachedRate {
  eurPerUsd: number;
  raw: number;
  at: number;
}

function parseCached(raw: unknown): CachedRate | null {
  if (!raw) return null;
  try {
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as CachedRate;
    return typeof v?.eurPerUsd === "number" &&
      v.eurPerUsd >= MIN_EUR_PER_USD &&
      v.eurPerUsd <= MAX_EUR_PER_USD
      ? v
      : null;
  } catch {
    return null;
  }
}

function normalize(raw: number): number | null {
  if (!Number.isFinite(raw) || raw <= 0) return null;
  if (raw >= MIN_EUR_PER_USD && raw <= MAX_EUR_PER_USD) return raw;
  const inv = 1 / raw;
  if (inv >= MIN_EUR_PER_USD && inv <= MAX_EUR_PER_USD) return inv;
  return null;
}

async function fetchRate(paymentMethod: number): Promise<CachedRate> {
  const res = await getPlategaRate(paymentMethod, "USD", "EUR");
  console.log("[platega-fx] raw rate response", res);
  const raw = Number(res.rate);
  const eurPerUsd = normalize(raw);
  if (eurPerUsd === null) {
    throw new Error(`platega rates: unusable rate ${JSON.stringify(res)}`);
  }
  return { eurPerUsd, raw, at: Date.now() };
}

export interface UsdToEurResult {
  amountEur: number; // float with 2 decimals, what Platega charges
  amountMinor: number; // euro cents, stored for webhook verification
  eurPerUsd: number;
  stale: boolean;
}

export async function usdToEur(
  amountUsd: number,
  paymentMethod: number,
): Promise<UsdToEurResult> {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error(`invalid amountUsd: ${amountUsd}`);
  }

  let rate = parseCached(await redis.get(CACHE_KEY).catch(() => null));
  let stale = false;

  if (!rate) {
    try {
      rate = await fetchRate(paymentMethod);
      await redis.set(CACHE_KEY, JSON.stringify(rate), { ex: CACHE_TTL_SEC });
      await redis.set(LAST_KEY, JSON.stringify(rate)); // no TTL: fallback
    } catch (err) {
      console.error("[platega-fx] rate fetch failed, trying last known:", err);
      rate = parseCached(await redis.get(LAST_KEY).catch(() => null));
      stale = true;
      if (!rate) throw new Error("platega fx rate unavailable");
    }
  }

  const amountMinor = Math.ceil(amountUsd * rate.eurPerUsd * 100);
  return {
    amountEur: amountMinor / 100,
    amountMinor,
    eurPerUsd: rate.eurPerUsd,
    stale,
  };
}
