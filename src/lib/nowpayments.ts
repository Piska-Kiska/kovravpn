// src/lib/nowpayments.ts
import crypto from "crypto";

const API_BASE = "https://api.nowpayments.io/v1";
const API_KEY = process.env.NOWPAYMENTS_API_KEY || "";
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kovravpn.com";
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "KovraVPN_bot";

// ─── Types ────────────────────────────────────────────

export interface CreateInvoiceParams {
  /** Pre-built order_id (encodes what is being purchased). */
  orderId: string;
  /** Price in USD charged once. */
  amountUsd: number;
  description?: string;
  /** Where the invoice was created from — affects success/cancel URLs. */
  source?: "bot" | "web";
}

export interface CryptoInvoice {
  invoiceUrl: string;
  invoiceId: string;
  orderId: string;
}

/** IPN webhook payload.
 *  See https://documenter.getpostman.com/view/7907941/S1a32n38 */
export interface IpnPayload {
  payment_id: number | string;
  /** waiting | confirming | confirmed | sending | partially_paid | finished | failed | refunded | expired */
  payment_status: string;
  pay_address?: string;
  price_amount: number;
  price_currency: string;
  pay_amount?: number;
  pay_currency?: string;
  actually_paid?: number;
  order_id: string;
  order_description?: string;
  purchase_id?: number | string;
  outcome_amount?: number;
  outcome_currency?: string;
  [k: string]: unknown;
}

// ─── Invoice creation ────────────────────────────────

/**
 * Create a NOWPayments hosted-checkout invoice priced in USD.
 * The caller builds `orderId` (see subscriptions.ts buildPlanOrderId /
 * buildDeviceOrderId) so the webhook can decode the purchase on payment.
 * User picks the crypto on the hosted page.
 */
export async function createInvoice(
  params: CreateInvoiceParams,
): Promise<CryptoInvoice> {
  if (!API_KEY) throw new Error("NOWPAYMENTS_API_KEY is not set");

  const source = params.source || "web";

  const successUrl =
    source === "web"
      ? `${SITE_URL}/dashboard?paid=1`
      : `https://t.me/${BOT_USERNAME}?start=paid`;
  const cancelUrl =
    source === "web" ? `${SITE_URL}/dashboard` : `https://t.me/${BOT_USERNAME}`;

  const body = {
    price_amount: params.amountUsd,
    price_currency: "usd",
    order_id: params.orderId,
    order_description: params.description || `Kovra — ${params.orderId}`,
    ipn_callback_url: `${SITE_URL}/api/payment/crypto-webhook`,
    success_url: successUrl,
    cancel_url: cancelUrl,
    is_fixed_rate: false,
    is_fee_paid_by_user: true,
  };

  const res = await fetch(`${API_BASE}/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments invoice error ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!data?.invoice_url || !data?.id) {
    throw new Error(
      `NOWPayments: malformed response: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  return {
    invoiceUrl: String(data.invoice_url),
    invoiceId: String(data.id),
    orderId: params.orderId,
  };
}

// ─── Legacy alias (kept so any leftover caller compiles) ──────────────
// Old signature took { userId, amountRub, source }. Map to USD invoice.
// NOTE: only the disabled rub paths referenced this; subscription flows use
// createInvoice directly.
export interface CreateCryptoInvoiceParams {
  userId: string;
  amountRub?: number;
  amountUsd?: number;
  description?: string;
  source?: "bot" | "web";
}

export async function createCryptoInvoice(
  params: CreateCryptoInvoiceParams,
): Promise<CryptoInvoice> {
  const amountUsd = params.amountUsd ?? params.amountRub ?? 0;
  const orderId = `topup_${params.userId}_${Date.now()}`;
  return createInvoice({
    orderId,
    amountUsd,
    description: params.description,
    source: params.source,
  });
}

// ─── IPN signature verification ───────────────────────

/** Deep sort of JSON keys. NOWPayments sort keys before HMAC-SHA512 signing. */
function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      sorted[key] = sortObjectKeys(src[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Verify HMAC-SHA512 signature from `x-nowpayments-sig` header.
 * Uses timing-safe comparison.
 */
export function verifyIpnSignature(rawBody: string, signature: string): boolean {
  if (!IPN_SECRET) {
    console.error("[nowpayments] NOWPAYMENTS_IPN_SECRET is not set");
    return false;
  }
  if (!signature) return false;

  try {
    const parsed = JSON.parse(rawBody);
    const sortedJson = JSON.stringify(sortObjectKeys(parsed));
    const computed = crypto
      .createHmac("sha512", IPN_SECRET)
      .update(sortedJson)
      .digest("hex");

    if (computed.length !== signature.length) return false;
    return crypto.timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch (err) {
    console.error("[nowpayments] signature verify error:", err);
    return false;
  }
}

// ─── Order ID parsing (legacy topup_) ─────────────────
// Subscription order_ids (sub_/dev_) are parsed in subscriptions.ts.
// This legacy parser stays for any old topup_ invoices still in flight.

export function parseOrderId(
  orderId: string,
): { userId: string; timestamp: number } | null {
  if (!orderId?.startsWith("topup_")) return null;
  const rest = orderId.slice("topup_".length);
  const lastUnderscore = rest.lastIndexOf("_");
  if (lastUnderscore <= 0) return null;
  const userId = rest.slice(0, lastUnderscore);
  const ts = Number(rest.slice(lastUnderscore + 1));
  if (!userId || !Number.isFinite(ts)) return null;
  return { userId, timestamp: ts };
}
