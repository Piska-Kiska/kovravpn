// src/lib/platega-order.ts
//
// Shared creation of Platega payments (card = method 12, crypto = method 13)
// for the web dashboard. Prices are USD; Platega is charged in RUB, so the
// amount is converted via lib/cashera-fx (Cashera merchant rate, Redis-cached
// with stale fallback). TODO: switch the rate source to Platega's own
// GET /conversions once the endpoint is confirmed with the manager — until
// then the margin (not correctness) depends on the Cashera rate.
//
// externalId reuses the existing order schemes:
//   sub_<kind>_<term>_<userId>_<ts> | dev_<userId>_<ts>
// Records:
//   platega_order:{externalId}  — exact expected charge (webhook refuses
//                                 to grant without it), TTL 7d
//   platega_tx:{transactionId}  — pointer to externalId (callback carries
//                                 only the Platega tx id), TTL 7d

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
import { usdToRubMinor } from "@/lib/cashera-fx";
import {
  createPlategaTransaction,
  PLATEGA_METHOD_CARD,
  PLATEGA_METHOD_CRYPTO,
  type PlategaOrderRecord,
} from "@/lib/platega";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kovravpn.com";
const FX_METHOD = process.env.CASHERA_PAYMENT_METHOD || "mastercard";
const ORDER_TTL_SEC = 7 * 86400;

export type PlategaPurchase =
  | { type: "plan"; kind: PlanKind; term: Term }
  | { type: "device" };

export interface PlategaPaymentResult {
  paymentUrl: string;
  transactionId: string;
  amountRub: number;
}

export async function createPlategaPayment(
  userId: string,
  purchase: PlategaPurchase,
  method: "card" | "crypto",
): Promise<PlategaPaymentResult> {
  let externalId: string;
  let amountUsd: number;
  let label: string;
  let kind: PlategaOrderRecord["kind"];
  let term: number | undefined;

  if (purchase.type === "plan") {
    const plan = resolvePlan(purchase.kind, purchase.term);
    if (!plan) throw new Error(`invalid plan ${purchase.kind}/${purchase.term}`);
    externalId = buildPlanOrderId(userId, plan.kind, plan.term);
    amountUsd = plan.price;
    kind = plan.kind;
    term = plan.term;
    label = `${plan.kind === "plan3" ? "3 devices" : "1 device"} · ${plan.term} mo`;
  } else {
    externalId = buildDeviceOrderId(userId);
    amountUsd = DEVICE_ADDON_PRICE;
    kind = "device";
    label = `+1 device · ${DEVICE_ADDON_DAYS} days`;
  }

  const fx = await usdToRubMinor(amountUsd, FX_METHOD);
  if (fx.stale) {
    console.warn("[platega-order] using stale fx rate", { rubPerUsd: fx.rubPerUsd });
  }

  const paymentMethod =
    method === "card" ? PLATEGA_METHOD_CARD : PLATEGA_METHOD_CRYPTO;

  // Persist the exact expected charge BEFORE creating the payment.
  const order: PlategaOrderRecord = {
    userId,
    kind,
    term,
    amountUsd,
    amountRub: fx.amountRub,
    amountMinor: fx.amountMinor,
    currency: "RUB",
    rubPerUsd: fx.rubPerUsd,
    method: paymentMethod,
    createdAt: Date.now(),
  };
  await redis.set(`platega_order:${externalId}`, JSON.stringify(order), {
    ex: ORDER_TTL_SEC,
  });

  const tx = await createPlategaTransaction({
    paymentMethod,
    amountRub: fx.amountRub,
    description: `Kovra ${label}`,
    payload: externalId,
    returnUrl: `${SITE_URL}/dashboard?paid=1`,
    failedUrl: `${SITE_URL}/dashboard`,
  });

  // Callback carries only Platega's tx id — persist the pointer.
  await redis.set(`platega_tx:${tx.transactionId}`, externalId, {
    ex: ORDER_TTL_SEC,
  });

  return {
    paymentUrl: tx.redirect,
    transactionId: tx.transactionId,
    amountRub: fx.amountRub,
  };
}
