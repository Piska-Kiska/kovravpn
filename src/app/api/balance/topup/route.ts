// src/app/api/balance/topup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAccount, getUserRecord, hasTopup } from "@/lib/accounts";
import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";
import { MIN_TOPUP_FIRST, MIN_TOPUP, MAX_TOPUP, getTopupBonus } from "@/lib/balance";
import { checkRateLimit } from "@/lib/ratelimit";

const SHOP_ID = process.env.YOOKASSA_SHOP_ID || "";
const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || "";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://proxysvpn.com";
const MAPPING_TTL_SEC = 72 * 60 * 60; // 72h

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.userId;

    // Rate limit: 10 invoice creations per minute per user.
    const rl = await checkRateLimit(`topup-yk:${userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Слишком много попыток. Подождите ~${rl.resetIn} сек.` },
        { status: 429 },
      );
    }

    const { amount } = await req.json();
    const num = Number(amount);

    const isFirst = !(await hasTopup(userId));
    const minTopup = isFirst ? MIN_TOPUP_FIRST : MIN_TOPUP;

    if (!num || num < minTopup || num > MAX_TOPUP) {
      return NextResponse.json({ error: `Сумма от ${minTopup} до ${MAX_TOPUP} ₽` }, { status: 400 });
    }

    const account = await getAccount(userId);
    if (!account) return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });

    const user = await getUserRecord(userId);
    const email = user?.email || undefined;

    const bonus = getTopupBonus(num);
    const idempotenceKey = randomUUID();
    const auth = Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString("base64");

    const description = bonus > 0
      ? `ПроксисВпнович — пополнение ${num} ₽ (+${bonus} ₽ бонус)`
      : `ПроксисВпнович — пополнение баланса ${num} ₽`;

    const body = {
      amount: { value: num.toFixed(2), currency: "RUB" },
      confirmation: { type: "redirect", return_url: `${SITE_URL}/dashboard?topup=1` },
      capture: true,
      description,
      metadata: { userId, type: "topup", amount: String(num) },
      receipt: {
        customer: { email: email || "noreply@proxysvpn.com" },
        items: [{
          description: `Пополнение баланса — ${num} ₽`,
          amount: { value: num.toFixed(2), currency: "RUB" },
          vat_code: 1,
          quantity: "1",
          payment_subject: "service",
          payment_mode: "full_payment",
        }],
      },
    };

    const res = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "Idempotence-Key": idempotenceKey,
      },
      body: JSON.stringify(body),
      // Vercel fetch has its own platform timeout; we keep this short
      // explicit one too so a stalled YK doesn't pin our function.
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) {
      const err = await res.text();
      // NOTE: caller MUST NOT echo this to end users (may leak details).
      throw new Error(`YooKassa: ${err}`);
    }

    const payment = await res.json();

    await redis.set(`payment:${payment.id}`, JSON.stringify({
      userId, type: "topup", amount: num, createdAt: Date.now(),
    }), { ex: MAPPING_TTL_SEC });

    return NextResponse.json({
      paymentUrl: payment.confirmation?.confirmation_url,
      paymentId: payment.id,
      isFirst,
      minTopup,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[balance/topup]", detail);
    // DO NOT echo upstream error message to the user.
    return NextResponse.json(
      { error: "Не удалось создать платёж. Попробуйте позже." },
      { status: 500 },
    );
  }
}
