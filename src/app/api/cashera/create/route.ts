// src/app/api/cashera/create/route.ts
//
// Create a Cashera CARD payment for a PLAN or DEVICE ADD-ON purchase.
// Body: { kind: "plan1" | "plan3", term: 1 | 6 | 12 }   — main plan
//       { kind: "device" }                              — +1 device, 30 days
// Returns: { paymentUrl, uuid, expiresAt, amountRub, currency }
//
// Prices are USD (server-side PLAN_PRICES); the `mastercard` method accepts
// RUB only, so the charge is converted via Cashera's own rates endpoint
// (see lib/cashera-fx). The exact charged amount is persisted at
// `cashera_order:{externalId}` BEFORE the payment is created — the webhook
// verifies tx.amount/currency against it before granting.
//
// external_id reuses the NOWPayments order_id scheme (sub_/dev_), so
// /api/cashera/webhook decodes WHAT to grant statelessly via parseSubOrderId.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAccount } from "@/lib/accounts";
import {
  resolvePlan,
  buildPlanOrderId,
  buildDeviceOrderId,
  DEVICE_ADDON_PRICE,
  DEVICE_ADDON_DAYS,
} from "@/lib/subscriptions";
import {
  createPayment,
  CasheraError,
  type CasheraOrderRecord,
} from "@/lib/cashera";
import { usdToRubMinor } from "@/lib/cashera-fx";
import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/ratelimit";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://kovravpn.com";
const PAYMENT_METHOD = process.env.CASHERA_PAYMENT_METHOD || "";
const ORDER_TTL_SEC = 7 * 86400; // webhook verification window
const TX_PTR_TTL_SEC = 72 * 60 * 60; // uuid→externalId ops pointer

export async function POST(req: NextRequest) {
  try {
    if (!PAYMENT_METHOD) {
      return NextResponse.json(
        { error: "Card payments are not configured" },
        { status: 503 },
      );
    }

    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.userId;

    const rl = await checkRateLimit(`cashera:${userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Wait ~${rl.resetIn}s.` },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      kind?: string;
      term?: number;
    };

    let externalId: string;
    let amountUsd: number;
    let label: string;
    let term: number | undefined;

    if (body.kind === "device") {
      externalId = buildDeviceOrderId(userId);
      amountUsd = DEVICE_ADDON_PRICE;
      label = `+1 device · ${DEVICE_ADDON_DAYS} days`;
    } else {
      const plan = resolvePlan(String(body.kind), Number(body.term));
      if (!plan) {
        return NextResponse.json(
          { error: "Invalid plan or term" },
          { status: 400 },
        );
      }
      externalId = buildPlanOrderId(userId, plan.kind, plan.term);
      amountUsd = plan.price;
      term = plan.term;
      label = `${plan.kind === "plan3" ? "3 devices" : "1 device"} · ${plan.term} mo`;
    }

    const account = await getAccount(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    // USD → RUB by Cashera's own merchant rate (settlement-consistent).
    const fx = await usdToRubMinor(amountUsd, PAYMENT_METHOD);
    if (fx.stale) {
      console.warn("[cashera-create] using stale fx rate", {
        rubPerUsd: fx.rubPerUsd,
      });
    }

    // Persist the exact expected charge BEFORE creating the payment —
    // the webhook refuses to grant without this record.
    const order: CasheraOrderRecord = {
      userId,
      kind: String(body.kind),
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

    const tx = await createPayment({
      amountMinor: fx.amountMinor,
      currency: "RUB",
      paymentMethod: PAYMENT_METHOD,
      externalId,
      description: `Kovra ${label}`,
      callbackUrl: `${SITE_URL}/api/cashera/webhook`,
      successUrl: `${SITE_URL}/dashboard?paid=1`,
      failUrl: `${SITE_URL}/dashboard`,
    });

    // uuid → externalId pointer for manual reconciliation.
    await redis.set(`cashera_tx:${tx.uuid}`, externalId, {
      ex: TX_PTR_TTL_SEC,
    });

    return NextResponse.json({
      paymentUrl: tx.payment_url,
      uuid: tx.uuid,
      expiresAt: tx.expires_at ?? null,
      amountRub: fx.amountRub,
      currency: "RUB",
    });
  } catch (error) {
    if (error instanceof CasheraError) {
      // API rejected the request (bad method code / currency / amount).
      console.error("[cashera-create] api error", error.status, error.body);
    } else {
      console.error("[cashera-create]", error);
    }
    return NextResponse.json(
      { error: "Could not create payment. Try again later." },
      { status: 500 },
    );
  }
}
