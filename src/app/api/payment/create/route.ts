// src/app/api/payment/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getUserRecord } from "@/lib/accounts";
import { createPayment, PLANS } from "@/lib/yookassa";
import { redis } from "@/lib/redis";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { planId } = await req.json();
    if (!planId || !PLANS[planId]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const userId = session.userId;

    // Get user email for receipt
    const user = await getUserRecord(userId);
    const email = user?.email || undefined;

    const { paymentUrl, paymentId } = await createPayment({ userId, planId, email });

    // Store payment reference
    await redis.set(`payment:${paymentId}`, JSON.stringify({
      userId,
      planId,
      createdAt: Date.now(),
    }), { ex: 86400 }); // 24h TTL

    return NextResponse.json({ paymentUrl, paymentId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[payment/create]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
