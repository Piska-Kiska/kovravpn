// src/lib/cashera.ts
//
// Cashera API client (docs.cashera.cash). Server-side only.
// Auth: X-Api-Key header (pk_...). Webhook authenticity: X-Api-Key +
// X-Secret headers compared constant-time against our credentials.

import crypto from "crypto";

const API_BASE = "https://api.cashera.cash/api/v1";

const API_KEY = process.env.CASHERA_API_KEY || ""; // pk_live_...
const API_SECRET = process.env.CASHERA_API_SECRET || ""; // sk_...

export type CasheraStatus =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "refunded"
  | "chargeback";

export interface CasheraTransaction {
  uuid: string;
  type: "deposit";
  amount: number; // minor units (cents)
  gross_amount: number;
  net_amount: number;
  fee_amount?: number;
  fee_payer?: string;
  currency: "RUB" | "USD" | "EUR";
  settlement_currency?: string;
  settlement_amount?: number;
  fx_rate?: string;
  payment_method: string;
  status: CasheraStatus;
  external_id: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  payload?: string | null;
  payment_url?: string;
  expires_at?: string | null;
  paid_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreatePaymentInput {
  amountMinor: number; // integer, minor units
  currency: "RUB" | "USD" | "EUR";
  paymentMethod: string; // enabled method code from merchant cabinet
  externalId: string; // idempotency key, <=255 chars, one per order
  description?: string;
  metadata?: Record<string, unknown>;
  callbackUrl?: string; // https + public host; else merchant settings are used
  successUrl?: string;
  failUrl?: string;
}

export class CasheraError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Cashera API ${status}: ${JSON.stringify(body)}`);
    this.name = "CasheraError";
  }
}

/** GET /integration/rates response. */
export interface CasheraRates {
  provider_rate?: string;
  merchant_rate?: string; // markup applied; settlement uses this one
  fx_markup_percent?: number;
  updated_at?: string;
}

/**
 * Order record stored at `cashera_order:{externalId}` when the payment is
 * created; the webhook verifies tx.amount/currency against it before granting.
 */
export interface CasheraOrderRecord {
  userId: string;
  kind: string;
  term?: number;
  amountUsd: number;
  amountMinor: number; // RUB kopecks actually charged
  currency: "RUB";
  rubPerUsd: number;
  createdAt: number;
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  if (!API_KEY) throw new Error("CASHERA_API_KEY is not set");

  const attempt = async (): Promise<T> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { "X-Api-Key": API_KEY, "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as unknown;
      if (!res.ok) throw new CasheraError(res.status, json);
      return json as T;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (e) {
    // One retry on network error / 5xx. Safe for POST: external_id is an
    // idempotency key — a repeated create returns the existing transaction.
    const retryable = !(e instanceof CasheraError) || e.status >= 500;
    if (!retryable) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return attempt();
  }
}

// Docs example returns payment_url without scheme ("pay.cashera.cash/...").
export function normalizePaymentUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

export async function createPayment(
  input: CreatePaymentInput,
): Promise<CasheraTransaction> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor < 1) {
    throw new Error(`invalid amountMinor: ${input.amountMinor}`);
  }
  const tx = await request<CasheraTransaction>(
    "POST",
    "/integration/transactions",
    {
      amount: input.amountMinor,
      currency: input.currency,
      payment_method: input.paymentMethod,
      external_id: input.externalId,
      ...(input.description
        ? { description: input.description.slice(0, 255) }
        : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
      ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
      ...(input.successUrl ? { success_url: input.successUrl } : {}),
      ...(input.failUrl ? { fail_url: input.failUrl } : {}),
    },
  );
  if (tx.payment_url) tx.payment_url = normalizePaymentUrl(tx.payment_url);
  return tx;
}

/** For manual reconciliation / debugging. */
export async function getTransaction(
  uuid: string,
): Promise<CasheraTransaction> {
  return request<CasheraTransaction>(
    "GET",
    `/integration/transactions/${encodeURIComponent(uuid)}`,
  );
}

export async function getTransactionByExternalId(
  externalId: string,
): Promise<CasheraTransaction> {
  return request<CasheraTransaction>(
    "GET",
    `/integration/transactions/by-external-id/${encodeURIComponent(externalId)}`,
  );
}

/** Current conversion rate of the payment currency into settlement USDT. */
export async function getRates(
  paymentMethod: string,
  currencyFrom: "RUB" | "USD" | "EUR",
  currencyTo: "USDT" = "USDT",
): Promise<CasheraRates> {
  const q = new URLSearchParams({
    payment_method: paymentMethod,
    currency_from: currencyFrom,
    currency_to: currencyTo,
  });
  return request<CasheraRates>("GET", `/integration/rates?${q.toString()}`);
}

function safeEqual(a: string | null | undefined, b: string): boolean {
  const ba = Buffer.from(String(a ?? ""));
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Webhook authenticity: compare X-Api-Key and X-Secret headers with our
 * credentials in constant time. Never log X-Secret.
 */
export function verifyWebhookHeaders(h: {
  get(name: string): string | null;
}): boolean {
  if (!API_KEY || !API_SECRET) return false;
  const okKey = safeEqual(h.get("x-api-key"), API_KEY);
  const okSecret = safeEqual(h.get("x-secret"), API_SECRET);
  return okKey && okSecret;
}
