// src/app/api/payment/enot-webhook/route.ts
//
// Webhook receiver for Enot.io payments.
//
// Security model:
//   1. Verify HMAC-SHA256 signature against ENOT_ADDITIONAL_KEY (header
//      `x-api-sha256-signature`). Reject with 401 on mismatch.
//   2. Atomic dedup via `enot_done:<invoice_id>` SET NX (90 days). The
//      reservation MUST happen BEFORE any side effect, so concurrent retries
//      from Enot cannot both credit the user.
//   3. Resolve userId+amount EXCLUSIVELY from server-side mapping
//      (`enot_invoice:<id>` or `enot_order:<order_id>`) written at invoice
//      creation. We do NOT fall back to `parsed.custom_fields.userId` or
//      `parsed.amount` - those are attacker-controlled in the payload (even
//      with valid signature, Enot can be tricked into echoing values from
//      other shops in edge cases, and an expired mapping means we can't
//      verify what we promised the user).
//   4. Mappings have 72h TTL (long enough for slow-confirmation cryptos).
//      If mapping is gone -> log loudly, mark dedup, return 200 (no credit).
//      Operator must inspect logs and credit manually if it really happened.

import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import {
  getAccount,
  getProfiles,
  getUserRecord,
  markTopup,
} from "@/lib/accounts";
import { addBalance, getBalanceInfo, getTopupBonus } from "@/lib/balance";
import { grantReferralReward } from "@/lib/referrals";
import { verifyEnotSignature } from "@/lib/enot";
import { reserveDedupKey } from "@/lib/dedup";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DEDUP_TTL_SEC = 90 * 86400;

async function notifyTelegram(userId: string, message: string) {
  if (!BOT_TOKEN) return;
  try {
    let chatId: string | null = null;
    if (userId.startsWith("tg_")) {
      chatId = userId.slice(3);
    } else {
      const user = await getUserRecord(userId);
      if (user?.telegramId) chatId = String(user.telegramId);
    }
    if (!chatId) return;
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
  } catch (e) {
    console.error("[enot-webhook] notifyTelegram error:", e);
  }
}

interface EnotWebhookBody {
  invoice_id?: string;
  status?: string;
  amount?: string;
  currency?: string;
  order_id?: string;
  pay_service?: string;
  custom_fields?: unknown;
  type?: number;
  credited?: string | number;
  pay_time?: string;
  code?: number;
}

interface InvoiceMapping {
  userId?: string;
  amount?: number;
  kind?: string;
  orderId?: string;
}

function asMapping(raw: unknown): InvoiceMapping | null {
  if (!raw) return null;
  try {
    if (typeof raw === "string") return JSON.parse(raw) as InvoiceMapping;
    if (typeof raw === "object") return raw as InvoiceMapping;
  } catch {
    return null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const headerSig = req.headers.get("x-api-sha256-signature");

    let parsed: EnotWebhookBody;
    try {
      parsed = JSON.parse(rawBody) as EnotWebhookBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!verifyEnotSignature(parsed as Record<string, unknown>, headerSig)) {
      console.warn(
        "[enot-webhook] invalid signature; invoice_id=%s order_id=%s",
        parsed.invoice_id,
        parsed.order_id,
      );
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const invoiceId = parsed.invoice_id;
    const orderId = parsed.order_id;
    const status = parsed.status;

    if (!invoiceId) {
      return NextResponse.json({ ok: true });
    }

    if (status !== "success") {
      console.log(
        "[enot-webhook] non-success status=%s invoice_id=%s",
        status,
        invoiceId,
      );
      return NextResponse.json({ ok: true });
    }

    // ATOMIC DEDUP: this MUST happen before any side effect. Concurrent
    // retries from Enot get exactly one winner.
    const reserved = await reserveDedupKey(`enot_done:${invoiceId}`, DEDUP_TTL_SEC);
    if (!reserved) {
      // Someone else is already processing or already did.
      return NextResponse.json({ ok: true });
    }

    // Resolve mapping. We INTENTIONALLY do NOT fall back to webhook payload
    // for userId or amount - those are not authoritative for our accounting.
    let mapping: InvoiceMapping | null = asMapping(
      await redis.get(`enot_invoice:${invoiceId}`),
    );
    if (!mapping?.userId && orderId) {
      mapping = asMapping(await redis.get(`enot_order:${orderId}`));
    }

    if (!mapping?.userId || !Number.isFinite(mapping.amount) || (mapping.amount ?? 0) <= 0) {
      console.warn(
        "[enot-webhook] mapping missing/invalid; invoice_id=%s order_id=%s status=%s amount_payload=%s. Manual review required.",
        invoiceId,
        orderId,
        status,
        parsed.amount,
      );
      // Dedup key already reserved above, so we won't re-process.
      return NextResponse.json({ ok: true });
    }

    const userId = mapping.userId;
    const amountRub = mapping.amount as number;

    const account = await getAccount(userId);
    if (!account) {
      console.warn(
        "[enot-webhook] account not found userId=%s invoice_id=%s",
        userId,
        invoiceId,
      );
      return NextResponse.json({ ok: true });
    }

    const bonus = getTopupBonus(amountRub);
    const totalCredit = amountRub + bonus;

    const updated = await addBalance(userId, totalCredit);
    const profiles = await getProfiles(userId);
    const bal = getBalanceInfo(updated, profiles.length);

    await markTopup(userId);

    const lines = [
      `✅ <b>Баланс пополнен!</b>`,
      ``,
      `💰 +${amountRub} ₽`,
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
        await notifyTelegram(
          ref.referrerId,
          [
            `🎁 <b>Реферальный бонус!</b>`,
            ``,
            `Ваш друг пополнил баланс.`,
            `Вам начислено <b>+${ref.bonus} ₽</b> на баланс!`,
          ].join("\n"),
        );
      }
    } catch (err) {
      console.error("[enot-webhook] referral reward error:", err);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[enot-webhook] error:", error);
    return NextResponse.json({ ok: true });
  }
}
