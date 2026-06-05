// src/app/api/payment/crypto-webhook/route.ts
//
// NOWPayments IPN webhook receiver.
//
// Security model:
//   1. Verify HMAC-SHA512 signature against IPN secret (header
//      `x-nowpayments-sig`). Reject 401 on mismatch.
//   2. ATOMIC dedup via `crypto_payment_done:<payment_id>` SET NX (90 days).
//      Reserved BEFORE any side effect.
//   3. userId resolved from `parseOrderId(payload.order_id)` - order_id is
//      formed by us at invoice creation and round-trips through NOWPayments.

import { NextRequest, NextResponse } from "next/server";
import {
  getAccount,
  getProfiles,
  getUserRecord,
  markTopup,
} from "@/lib/accounts";
import { addBalance, getBalanceInfo, getTopupBonus } from "@/lib/balance";
import { grantReferralReward } from "@/lib/referrals";
import {
  parseOrderId,
  verifyIpnSignature,
  type IpnPayload,
} from "@/lib/nowpayments";
import { reserveDedupKey } from "@/lib/dedup";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const DEDUP_TTL_SEC = 90 * 86400;

async function notifyTelegram(userId: string, message: string): Promise<void> {
  try {
    let chatId: string | null = null;
    if (userId.startsWith("tg_")) chatId = userId.slice(3);
    else {
      const user = await getUserRecord(userId);
      if (user?.telegramId) chatId = String(user.telegramId);
    }
    if (!chatId || !BOT_TOKEN) return;
    await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
      timeoutMs: 5000,
    });
  } catch (err) {
    console.error("[crypto-webhook] notifyTelegram error:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-nowpayments-sig") || "";

    if (!verifyIpnSignature(rawBody, signature)) {
      console.warn("[crypto-webhook] invalid signature, body prefix:", rawBody.slice(0, 100));
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    let payload: IpnPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    console.log("[crypto-webhook] event", {
      payment_id: payload.payment_id,
      status: payload.payment_status,
      order_id: payload.order_id,
      price_amount: payload.price_amount,
      price_currency: payload.price_currency,
    });

    if (payload.payment_status !== "finished") {
      return NextResponse.json({ ok: true, ignored: "not finished" });
    }

    const parsed = parseOrderId(payload.order_id);
    if (!parsed) {
      console.warn("[crypto-webhook] unrecognized order_id:", payload.order_id);
      return NextResponse.json({ ok: true, ignored: "unknown order_id" });
    }
    const { userId } = parsed;

    const paymentId = String(payload.payment_id);
    if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(paymentId)) {
      console.warn("[crypto-webhook] suspicious payment_id rejected:", paymentId);
      return NextResponse.json({ ok: true, ignored: "bad payment_id" });
    }

    // ATOMIC DEDUP: must happen before any side effect.
    const reserved = await reserveDedupKey(
      `crypto_payment_done:${paymentId}`,
      DEDUP_TTL_SEC,
    );
    if (!reserved) {
      return NextResponse.json({ ok: true, ignored: "duplicate" });
    }

    const account = await getAccount(userId);
    if (!account) {
      console.warn("[crypto-webhook] account not found:", userId);
      return NextResponse.json({ ok: true, ignored: "account not found" });
    }

    const amount = Number(payload.price_amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: true, ignored: "bad amount" });
    }

    const bonus = getTopupBonus(amount);
    const totalCredit = amount + bonus;

    const updated = await addBalance(userId, totalCredit);
    const profiles = await getProfiles(userId);
    const bal = getBalanceInfo(updated, profiles.length);

    await markTopup(userId);

    const lines = [
      `✅ <b>Баланс пополнен!</b>`,
      ``,
      `💰 +${amount} ₽ (криптой)`,
    ];
    if (bonus > 0) lines.push(`🎁 Бонус: +${bonus} ₽`);
    lines.push(`💳 Баланс: <b>${bal.balance.toFixed(2)} ₽</b>`);
    if (bal.dailyRate > 0) lines.push(`📅 Хватит на ~${bal.daysRemaining} дн.`);
    await notifyTelegram(userId, lines.join("\n"));

    try {
      const ref = await grantReferralReward(userId);
      if (ref.rewarded && ref.referrerId && ref.bonus) {
        await addBalance(ref.referrerId, ref.bonus);
        await notifyTelegram(
          ref.referrerId,
          [
            `🎁 <b>Реферальный бонус!</b>`,
            ``,
            `Ваш друг пополнил баланс.`,
            `Вам начислено <b>+${ref.bonus} ₽</b> на баланс!`,
          ].join("\n")
        );
      }
    } catch (err) {
      console.error("[crypto-webhook] referral reward error:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[crypto-webhook] unhandled error:", error);
    return NextResponse.json({ ok: true });
  }
}
