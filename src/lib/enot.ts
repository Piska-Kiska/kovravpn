// src/lib/enot.ts
//
// Enot.io payment integration.
//
// Two key types:
//  - ENOT_API_KEY        - "Секретный ключ", header `x-api-key` for invoice creation.
//  - ENOT_ADDITIONAL_KEY - "Дополнительный ключ", HMAC-SHA256 secret for webhook
//                          signature verification (header `x-api-sha256-signature`).

import { createHmac, timingSafeEqual } from "crypto";
import { fetchWithTimeout } from "./fetch-timeout";

const SHOP_ID = process.env.ENOT_SHOP_ID || "";
const API_KEY = process.env.ENOT_API_KEY || "";
const ADDITIONAL_KEY = process.env.ENOT_ADDITIONAL_KEY || "";

const ENOT_INVOICE_URL = "https://api.enot.io/invoice/create";

/** Payment service codes accepted by include_service / exclude_service. */
export const ENOT_RUB_SERVICES = ["card", "sbp"] as const;
export const ENOT_CRYPTO_SERVICES = [
  "bitcoin",
  "ethereum",
  "usdt_trc20",
  "usdt_erc20",
  "litecoin",
  "trx",
  "dash",
  "xmr",
] as const;

export type EnotKind = "rub" | "crypto";

interface CreateEnotInvoiceParams {
  amountRub: number;
  orderId: string;
  userId: string;
  email?: string;
  kind: EnotKind;
  successUrl: string;
  failUrl: string;
  hookUrl: string;
  comment?: string;
}

interface CreateEnotInvoiceResult {
  invoiceId: string;
  paymentUrl: string;
  amount: string;
  expired: string;
}

interface EnotApiResponse {
  data?: { id?: string; url?: string; amount?: string | number; expired?: string } | null;
  status?: number;
  status_check?: boolean;
  error?: string;
}

/**
 * Create a payment invoice via Enot.io.
 * Throws on any non-2xx response or malformed payload.
 */
export async function createEnotInvoice(
  p: CreateEnotInvoiceParams,
): Promise<CreateEnotInvoiceResult> {
  if (!SHOP_ID) throw new Error("ENOT_SHOP_ID is not configured");
  if (!API_KEY) throw new Error("ENOT_API_KEY is not configured");

  const body = {
    amount: Number(p.amountRub.toFixed(2)),
    order_id: p.orderId,
    currency: "RUB",
    shop_id: SHOP_ID,
    hook_url: p.hookUrl,
    success_url: p.successUrl,
    fail_url: p.failUrl,
    comment: p.comment ?? `ПроксисВпнович — пополнение ${p.amountRub} ₽`,
    custom_fields: JSON.stringify({ userId: p.userId, kind: p.kind }),
    expire: 60,
    include_service:
      p.kind === "rub" ? [...ENOT_RUB_SERVICES] : [...ENOT_CRYPTO_SERVICES],
    ...(p.email ? { email: p.email } : {}),
  };

  const res = await fetchWithTimeout(ENOT_INVOICE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
    timeoutMs: 7000,
  });

  let parsed: EnotApiResponse | null = null;
  try {
    parsed = (await res.json()) as EnotApiResponse;
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed?.data) {
    const reason = parsed?.error || `HTTP ${res.status}`;
    // NOTE: caller MUST NOT echo this message to end users (may leak details).
    throw new Error(`Enot invoice create failed: ${reason}`);
  }

  const d = parsed.data;
  const invoiceId = d.id;
  const paymentUrl = d.url;
  if (!invoiceId || !paymentUrl) {
    throw new Error("Enot invoice create: missing id/url in response");
  }

  return {
    invoiceId,
    paymentUrl,
    amount: String(d.amount ?? p.amountRub),
    expired: String(d.expired ?? ""),
  };
}

/**
 * Verify Enot webhook signature.
 *
 * Enot's docs are inconsistent about JSON canonicalization:
 *  - PHP example uses `json_encode($sorted)` -> compact (no whitespace).
 *  - Python example uses `json.dumps(..., separators=(', ', ': '))` -> spaced.
 *
 * In production both have been observed depending on the integration template.
 * We compute BOTH expected digests and constant-time-compare against each.
 * One match -> valid.
 */
export function verifyEnotSignature(
  bodyParsed: Record<string, unknown>,
  headerSignature: string | null,
): boolean {
  if (!ADDITIONAL_KEY || !headerSignature) return false;

  const sig = headerSignature.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(sig)) return false; // hex only

  const sorted = sortObjectDeep(bodyParsed);

  const candidates = [
    JSON.stringify(sorted),                 // PHP-style: compact
    stableStringifySpaced(sorted),          // Python-style: ", " / ": "
  ];

  for (const canonical of candidates) {
    const expected = createHmac("sha256", ADDITIONAL_KEY)
      .update(canonical, "utf8")
      .digest("hex");
    if (constantTimeEqualHex(expected, sig)) return true;
  }
  return false;
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length || ab.length === 0) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function sortObjectDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => sortObjectDeep(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = sortObjectDeep(obj[k]);
    }
    return out as unknown as T;
  }
  return value;
}

/** Mimics Python's json.dumps(value, sort_keys=True, separators=(', ', ': ')). */
function stableStringifySpaced(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringifySpaced).join(", ") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const entries = Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ": " + stableStringifySpaced(obj[k]));
    return "{" + entries.join(", ") + "}";
  }
  return "null";
}
