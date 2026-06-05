// src/app/api/balance/topup-cryptobot/route.ts
//
// Create a CryptoBot (@send) invoice for balance top-up from web dashboard.
// Body: { amount: number }

import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getSessionFromRequest } from "@/lib/session";
import { MIN_TOPUP_CRYPTOBOT, MAX_TOPUP } from "@/lib/balance";
import { createCryptoBotInvoice } from "@/lib/cryptobot";
import { checkRateLimit } from "@/lib/ratelimit";

const MAPPING_TTL_SEC = 24 * 60 * 60;

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.userId;

    const rl = await checkRateLimit(`topup-cryptobot:${userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
    }

    const body = (await req.json().catch(() => ({}))) as { amount?: unknown };
    const num = Number(body?.amount);

    if (!Number.isFinite(num) || num < MIN_TOPUP_CRYPTOBOT || num > MAX_TOPUP) {
      return NextResponse.json(
        { error: `Сумма от ${MIN_TOPUP_CRYPTOBOT} до ${MAX_TOPUP} ₽` },
        { status: 400 },
      );
    }

    const invoice = await createCryptoBotInvoice({
      userId,
      amountRub: num,
      source: "web",
    });

    await redis.set(
      `cryptobot_invoice:${invoice.invoiceId}`,
      JSON.stringify({ userId, orderId: invoice.orderId, amountRub: num }),
      { ex: MAPPING_TTL_SEC },
    );

    return NextResponse.json({
      ok: true,
      payUrl: invoice.payUrl,
      miniAppUrl: invoice.miniAppUrl,
      invoiceId: invoice.invoiceId,
      minTopup: MIN_TOPUP_CRYPTOBOT,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    console.error("[balance/topup-cryptobot]", detail);
    return NextResponse.json({ error: "Не удалось создать счёт" }, { status: 500 });
  }
}
