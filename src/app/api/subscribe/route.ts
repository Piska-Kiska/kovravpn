// src/app/api/subscribe/route.ts
//
// Create a crypto invoice (USD) for a PLAN purchase.
// Body: { kind: "plan1" | "plan3", term: 1 | 6 | 12 }
// Returns: { paymentUrl, invoiceId }
//
// On payment, NOWPayments fires the IPN to /api/payment/crypto-webhook,
// which decodes the order_id and grants the subscription.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAccount } from "@/lib/accounts";
import { resolvePlan, buildPlanOrderId } from "@/lib/subscriptions";
import { createInvoice } from "@/lib/nowpayments";
import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/ratelimit";

const MAPPING_TTL_SEC = 72 * 60 * 60; // 72h, covers slow confirmations

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.userId;

    const rl = await checkRateLimit(`subscribe:${userId}`, 10, 60);
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
    const plan = resolvePlan(String(body.kind), Number(body.term));
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan or term" }, { status: 400 });
    }

    const account = await getAccount(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const orderId = buildPlanOrderId(userId, plan.kind, plan.term);
    const label =
      plan.kind === "plan3" ? "3 devices" : "1 device";
    const invoice = await createInvoice({
      orderId,
      amountUsd: plan.price,
      description: `Kovra ${label} · ${plan.term} mo`,
      source: "web",
    });

    // Store invoice→purchase mapping for reconciliation/debugging.
    await redis.set(
      `sub_invoice:${invoice.invoiceId}`,
      JSON.stringify({
        userId,
        kind: plan.kind,
        term: plan.term,
        slots: plan.slots,
        days: plan.days,
        priceUsd: plan.price,
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
    console.error("[subscribe]", detail);
    return NextResponse.json(
      { error: "Could not create payment. Try again later." },
      { status: 500 },
    );
  }
}
