// src/lib/nowpayments.ts
import crypto from "crypto";

const API_BASE = "https://api.nowpayments.io/v1";
const API_KEY = process.env.NOWPAYMENTS_API_KEY || "";
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://proxysvpn.com";
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "proxysvpn_bot";

// ─── Types ────────────────────────────────────────────

export interface CreateCryptoInvoiceParams {
  userId: string;
  amountRub: number;
  description?: string;
  /** Where the invoice was created from — affects success/cancel URLs. Default: "bot". */
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
 * Create a NOWPayments invoice (hosted checkout page).
 * User picks the crypto on their page. On payment, webhook fires.
 */
export async function createCryptoInvoice(
  params: CreateCryptoInvoiceParams
): Promise<CryptoInvoice> {
  if (!API_KEY) throw new Error("NOWPAYMENTS_API_KEY is not set");

  const orderId = `topup_${params.userId}_${Date.now()}`;
  const source = params.source || "bot";

  const successUrl = source === "web"
    ? `${SITE_URL}/dashboard?topupcrypto=1`
    : `https://t.me/${BOT_USERNAME}?start=paidcrypto`;
  const cancelUrl = source === "web"
    ? `${SITE_URL}/dashboard`
    : `https://t.me/${BOT_USERNAME}`;

  const body = {
    price_amount: params.amountRub,
    price_currency: "rub",
    order_id: orderId,
    order_description:
      params.description || `ProxysVPN — пополнение баланса ${params.amountRub} ₽`,
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
      `NOWPayments: malformed response: ${JSON.stringify(data).slice(0, 200)}`
    );
  }

  return {
    invoiceUrl: String(data.invoice_url),
    invoiceId: String(data.id),
    orderId,
  };
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
      Buffer.from(signature, "hex")
    );
  } catch (err) {
    console.error("[nowpayments] signature verify error:", err);
    return false;
  }
}

// ─── Order ID parsing ─────────────────────────────────

/** Parse our internal orderId: "topup_<userId>_<timestamp>".
 *  userId itself may contain underscores (e.g. "tg_12345"), so use lastIndexOf. */
export function parseOrderId(
  orderId: string
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
