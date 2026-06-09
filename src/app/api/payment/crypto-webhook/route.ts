// src/app/api/payment/crypto-webhook/route.ts
//
// NOWPayments IPN webhook receiver (subscription model).
//
// Security model:
//   1. Verify HMAC-SHA512 signature against IPN secret (header
//      `x-nowpayments-sig`). Reject 401 on mismatch.
//   2. ATOMIC dedup via `crypto_payment_done:<payment_id>` SET NX (90 days).
//      Reserved BEFORE any side effect.
//   3. Purchase decoded from `parseSubOrderId(payload.order_id)` (sub_/dev_).
//      Legacy `topup_` orders are ignored (balance model retired).
//
// On a finished payment we ADD the corresponding subscription and re-sync
// every profile's 3X-UI expiry to the furthest active subscription.

import { NextRequest, NextResponse } from "next/server";
import { getUserRecord } from "@/lib/accounts";
import {
  parseSubOrderId,
  resolvePlan,
  applyPlanPurchase,
  applyDeviceAddon,
  applyReferralReward,
  summarize,
  getSubscriptions,
} from "@/lib/subscriptions";
import { syncAllExpiry } from "@/lib/balance";
import { markTopup } from "@/lib/accounts";
import { grantReferralReward } from "@/lib/referrals";
import { verifyIpnSignature, type IpnPayload } from "@/lib/nowpayments";
import { reserveDedupKey } from "@/lib/dedup";
import { addBalanceUsd, parseTopupOrderId } from "@/lib/bot-wallet";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
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

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return "";
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

    // ─── Bot prepaid balance top-up (topup_<userId>_<ts>) ───
    // Site never emits topup_ (it charges per-purchase via sub_/dev_), so this
    // branch is bot-only and leaves the subscription flow below untouched.
    if (payload.order_id?.startsWith("topup_")) {
      const tu = parseTopupOrderId(payload.order_id);
      if (!tu) return NextResponse.json({ ok: true, ignored: "bad topup order_id" });
      const pidT = String(payload.payment_id);
      if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(pidT)) {
        return NextResponse.json({ ok: true, ignored: "bad payment_id" });
      }
      const reservedT = await reserveDedupKey(`crypto_payment_done:${pidT}`, DEDUP_TTL_SEC);
      if (!reservedT) return NextResponse.json({ ok: true, ignored: "duplicate" });
      const usd = Number(payload.price_amount) || 0;
      const newBal = await addBalanceUsd(tu.userId, usd);
      await notifyTelegram(
        tu.userId,
        [`✅ <b>Balance topped up</b>`, ``, `💵 +$${usd.toFixed(2)}`, `💰 Balance: <b>$${newBal.toFixed(2)}</b>`].join("\n"),
      );
      return NextResponse.json({ ok: true, credited: usd });
    }

    const parsed = parseSubOrderId(payload.order_id);
    if (!parsed) {
      // Legacy topup_ or unknown — nothing to grant in subscription model.
      console.warn("[crypto-webhook] non-subscription order_id ignored:", payload.order_id);
      return NextResponse.json({ ok: true, ignored: "non-subscription order_id" });
    }
    const userId = parsed.userId;

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

    // ─── Grant entitlement ───
    let summaryLine = "";
    if (parsed.type === "plan") {
      const plan = resolvePlan(parsed.kind, parsed.term);
      if (!plan) {
        return NextResponse.json({ ok: true, ignored: "bad plan in order_id" });
      }
      await applyPlanPurchase(userId, plan);
      const label = parsed.kind === "plan3" ? "3 devices" : "1 device";
      summaryLine = `${label} · ${parsed.term} mo`;
    } else {
      await applyDeviceAddon(userId);
      summaryLine = "+1 device · 30 days";
    }

    await syncAllExpiry(userId);
    await markTopup(userId);

    const subs = await getSubscriptions(userId);
    const s = summarize(subs);

    // Notify buyer.
    const lines = [
      `✅ <b>Payment received</b>`,
      ``,
      `🎟 ${summaryLine}`,
      `📱 Active devices: <b>${s.activeSlots}</b>`,
    ];
    if (s.maxExpiry > 0) lines.push(`📅 Active until: <b>${fmtDate(s.maxExpiry)}</b>`);
    await notifyTelegram(userId, lines.join("\n"));

    // ─── Referral reward: first paid purchase → referrer gets 14d sub ───
    try {
      const ref = await grantReferralReward(userId);
      if (ref.rewarded && ref.referrerId) {
        await applyReferralReward(ref.referrerId);
        await syncAllExpiry(ref.referrerId);
        await notifyTelegram(
          ref.referrerId,
          [
            `🎁 <b>Referral reward!</b>`,
            ``,
            `Your friend bought a subscription.`,
            `You got <b>+14 days</b> for 1 device.`,
          ].join("\n"),
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
