// src/app/api/cashera/create/route.ts
//
// Create a Cashera CARD payment (web dashboard).
// Body: { kind: "plan1" | "plan3", term: 1 | 6 | 12 }   — main plan
//       { kind: "device" }                              — +1 device, 30 days
// Returns: { paymentUrl, uuid, expiresAt, amountRub, currency }
//
// Creation logic (FX, order record, tx pointer) lives in lib/cashera-order
// and is shared with the Telegram bot.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAccount } from "@/lib/accounts";
import { resolvePlan } from "@/lib/subscriptions";
import { CasheraError } from "@/lib/cashera";
import {
  createCardPayment,
  cardPaymentsEnabled,
  type CardPurchase,
} from "@/lib/cashera-order";
import { checkRateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  try {
    if (!cardPaymentsEnabled()) {
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

    let purchase: CardPurchase;
    if (body.kind === "device") {
      purchase = { type: "device" };
    } else {
      const plan = resolvePlan(String(body.kind), Number(body.term));
      if (!plan) {
        return NextResponse.json(
          { error: "Invalid plan or term" },
          { status: 400 },
        );
      }
      purchase = { type: "plan", kind: plan.kind, term: plan.term };
    }

    const account = await getAccount(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const res = await createCardPayment(userId, purchase, "web");
    return NextResponse.json({
      paymentUrl: res.paymentUrl,
      uuid: res.uuid,
      expiresAt: res.expiresAt,
      amountRub: res.amountRub,
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
