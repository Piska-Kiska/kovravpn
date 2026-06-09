// src/app/api/payment/cryptobot-webhook/route.ts
//
// CryptoBot (Crypto Pay) webhook — bot prepaid balance top-up ONLY.
//
// Security:
//   1. HMAC-SHA256 verify (header crypto-pay-api-signature) against
//      SHA256(API_TOKEN). Reject 401 on mismatch.
//   2. Atomic dedup `cryptobot_paid:<invoice_id>` SET NX (90d).
//   3. Credits `balance_usd:{userId}` parsed from payload.payload.userId.
//
// Only `invoice_paid` updates with status `paid` credit the balance.

import { NextRequest, NextResponse } from "next/server";
import { verifyCryptoBotSignature, type CryptoBotWebhookUpdate } from "@/lib/cryptobot";
import { addBalanceUsd } from "@/lib/bot-wallet";
import { reserveDedupKey } from "@/lib/dedup";
import { getUserRecord } from "@/lib/accounts";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DEDUP_TTL_SEC = 90 * 86400;

async function notifyTelegram(userId: string, message: string): Promise<void> {
  try {
    let chatId: string | null = null;
    if (userId.startsWith("tg_")) chatId = userId.slice(3);
    else {
      const u = await getUserRecord(userId);
      if (u?.telegramId) chatId = String(u.telegramId);
    }
    if (!chatId || !BOT_TOKEN) return;
    await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
      timeoutMs: 5000,
    });
  } catch (err) {
    console.error("[cryptobot-webhook] notify error:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get("crypto-pay-api-signature") || "";
    if (!verifyCryptoBotSignature(rawBody, sig)) {
      console.warn("[cryptobot-webhook] invalid signature");
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    let update: CryptoBotWebhookUpdate;
    try {
      update = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    if (update.update_type !== "invoice_paid") {
      return NextResponse.json({ ok: true, ignored: "not invoice_paid" });
    }
    const inv = update.payload;
    if (!inv || inv.status !== "paid") {
      return NextResponse.json({ ok: true, ignored: "not paid" });
    }

    let meta: { userId?: string; amountUsd?: number } = {};
    try {
      meta = inv.payload ? JSON.parse(inv.payload) : {};
    } catch {
      /* ignore */
    }
    const userId = meta.userId;
    if (!userId) {
      return NextResponse.json({ ok: true, ignored: "no userId in payload" });
    }

    const invId = String(inv.invoice_id);
    if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(invId)) {
      return NextResponse.json({ ok: true, ignored: "bad invoice_id" });
    }
    const reserved = await reserveDedupKey(`cryptobot_paid:${invId}`, DEDUP_TTL_SEC);
    if (!reserved) return NextResponse.json({ ok: true, ignored: "duplicate" });

    // Prefer the amount actually invoiced (USD fiat). Fall back to paid_amount.
    const usd = Number(inv.amount) || Number(meta.amountUsd) || 0;
    if (usd <= 0) return NextResponse.json({ ok: true, ignored: "zero amount" });

    const newBal = await addBalanceUsd(userId, usd);
    await notifyTelegram(
      userId,
      [`✅ <b>Balance topped up</b>`, ``, `💵 +$${usd.toFixed(2)}`, `💰 Balance: <b>$${newBal.toFixed(2)}</b>`].join("\n"),
    );
    return NextResponse.json({ ok: true, credited: usd });
  } catch (error) {
    console.error("[cryptobot-webhook] unhandled error:", error);
    return NextResponse.json({ ok: true });
  }
}
