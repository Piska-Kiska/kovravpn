// src/lib/cashera-fx.ts
//
// USD → RUB conversion for Cashera card payments: the `mastercard` method
// accepts RUB only while Kovra prices are USD.
//
// Rate source: Cashera's own GET /integration/rates (RUB→USDT,
// `merchant_rate` with markup already applied — settlement is computed by
// the same rate), so the charge is settlement-consistent and needs no
// external FX provider. USDT is treated as USD (peg deviation <0.5%).
//
//   rubPerUsd = 1 / merchant_rate(RUB→USDT)
//
// The charged amount is rounded UP to whole rubles. The rate is cached in
// Redis for 5 minutes; if the rates API is down, the last known rate
// (stored without TTL) is used as a stale fallback.

import { redis } from "@/lib/redis";
import { getRates } from "@/lib/cashera";

const CACHE_KEY = "cashera_fx:rub_per_usd";
const LAST_KEY = "cashera_fx:rub_per_usd:last";
const CACHE_TTL_SEC = 300;

// Sanity band: reject degenerate/garbage rates.
const MIN_RUB_PER_USD = 40;
const MAX_RUB_PER_USD = 500;

interface CachedRate {
  rubPerUsd: number;
  merchantRate: string;
  at: number;
}

function parseCached(raw: unknown): CachedRate | null {
  if (!raw) return null;
  try {
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as CachedRate;
    return typeof v?.rubPerUsd === "number" &&
      v.rubPerUsd >= MIN_RUB_PER_USD &&
      v.rubPerUsd <= MAX_RUB_PER_USD
      ? v
      : null;
  } catch {
    return null;
  }
}

async function fetchRate(paymentMethod: string): Promise<CachedRate> {
  const rates = await getRates(paymentMethod, "RUB", "USDT");
  const rateStr = rates.merchant_rate ?? rates.provider_rate;
  const usdtPerRub = Number(rateStr);
  if (!rateStr || !Number.isFinite(usdtPerRub) || usdtPerRub <= 0) {
    throw new Error(`cashera rates: bad response ${JSON.stringify(rates)}`);
  }
  const rubPerUsd = 1 / usdtPerRub;
  if (rubPerUsd < MIN_RUB_PER_USD || rubPerUsd > MAX_RUB_PER_USD) {
    throw new Error(
      `cashera rates: ${rubPerUsd.toFixed(2)} RUB/USD out of sanity band`,
    );
  }
  return { rubPerUsd, merchantRate: rateStr, at: Date.now() };
}

export interface UsdToRubResult {
  amountMinor: number; // kopecks to pass to createPayment
  amountRub: number; // whole rubles the client will see
  rubPerUsd: number;
  stale: boolean; // true when the last-known fallback rate was used
}

export async function usdToRubMinor(
  amountUsd: number,
  paymentMethod: string,
): Promise<UsdToRubResult> {
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
      console.error("[cashera-fx] rate fetch failed, trying last known:", err);
      rate = parseCached(await redis.get(LAST_KEY).catch(() => null));
      stale = true;
      if (!rate) throw new Error("cashera fx rate unavailable");
    }
  }

  const amountRub = Math.ceil(amountUsd * rate.rubPerUsd);
  return {
    amountMinor: amountRub * 100,
    amountRub,
    rubPerUsd: rate.rubPerUsd,
    stale,
  };
}
