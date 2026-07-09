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
  amountRub: number; // whole rubles shown/charged
  amountMinor: number; // kopecks, for exact webhook comparison
  currency: "RUB";
  rubPerUsd: number;
  method: number; // 12 | 13
  createdAt: number;
}

interface CreateTxParams {
  paymentMethod: number;
  amountRub: number; // major units (rubles)
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
      paymentDetails: { amount: p.amountRub, currency: "RUB" },
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
