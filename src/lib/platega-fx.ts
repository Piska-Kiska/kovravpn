// src/lib/platega-fx.ts
//
// USD → EUR conversion for Platega card payments (method 12): Kovra prices
// are USD, the international method invoices in EUR.
//
// Rate source: ECB reference rate via the keyless Frankfurter API
// (api.frankfurter.dev, updated every working day ~16:00 CET). Platega's
// own /rates endpoint returns 404 "Rate not found" for the USD→EUR pair on
// this merchant (verified 2026-07-10) — switch back to it for zero drift
// once support enables the pair.
//
// Resolution order:
//   1. PLATEGA_EUR_PER_USD env (manual pin, sanity-checked)
//   2. Redis cache (6h — the ECB rate is daily)
//   3. Frankfurter fetch
//   4. last known value in Redis (no TTL)
//
// Charged amount is rounded UP to whole euro cents.

import { redis } from "@/lib/redis";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const FRANKFURTER_URL =
  "https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR";
const CACHE_KEY = "platega_fx:eur_per_usd";
const LAST_KEY = "platega_fx:eur_per_usd:last";
const CACHE_TTL_SEC = 6 * 3600;

const MIN_EUR_PER_USD = 0.7;
const MAX_EUR_PER_USD = 1.0;

interface CachedRate {
  eurPerUsd: number;
  source: string;
  at: number;
}

function inBand(x: number): boolean {
  return Number.isFinite(x) && x >= MIN_EUR_PER_USD && x <= MAX_EUR_PER_USD;
}

function parseCached(raw: unknown): CachedRate | null {
  if (!raw) return null;
  try {
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as CachedRate;
    return inBand(v?.eurPerUsd) ? v : null;
  } catch {
    return null;
  }
}

async function fetchEcbRate(): Promise<CachedRate> {
  const res = await fetchWithTimeout(FRANKFURTER_URL, {
    method: "GET",
    timeoutMs: 10_000,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`frankfurter HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = JSON.parse(text) as { rates?: { EUR?: number } };
  console.log("[platega-fx] frankfurter response", text.slice(0, 200));
  const rate = Number(data?.rates?.EUR);
  if (!inBand(rate)) {
    throw new Error(`frankfurter: rate out of sanity band: ${rate}`);
  }
  return { eurPerUsd: rate, source: "ecb", at: Date.now() };
}

export interface UsdToEurResult {
  amountEur: number; // float with 2 decimals, what Platega charges
  amountMinor: number; // euro cents, stored for webhook verification
  eurPerUsd: number;
  stale: boolean;
}

export async function usdToEur(
  amountUsd: number,
  _paymentMethod?: number,
): Promise<UsdToEurResult> {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error(`invalid amountUsd: ${amountUsd}`);
  }

  let rate: CachedRate | null = null;
  let stale = false;

  const pinned = Number(process.env.PLATEGA_EUR_PER_USD || "");
  if (inBand(pinned)) {
    rate = { eurPerUsd: pinned, source: "env", at: Date.now() };
  }

  if (!rate) rate = parseCached(await redis.get(CACHE_KEY).catch(() => null));

  if (!rate) {
    try {
      rate = await fetchEcbRate();
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
