// src/app/api/payment/cryptobot-webhook/route.ts
//
// CryptoBot (@send) webhook receiver.
// Pattern matches enot-webhook / crypto-webhook:
//   1. Verify HMAC-SHA256 signature
//   2. ATOMIC dedup via cryptobot_done:<invoice_id> SET NX (90 days)
//   3. Use Redis mapping cryptobot_invoice:<id> from invoice creation
//      to recover (userId, amountRub) - never trust client payload alone.

import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { addBalance, getTopupBonus } from "@/lib/balance";
import { getAccount, getUserRecord } from "@/lib/accounts";
import { reserveDedupKey } from "@/lib/dedup";
import { grantReferralReward } from "@/lib/referrals";
import {
  verifyCryptoBotSignature,
  type CryptoBotWebhookUpdate,
} from "@/lib/cryptobot";

const DEDUP_TTL_SEC = 90 * 24 * 60 * 60;

interface InvoiceMapping {
  userId: string;
  orderId: string;
  amountRub: number;
}

function asMapping(raw: unknown): InvoiceMapping | null {
  if (!raw) return null;
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (
      obj &&
      typeof obj === "object" &&
      typeof (obj as InvoiceMapping).userId === "string" &&
      typeof (obj as InvoiceMapping).amountRub === "number"
    ) {
      return obj as InvoiceMapping;
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

async function notifyTelegram(userId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  try {
    let chatId: string | null = null;
    if (userId.startsWith("tg_")) {
      chatId = userId.slice(3);
    } else {
      const user = await getUserRecord(userId);
      if (user?.telegramId) chatId = String(user.telegramId);
    }
    if (!chatId) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
  } catch (e) {
    console.error("[cryptobot-webhook] notifyTelegram error:", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const headerSig = req.headers.get("crypto-pay-api-signature") || "";

    if (!verifyCryptoBotSignature(rawBody, headerSig)) {
      console.warn(
        "[cryptobot-webhook] invalid signature, body prefix:",
        rawBody.slice(0, 100),
      );
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }

    let update: CryptoBotWebhookUpdate;
    try {
      update = JSON.parse(rawBody) as CryptoBotWebhookUpdate;
    } catch {
      return NextResponse.json({ error: "bad json" }, { status: 400 });
    }

    if (update.update_type !== "invoice_paid") {
      // Not interested in non-paid updates
      return NextResponse.json({ ok: true });
    }

    const inv = update.payload;
    const invoiceId = String(inv.invoice_id);

    if (inv.status !== "paid") {
      console.warn(
        "[cryptobot-webhook] non-paid status=%s invoice_id=%s",
        inv.status,
        invoiceId,
      );
      return NextResponse.json({ ok: true });
    }

    // Atomic dedup
    const reserved = await reserveDedupKey(
      `cryptobot_done:${invoiceId}`,
      DEDUP_TTL_SEC,
    );
    if (!reserved) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    // Recover trusted (userId, amount) from server-side mapping
    const mapping = asMapping(await redis.get(`cryptobot_invoice:${invoiceId}`));
    if (!mapping) {
      console.error(
        "[cryptobot-webhook] mapping missing/invalid; invoice_id=%s. Manual review required.",
        invoiceId,
      );
      return NextResponse.json({ ok: true, manual: true });
    }

    const { userId, amountRub } = mapping;

    const account = await getAccount(userId);
    if (!account) {
      console.error(
        "[cryptobot-webhook] account not found userId=%s invoice_id=%s",
        userId,
        invoiceId,
      );
      return NextResponse.json({ ok: true, account_missing: true });
    }

    const bonus = getTopupBonus(amountRub);
    const totalCredit = amountRub + bonus;
    const updated = await addBalance(userId, totalCredit);

    const bonusText = bonus > 0 ? ` (+${bonus} бонус)` : "";
    await notifyTelegram(
      userId,
      `💰 +${amountRub} ₽${bonusText} (CryptoBot)\n\nБаланс: ${updated.balance} ₽`,
    );

    try {
      const ref = await grantReferralReward(userId);
      if (ref.rewarded && ref.referrerId && ref.bonus) {
        await addBalance(ref.referrerId, ref.bonus);
      }
    } catch (err) {
      console.error("[cryptobot-webhook] referral reward error:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[cryptobot-webhook] unhandled error:", error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
