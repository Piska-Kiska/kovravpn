// src/lib/cryptobot.ts
//
// CryptoBot (@send) Crypto Pay API integration.
// Docs: https://help.send.tg/en/articles/10279948-crypto-pay-api
//
// Required env vars:
//  - CRYPTOBOT_API_TOKEN  - obtained via @CryptoBot -> Crypto Pay -> Create App
//
// Webhook signature is verified using HMAC-SHA256 with secret = SHA256(API_TOKEN).

import { createHash, createHmac, timingSafeEqual } from "crypto";
import { fetchWithTimeout } from "./fetch-timeout";

const API_BASE = "https://pay.crypt.bot/api";
const API_TOKEN = process.env.CRYPTOBOT_API_TOKEN || "";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://proxysvpn.com";
const BOT_USERNAME = process.env.NEXT_PUBLIC_BOT_USERNAME || "proxysvpn_bot";

export const CRYPTOBOT_ACCEPTED_ASSETS = ["USDT", "TON", "BTC"] as const;

export interface CreateCryptoBotInvoiceParams {
  userId: string;
  amountUsd: number;
  /** "web" -> dashboard return; "bot" -> open bot deep-link */
  source?: "web" | "bot";
}

export interface CryptoBotInvoice {
  invoiceId: string;
  payUrl: string;
  miniAppUrl?: string;
  amount: number;
  fiat: "USD";
  orderId: string;
}

interface CryptoBotApiResponse<T> {
  ok: boolean;
  result?: T;
  error?: { code: number; name: string };
}

interface CryptoBotInvoiceResult {
  invoice_id: number;
  hash: string;
  bot_invoice_url: string;
  mini_app_invoice_url?: string;
  web_app_invoice_url?: string;
  amount: string;
  fiat: string;
  status: string;
  payload?: string;
}

/**
 * Create a fiat-RUB invoice on CryptoBot.
 * User pays in any of CRYPTOBOT_ACCEPTED_ASSETS, conversion done by CryptoBot.
 */
export async function createCryptoBotInvoice(
  p: CreateCryptoBotInvoiceParams,
): Promise<CryptoBotInvoice> {
  if (!API_TOKEN) throw new Error("CRYPTOBOT_API_TOKEN is not configured");

  const orderId = `topup_${p.userId}_${Date.now()}`;

  const paidBtnUrl =
    p.source === "web"
      ? `${SITE_URL}/dashboard?topupcryptobot=1`
      : `https://t.me/${BOT_USERNAME}?start=paidcryptobot`;

  const body = {
    currency_type: "fiat",
    fiat: "USD",
    amount: p.amountUsd.toFixed(2),
    accepted_assets: CRYPTOBOT_ACCEPTED_ASSETS.join(","),
    description: `Kovra balance top-up $${p.amountUsd.toFixed(2)}`,
    payload: JSON.stringify({ userId: p.userId, orderId, amountUsd: p.amountUsd }),
    paid_btn_name: "callback",
    paid_btn_url: paidBtnUrl,
    allow_comments: false,
    allow_anonymous: true,
    expires_in: 3600,
  };

  const res = await fetchWithTimeout(`${API_BASE}/createInvoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Crypto-Pay-API-Token": API_TOKEN,
    },
    body: JSON.stringify(body),
    timeoutMs: 10_000,
  });

  let parsed: CryptoBotApiResponse<CryptoBotInvoiceResult> | null = null;
  try {
    parsed = (await res.json()) as CryptoBotApiResponse<CryptoBotInvoiceResult>;
  } catch {
    /* fallthrough */
  }

  if (!res.ok || !parsed?.ok || !parsed.result) {
    const reason = parsed?.error?.name || `HTTP ${res.status}`;
    throw new Error(`CryptoBot createInvoice failed: ${reason}`);
  }

  const r = parsed.result;
  const payUrl = r.mini_app_invoice_url || r.bot_invoice_url;
  if (!r.invoice_id || !payUrl) {
    throw new Error("CryptoBot createInvoice: missing invoice_id/url");
  }

  return {
    invoiceId: String(r.invoice_id),
    payUrl,
    miniAppUrl: r.mini_app_invoice_url,
    amount: p.amountUsd,
    fiat: "USD",
    orderId,
  };
}

/**
 * Verify webhook signature.
 * Header: crypto-pay-api-signature
 * secret = SHA256(API_TOKEN)
 * sig    = HMAC-SHA256(rawBody, secret)
 */
export function verifyCryptoBotSignature(rawBody: string, headerSig: string): boolean {
  if (!API_TOKEN) {
    console.error("[cryptobot] CRYPTOBOT_API_TOKEN is not set");
    return false;
  }
  if (!headerSig || typeof headerSig !== "string") return false;

  try {
    const secret = createHash("sha256").update(API_TOKEN).digest();
    const computed = createHmac("sha256", secret).update(rawBody).digest("hex");

    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(headerSig, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (err) {
    console.error("[cryptobot] signature verify error:", err);
    return false;
  }
}

export interface CryptoBotWebhookPayload {
  invoice_id: number;
  hash: string;
  status: string;
  amount: string;
  fiat?: string;
  paid_amount?: string;
  paid_asset?: string;
  payload?: string;
  paid_at?: string;
}

export interface CryptoBotWebhookUpdate {
  update_id: number;
  update_type: string;
  request_date: string;
  payload: CryptoBotWebhookPayload;
}
