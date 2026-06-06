// src/app/api/subscribe/device/route.ts
//
// Create a crypto invoice (USD) for a DEVICE ADD-ON.
// One add-on = +1 device slot, fixed 30 days, $5, independent of the main
// plan (runs its own window even if the plan is expired).
// Body: {} (no params). Returns: { paymentUrl, invoiceId }

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAccount } from "@/lib/accounts";
import {
  DEVICE_ADDON_PRICE,
  DEVICE_ADDON_DAYS,
  buildDeviceOrderId,
} from "@/lib/subscriptions";
import { createInvoice } from "@/lib/nowpayments";
import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/ratelimit";

const MAPPING_TTL_SEC = 72 * 60 * 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.userId;

    const rl = await checkRateLimit(`subscribe-device:${userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Wait ~${rl.resetIn}s.` },
        { status: 429 },
      );
    }

    const account = await getAccount(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const orderId = buildDeviceOrderId(userId);
    const invoice = await createInvoice({
      orderId,
      amountUsd: DEVICE_ADDON_PRICE,
      description: `Kovra +1 device · ${DEVICE_ADDON_DAYS} days`,
      source: "web",
    });

    await redis.set(
      `sub_invoice:${invoice.invoiceId}`,
      JSON.stringify({
        userId,
        kind: "device",
        slots: 1,
        days: DEVICE_ADDON_DAYS,
        priceUsd: DEVICE_ADDON_PRICE,
        orderId,
        createdAt: Date.now(),
      }),
      { ex: MAPPING_TTL_SEC },
    );

    return NextResponse.json({
      paymentUrl: invoice.invoiceUrl,
      invoiceId: invoice.invoiceId,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[subscribe/device]", detail);
    return NextResponse.json(
      { error: "Could not create payment. Try again later." },
      { status: 500 },
    );
  }
}
