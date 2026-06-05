// src/app/api/balance/topup-crypto/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAccount } from "@/lib/accounts";
import { MIN_TOPUP_CRYPTO, MAX_TOPUP } from "@/lib/balance";
import { createCryptoInvoice } from "@/lib/nowpayments";
import { redis } from "@/lib/redis";
import { checkRateLimit } from "@/lib/ratelimit";

const MAPPING_TTL_SEC = 72 * 60 * 60; // 72h - covers slow BTC confirmations

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.userId;

    // Rate limit: 10 invoice creations per minute per user.
    const rl = await checkRateLimit(`topup-crypto:${userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Слишком много попыток. Подождите ~${rl.resetIn} сек.` },
        { status: 429 },
      );
    }

    const { amount } = await req.json();
    const num = Number(amount);

    if (!Number.isFinite(num) || num < MIN_TOPUP_CRYPTO || num > MAX_TOPUP) {
      return NextResponse.json(
        { error: `Сумма от ${MIN_TOPUP_CRYPTO} до ${MAX_TOPUP} ₽` },
        { status: 400 }
      );
    }

    const account = await getAccount(userId);
    if (!account) return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });

    const invoice = await createCryptoInvoice({ userId, amountRub: num, source: "web" });

    await redis.set(
      `crypto_invoice:${invoice.invoiceId}`,
      JSON.stringify({ userId, amount: num, createdAt: Date.now(), orderId: invoice.orderId }),
      { ex: MAPPING_TTL_SEC }
    );

    return NextResponse.json({
      paymentUrl: invoice.invoiceUrl,
      invoiceId: invoice.invoiceId,
      minTopup: MIN_TOPUP_CRYPTO,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[balance/topup-crypto]", detail);
    return NextResponse.json(
      { error: "Не удалось создать платёж. Попробуйте позже." },
      { status: 500 },
    );
  }
}
