// src/app/api/balance/topup-enot/route.ts
//
// Create an Enot.io invoice for balance top-up.
// Body: { amount: number, kind: "rub" | "crypto" }

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAccount, getUserRecord } from "@/lib/accounts";
import { redis } from "@/lib/redis";
import { randomUUID } from "crypto";
import {
  MIN_TOPUP_ENOT_RUB,
  MIN_TOPUP_ENOT_CRYPTO,
  MAX_TOPUP,
  getTopupBonus,
} from "@/lib/balance";
import { createEnotInvoice, type EnotKind } from "@/lib/enot";
import { checkRateLimit } from "@/lib/ratelimit";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://proxysvpn.com";
const MAPPING_TTL_SEC = 72 * 60 * 60; // 72h - covers slow BTC confirmations

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.userId;

    // Rate limit: 10 invoice creations per minute per user.
    const rl = await checkRateLimit(`topup-enot:${userId}`, 10, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Слишком много попыток. Подождите ~${rl.resetIn} сек.` },
        { status: 429 },
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      amount?: unknown;
      kind?: unknown;
    };

    const num = Number(body.amount);
    const kind: EnotKind = body.kind === "crypto" ? "crypto" : "rub";

    const minTopup =
      kind === "crypto" ? MIN_TOPUP_ENOT_CRYPTO : MIN_TOPUP_ENOT_RUB;

    if (!Number.isFinite(num) || num < minTopup || num > MAX_TOPUP) {
      return NextResponse.json(
        { error: `Сумма от ${minTopup} до ${MAX_TOPUP} ₽` },
        { status: 400 },
      );
    }

    const account = await getAccount(userId);
    if (!account) {
      return NextResponse.json({ error: "Аккаунт не найден" }, { status: 404 });
    }

    const user = await getUserRecord(userId);
    const email = user?.email || undefined;
    const orderId = randomUUID();

    const bonus = getTopupBonus(num);
    const comment =
      bonus > 0
        ? `ПроксисВпнович — пополнение ${num} ₽ (+${bonus} ₽ бонус)`
        : `ПроксисВпнович — пополнение баланса ${num} ₽`;

    const invoice = await createEnotInvoice({
      amountRub: num,
      orderId,
      userId,
      email,
      kind,
      successUrl: `${SITE_URL}/dashboard?topupenot=1`,
      failUrl: `${SITE_URL}/dashboard?topupenot=fail`,
      hookUrl: `${SITE_URL}/api/payment/enot-webhook`,
      comment,
    });

    // Server-side mapping for the webhook to credit the right user with the
    // right amount. Webhook MUST NOT trust payload-only fields.
    await redis.set(
      `enot_invoice:${invoice.invoiceId}`,
      JSON.stringify({
        userId,
        amount: num,
        kind,
        orderId,
        createdAt: Date.now(),
      }),
      { ex: MAPPING_TTL_SEC },
    );
    await redis.set(
      `enot_order:${orderId}`,
      JSON.stringify({ userId, amount: num, kind }),
      { ex: MAPPING_TTL_SEC },
    );

    return NextResponse.json({
      paymentUrl: invoice.paymentUrl,
      invoiceId: invoice.invoiceId,
      minTopup,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[balance/topup-enot]", detail);
    // DO NOT echo upstream error messages to the user (may leak details).
    return NextResponse.json(
      { error: "Не удалось создать платёж. Попробуйте позже." },
      { status: 500 },
    );
  }
}
