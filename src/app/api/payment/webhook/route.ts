// src/app/api/payment/webhook/route.ts
//
// YooKassa webhook receiver.
//
// Security model:
//   1. We re-verify every payment against YK API via getPayment(). This uses
//      our shop's secret, so YK will only confirm payments belonging to us
//      (404 otherwise) - that's effectively our authentication.
//   2. ATOMIC dedup via `payment_done:<id>` SET NX (90 days). The key is
//      reserved BEFORE any side effect, so concurrent retries from YK
//      cannot both credit the user.
//
// Note: YK metadata.userId is set by us at payment creation time and round-
// trips through YK. We trust it because getPayment() proves the payment was
// created in our shop with our key.

import { NextRequest, NextResponse } from "next/server";
import { getAccount, getProfiles, getUserRecord, markTopup } from "@/lib/accounts";
import { getPayment } from "@/lib/yookassa";
import { addBalance, getBalanceInfo, getTopupBonus } from "@/lib/balance";
import { grantReferralReward } from "@/lib/referrals";
import { reserveDedupKey } from "@/lib/dedup";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const DEDUP_TTL_SEC = 90 * 86400;

async function notifyTelegram(userId: string, message: string) {
  try {
    let chatId: string | null = null;
    if (userId.startsWith("tg_")) chatId = userId.slice(3);
    else {
      const user = await getUserRecord(userId);
      if (user?.telegramId) chatId = String(user.telegramId);
    }
    if (!chatId) return;
    await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      timeoutMs: 5000,
    });
  } catch (err) {
    console.error("[yk-webhook] notifyTelegram error:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.event !== "payment.succeeded" || !body.object?.id) {
      return NextResponse.json({ ok: true });
    }

    const paymentId = String(body.object.id);

    // Reject obviously malformed IDs to avoid weird Redis keys / bad URL paths.
    if (!/^[a-zA-Z0-9_\-]{8,128}$/.test(paymentId)) {
      console.warn("[yk-webhook] suspicious paymentId rejected:", paymentId);
      return NextResponse.json({ ok: true });
    }

    const verified = await getPayment(paymentId);
    if (verified.status !== "succeeded") return NextResponse.json({ ok: true });

    const userId = verified.metadata?.userId;
    if (!userId) return NextResponse.json({ ok: true });

    const amount = parseFloat(verified.metadata?.amount || "0");
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: true });
    }

    // ATOMIC DEDUP: must happen before any side effect.
    const reserved = await reserveDedupKey(`payment_done:${paymentId}`, DEDUP_TTL_SEC);
    if (!reserved) {
      // Already processed by a concurrent retry / earlier delivery.
      return NextResponse.json({ ok: true });
    }

    const account = await getAccount(userId);
    if (!account) return NextResponse.json({ ok: true });

    const bonus = getTopupBonus(amount);
    const totalCredit = amount + bonus;

    const updated = await addBalance(userId, totalCredit);
    const profiles = await getProfiles(userId);
    const bal = getBalanceInfo(updated, profiles.length);

    await markTopup(userId);

    const lines = [
      `✅ <b>Баланс пополнен!</b>`,
      ``,
      `💰 +${amount} ₽`,
    ];
    if (bonus > 0) lines.push(`🎁 Бонус: +${bonus} ₽`);
    lines.push(`💳 Баланс: <b>${bal.balance.toFixed(2)} ₽</b>`);
    if (bal.dailyRate > 0) {
      lines.push(`📅 Хватит на ~${bal.daysRemaining} дн.`);
    }
    await notifyTelegram(userId, lines.join("\n"));

    try {
      const ref = await grantReferralReward(userId);
      if (ref.rewarded && ref.referrerId && ref.bonus) {
        await addBalance(ref.referrerId, ref.bonus);
        await notifyTelegram(ref.referrerId, [
          `🎁 <b>Реферальный бонус!</b>`,
          ``,
          `Ваш друг пополнил баланс.`,
          `Вам начислено <b>+${ref.bonus} ₽</b> на баланс!`,
        ].join("\n"));
      }
    } catch (err) {
      console.error("[yk-webhook] referral reward error:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[yk-webhook] Error:", error);
    return NextResponse.json({ ok: true });
  }
}
