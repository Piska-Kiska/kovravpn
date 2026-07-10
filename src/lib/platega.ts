// src/lib/platega.ts
//
// Platega.io client (docs.platega.io, verified 2026-07).
// Base URL: https://app.platega.io
// Auth: X-MerchantId + X-Secret headers (both directions — Platega sends the
// same pair on callbacks, so webhook verification is a constant-time compare).
//
// Payment methods (PaymentMethodInt):
//   2 SBP QR · 3 ERIP · 11 card acquiring (RU) · 12 international · 13 crypto
// Kovra uses 12 (card, international) and 13 (crypto).
//
// Create: POST /transaction/process — do NOT send `id` (server-generated).
// Callback body: { id, amount, currency, status, paymentMethod },
// status ∈ CONFIRMED | CANCELED (CHARGEBACKED mentioned in docs prose).

import crypto from "crypto";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const BASE_URL = "https://app.platega.io";
const MERCHANT_ID = process.env.PLATEGA_MERCHANT_ID || "";
const SECRET = process.env.PLATEGA_SECRET || "";

export const PLATEGA_METHOD_CARD = 12; // «Международная оплата» (intl acquiring)
export const PLATEGA_METHOD_CRYPTO = 13; // «Криптовалюта»

export class PlategaError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "PlategaError";
  }
}

export function plategaEnabled(): boolean {
  return Boolean(MERCHANT_ID && SECRET);
}

export interface PlategaOrderRecord {
  userId: string;
  kind: "plan1" | "plan3" | "device";
  term?: number;
  amountUsd: number;
  amountCharged: number; // major units actually charged (EUR / USD)
  amountMinor: number; // minor units (cents), for exact webhook comparison
  currency: string; // EUR for card (12), USD for crypto (13)
  fxRate: number; // charged-currency per 1 USD (1 for USD)
  method: number; // 12 | 13
  createdAt: number;
}

interface CreateTxParams {
  paymentMethod: number;
  amount: number; // major units in `currency`
  currency: string; // EUR | USD (support: EUR = intl + crypto, USD = crypto)
  description: string;
  payload: string; // our externalId, for reconciliation
  returnUrl: string;
  failedUrl: string;
}

interface CreateTxResponse {
  transactionId: string;
  redirect: string;
  status?: string;
}

export async function createPlategaTransaction(
  p: CreateTxParams,
): Promise<CreateTxResponse> {
  if (!plategaEnabled()) throw new PlategaError("PLATEGA_* env is not set");

  const res = await fetchWithTimeout(`${BASE_URL}/transaction/process`, {
    method: "POST",
    timeoutMs: 15_000,
    headers: {
      "Content-Type": "application/json",
      "X-MerchantId": MERCHANT_ID,
      "X-Secret": SECRET,
    },
    body: JSON.stringify({
      paymentMethod: p.paymentMethod,
      paymentDetails: {
        amount: Math.round(p.amount * 100) / 100,
        currency: p.currency,
      },
      description: p.description.slice(0, 255),
      return: p.returnUrl,
      failedUrl: p.failedUrl,
      payload: p.payload,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new PlategaError(
      `create failed: HTTP ${res.status} ${text.slice(0, 300)}`,
      res.status,
    );
  }
  let data: CreateTxResponse;
  try {
    data = JSON.parse(text) as CreateTxResponse;
  } catch {
    throw new PlategaError(`create returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!data.transactionId || !data.redirect) {
    throw new PlategaError(
      `create response missing transactionId/redirect: ${text.slice(0, 200)}`,
    );
  }
  return data;
}

export interface PlategaRateResponse {
  paymentMethod?: number;
  currencyFrom?: string;
  currencyTo?: string;
  rate?: number;
  updatedAt?: string;
}

/** Current exchange rate for a method and currency pair (docs: /rates). */
export async function getPlategaRate(
  paymentMethod: number,
  currencyFrom: string,
  currencyTo: string,
): Promise<PlategaRateResponse> {
  if (!plategaEnabled()) throw new PlategaError("PLATEGA_* env is not set");
  const q = new URLSearchParams({
    merchantId: MERCHANT_ID,
    paymentMethod: String(paymentMethod),
    currencyFrom,
    currencyTo,
  });
  const res = await fetchWithTimeout(
    `${BASE_URL}/rates/payment_method_rate?${q.toString()}`,
    {
      method: "GET",
      timeoutMs: 15_000,
      headers: { "X-MerchantId": MERCHANT_ID, "X-Secret": SECRET },
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new PlategaError(
      `rates failed: HTTP ${res.status} ${text.slice(0, 300)}`,
      res.status,
    );
  }
  try {
    return JSON.parse(text) as PlategaRateResponse;
  } catch {
    throw new PlategaError(`rates returned non-JSON: ${text.slice(0, 200)}`);
  }
}

function safeEqual(a: string | null | undefined, b: string): boolean {
  const ba = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Callback authenticity: Platega sends our own X-MerchantId/X-Secret back. */
export function verifyPlategaWebhook(h: {
  get(name: string): string | null;
}): boolean {
  if (!MERCHANT_ID || !SECRET) return false;
  return (
    safeEqual(h.get("x-merchantid"), MERCHANT_ID) &&
    safeEqual(h.get("x-secret"), SECRET)
  );
}
