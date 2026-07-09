// src/app/api/platega/create/route.ts
//
// Create a Platega payment from the web dashboard.
// Body: { kind: "plan1" | "plan3", term: 1 | 6 | 12, method: "card" | "crypto" }
//       { kind: "device", method: "card" | "crypto" }
// Returns: { paymentUrl, transactionId, amountRub }
//
// method "card"   → Platega 12 «Международная оплата»
// method "crypto" → Platega 13 «Криптовалюта»
// Fulfillment happens in /api/platega/webhook on CONFIRMED.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAccount } from "@/lib/accounts";
import { resolvePlan } from "@/lib/subscriptions";
import { plategaEnabled, PlategaError } from "@/lib/platega";
import { createPlategaPayment, type PlategaPurchase } from "@/lib/platega-order";
import { checkRateLimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  try {
    if (!plategaEnabled()) {
      return NextResponse.json(
        { error: "Platega payments are not configured" },
        { status: 503 },
      );
    }

    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.userId;

    const rl = await checkRateLimit(`platega:${userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Too many attempts. Wait ~${rl.resetIn}s.` },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      kind?: string;
      term?: number;
      method?: string;
    };

    const method = body.method === "crypto" ? "crypto" : body.method === "card" ? "card" : null;
    if (!method) {
      return NextResponse.json({ error: "Invalid method" }, { status: 400 });
    }

    let purchase: PlategaPurchase;
    if (body.kind === "device") {
      purchase = { type: "device" };
    } else {
      const plan = resolvePlan(String(body.kind), Number(body.term));
      if (!plan) {
        return NextResponse.json({ error: "Invalid plan or term" }, { status: 400 });
      }
      purchase = { type: "plan", kind: plan.kind, term: plan.term };
    }

    const account = await getAccount(userId);
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const result = await createPlategaPayment(userId, purchase, method);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PlategaError) {
      console.error("[platega-create] provider error:", error.message);
      return NextResponse.json({ error: "Payment provider error" }, { status: 502 });
    }
    console.error("[platega-create] unhandled error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
