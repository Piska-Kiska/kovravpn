// src/lib/platega-order.ts
//
// Shared creation of Platega payments (card = method 12, crypto = method 13)
// for the web dashboard. Prices are USD. Invoice currency per Platega
// support: intl acquiring (12) is charged in EUR (converted via
// lib/platega-fx using Platega's own rates endpoint, Redis-cached with a
// stale fallback), crypto (13) is charged in USD as-is (no conversion).
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
import { usdToEur } from "@/lib/platega-fx";
import {
  createPlategaTransaction,
  PLATEGA_METHOD_CARD,
  PLATEGA_METHOD_CRYPTO,
  type PlategaOrderRecord,
} from "@/lib/platega";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kovravpn.com";
const ORDER_TTL_SEC = 7 * 86400;

export type PlategaPurchase =
  | { type: "plan"; kind: PlanKind; term: Term }
  | { type: "device" };

export interface PlategaPaymentResult {
  paymentUrl: string;
  transactionId: string;
  amountCharged: number;
  currency: string;
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

  const paymentMethod =
    method === "card" ? PLATEGA_METHOD_CARD : PLATEGA_METHOD_CRYPTO;

  // card (12): EUR via Platega's own rate; crypto (13): USD passthrough.
  let amountCharged: number;
  let amountMinor: number;
  let currency: string;
  let fxRate: number;
  if (method === "card") {
    const fx = await usdToEur(amountUsd, paymentMethod);
    if (fx.stale) {
      console.warn("[platega-order] using stale fx rate", {
        eurPerUsd: fx.eurPerUsd,
      });
    }
    amountCharged = fx.amountEur;
    amountMinor = fx.amountMinor;
    currency = "EUR";
    fxRate = fx.eurPerUsd;
  } else {
    amountMinor = Math.round(amountUsd * 100);
    amountCharged = amountMinor / 100;
    currency = "USD";
    fxRate = 1;
  }

  // Persist the exact expected charge BEFORE creating the payment.
  const order: PlategaOrderRecord = {
    userId,
    kind,
    term,
    amountUsd,
    amountCharged,
    amountMinor,
    currency,
    fxRate,
    method: paymentMethod,
    createdAt: Date.now(),
  };
  await redis.set(`platega_order:${externalId}`, JSON.stringify(order), {
    ex: ORDER_TTL_SEC,
  });

  const tx = await createPlategaTransaction({
    paymentMethod,
    amount: amountCharged,
    currency,
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
    amountCharged,
    currency,
  };
}
