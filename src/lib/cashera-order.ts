// src/lib/cashera-order.ts
//
// Shared creation of Cashera CARD payments for every entry point (web
// dashboard route, Telegram bot). Prices are USD; the mastercard method
// accepts RUB only, so the charge is converted via lib/cashera-fx using
// Cashera's own merchant rate. The exact expected charge is persisted at
// `cashera_order:{externalId}` BEFORE the payment is created — the webhook
// refuses to grant/credit anything without this record.
//
// external_id encodes WHAT was bought using the existing order schemes:
//   sub_<kind>_<term>_<userId>_<ts> | dev_<userId>_<ts> | topup_<userId>_<ts>

import { redis } from "@/lib/redis";
import {
  resolvePlan,
  buildPlanOrderId,
  buildDeviceOrderId,
  DEVICE_ADDON_PRICE,
  DEVICE_ADDON_DAYS,
  type PlanKind,
  type Term,
} from "@/lib/subscriptions";
import { buildTopupOrderId } from "@/lib/bot-wallet";
import { createPayment, type CasheraOrderRecord } from "@/lib/cashera";
import { usdToRubMinor } from "@/lib/cashera-fx";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kovravpn.com";
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "kovravpn_bot";
const PAYMENT_METHOD = process.env.CASHERA_PAYMENT_METHOD || "";
const ORDER_TTL_SEC = 7 * 86400; // webhook verification window
const TX_PTR_TTL_SEC = 72 * 60 * 60; // uuid→externalId ops pointer

export type CardPurchase =
  | { type: "plan"; kind: PlanKind; term: Term }
  | { type: "device" }
  | { type: "topup"; amountUsd: number };

export interface CardPaymentResult {
  paymentUrl: string;
  uuid: string;
  expiresAt: string | null;
  amountRub: number; // whole rubles the client will be charged
  amountMinor: number;
}

export function cardPaymentsEnabled(): boolean {
  return Boolean(PAYMENT_METHOD);
}

export async function createCardPayment(
  userId: string,
  purchase: CardPurchase,
  source: "web" | "bot",
): Promise<CardPaymentResult> {
  if (!PAYMENT_METHOD) throw new Error("CASHERA_PAYMENT_METHOD is not set");

  let externalId: string;
  let amountUsd: number;
  let label: string;
  let kind: CasheraOrderRecord["kind"];
  let term: number | undefined;

  if (purchase.type === "plan") {
    const plan = resolvePlan(purchase.kind, purchase.term);
    if (!plan) throw new Error(`invalid plan ${purchase.kind}/${purchase.term}`);
    externalId = buildPlanOrderId(userId, plan.kind, plan.term);
    amountUsd = plan.price;
    kind = plan.kind;
    term = plan.term;
    label = `${plan.kind === "plan3" ? "3 devices" : "1 device"} · ${plan.term} mo`;
  } else if (purchase.type === "device") {
    externalId = buildDeviceOrderId(userId);
    amountUsd = DEVICE_ADDON_PRICE;
    kind = "device";
    label = `+1 device · ${DEVICE_ADDON_DAYS} days`;
  } else {
    if (
      !Number.isFinite(purchase.amountUsd) ||
      purchase.amountUsd < 1 ||
      purchase.amountUsd > 10_000
    ) {
      throw new Error(`invalid topup amount: ${purchase.amountUsd}`);
    }
    externalId = buildTopupOrderId(userId);
    amountUsd = purchase.amountUsd;
    kind = "topup";
    label = `Balance top-up $${amountUsd.toFixed(2)}`;
  }

  // USD → RUB by Cashera's own merchant rate (settlement-consistent).
  const fx = await usdToRubMinor(amountUsd, PAYMENT_METHOD);
  if (fx.stale) {
    console.warn("[cashera-order] using stale fx rate", {
      rubPerUsd: fx.rubPerUsd,
    });
  }

  // Persist the exact expected charge BEFORE creating the payment.
  const order: CasheraOrderRecord = {
    userId,
    kind,
    term,
    amountUsd,
    amountMinor: fx.amountMinor,
    currency: "RUB",
    rubPerUsd: fx.rubPerUsd,
    createdAt: Date.now(),
  };
  await redis.set(`cashera_order:${externalId}`, JSON.stringify(order), {
    ex: ORDER_TTL_SEC,
  });

  const botUrl = `https://t.me/${BOT_USERNAME}`;
  const tx = await createPayment({
    amountMinor: fx.amountMinor,
    currency: "RUB",
    paymentMethod: PAYMENT_METHOD,
    externalId,
    description: `Kovra ${label}`,
    callbackUrl: `${SITE_URL}/api/cashera/webhook`,
    successUrl: source === "bot" ? botUrl : `${SITE_URL}/dashboard?paid=1`,
    failUrl: source === "bot" ? botUrl : `${SITE_URL}/dashboard`,
  });
  if (!tx.payment_url) {
    throw new Error(`cashera create returned no payment_url (uuid ${tx.uuid})`);
  }

  // uuid → externalId pointer for manual reconciliation.
  await redis.set(`cashera_tx:${tx.uuid}`, externalId, { ex: TX_PTR_TTL_SEC });

  return {
    paymentUrl: tx.payment_url,
    uuid: tx.uuid,
    expiresAt: tx.expires_at ?? null,
    amountRub: fx.amountRub,
    amountMinor: fx.amountMinor,
  };
}
