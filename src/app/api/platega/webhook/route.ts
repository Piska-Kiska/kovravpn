// src/app/api/platega/webhook/route.ts
//
// Platega callback endpoint. Set in the Platega dashboard
// (Настройки → Callback URL): https://kovravpn.com/api/platega/webhook
//
// Platega POSTs JSON { id, amount, currency, status, paymentMethod } with our
// own X-MerchantId / X-Secret headers; authenticity = constant-time compare.
// status: CONFIRMED (paid) | CANCELED (failed) | CHARGEBACKED (docs prose).
// Retry policy (docs): 60s timeout, then up to 3 retries every 5 minutes —
// so 5xx answers request a retry, 2xx acknowledges.
//
// Mapping: callback carries only Platega's tx id → platega_tx:{id} points to
// our externalId → platega_order:{externalId} holds the exact expected charge
// written by lib/platega-order BEFORE the payment was created. No record —
// nothing is granted (admin gets an alert instead).

import { NextRequest, NextResponse } from "next/server";
import { getUserRecord, markTopup } from "@/lib/accounts";
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
import { grantReferralReward } from "@/lib/referrals";
import { reserveDedupKey, releaseDedupKey } from "@/lib/dedup";
import { verifyPlategaWebhook, type PlategaOrderRecord } from "@/lib/platega";
import { redis } from "@/lib/redis";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { ADMIN_TG_ID } from "@/lib/admin-bot";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DEDUP_TTL_SEC = 90 * 86400;

interface CallbackPayload {
  id?: string;
  amount?: number;
  currency?: string;
  status?: string;
  paymentMethod?: number;
}

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function sendTelegram(chatId: string, text: string): Promise<void> {
  if (!BOT_TOKEN || !chatId) return;
  try {
    await fetchWithTimeout(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        timeoutMs: 8000,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      },
    );
  } catch (err) {
    console.error("[platega-webhook] telegram send failed:", err);
  }
}

async function notifyUser(userId: string, message: string): Promise<void> {
  let chatId: string | null = null;
  if (userId.startsWith("tg_")) chatId = userId.slice(3);
  else {
    const user = await getUserRecord(userId).catch(() => null);
    if (user?.telegramId) chatId = String(user.telegramId);
  }
  if (chatId) await sendTelegram(chatId, message);
}

async function getOrderRecord(
  externalId: string,
): Promise<PlategaOrderRecord | null> {
  const raw = await redis.get(`platega_order:${externalId}`).catch(() => null);
  if (!raw) return null;
  try {
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as PlategaOrderRecord;
    return typeof v?.amountMinor === "number" && v?.currency === "RUB" ? v : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyPlategaWebhook(req.headers)) {
      console.warn("[platega-webhook] invalid credentials headers");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as CallbackPayload | null;
    const txId = String(body?.id || "");
    const status = String(body?.status || "");
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(txId) || !status) {
      console.warn("[platega-webhook] malformed callback:", JSON.stringify(body).slice(0, 200));
      return NextResponse.json({ ok: true, ignored: "malformed" });
    }

    console.log("[platega-webhook] event", {
      id: txId,
      status,
      amount: body?.amount,
      currency: body?.currency,
      method: body?.paymentMethod,
    });

    if (status === "CANCELED") {
      return NextResponse.json({ ok: true, ignored: "canceled" });
    }

    // Money moved back or unknown terminal status: alert, handle manually.
    if (status !== "CONFIRMED") {
      await sendTelegram(
        ADMIN_TG_ID,
        [
          `⚠️ <b>Platega ${status}</b>`,
          ``,
          `tx: <code>${txId}</code>`,
          `amount: ${Number(body?.amount ?? 0)} ${body?.currency ?? "?"}`,
          ``,
          `Subscription NOT auto-revoked — handle manually.`,
        ].join("\n"),
      );
      return NextResponse.json({ ok: true });
    }

    // ATOMIC DEDUP before any side effect.
    const dedupKey = `platega_done:${txId}:${status}`;
    const reserved = await reserveDedupKey(dedupKey, DEDUP_TTL_SEC);
    if (!reserved) {
      return NextResponse.json({ ok: true, ignored: "duplicate" });
    }

    const extId = String(
      (await redis.get(`platega_tx:${txId}`).catch(() => "")) || "",
    ).slice(0, 255);
    const parsed = extId ? parseSubOrderId(extId) : null;
    const order = extId ? await getOrderRecord(extId) : null;

    if (!extId || !parsed || !order) {
      console.error("[platega-webhook] CONFIRMED with missing mapping/order", {
        txId,
        extId,
      });
      await sendTelegram(
        ADMIN_TG_ID,
        `⚠️ <b>Platega: paid but order record missing</b>\ntx <code>${txId}</code>, order <code>${extId || "?"}</code>, ${Number(body?.amount ?? 0)} ${body?.currency ?? "?"}. NOT granted — verify in Platega LK and grant manually.`,
      );
      return NextResponse.json({ ok: true, ignored: "order record missing" });
    }

    // Amount check: callback amount is in major units (rubles).
    const gotMinor = Math.round(Number(body?.amount ?? 0) * 100);
    if (gotMinor !== order.amountMinor || body?.currency !== order.currency) {
      console.error("[platega-webhook] amount/currency mismatch", {
        expected: { amountMinor: order.amountMinor, currency: order.currency },
        got: { amount: body?.amount, currency: body?.currency },
        txId,
        extId,
      });
      await sendTelegram(
        ADMIN_TG_ID,
        `⚠️ <b>Platega amount mismatch</b>\ntx <code>${txId}</code>: got ${body?.amount} ${body?.currency}, expected ${(order.amountMinor / 100).toFixed(2)} ${order.currency}. NOT granted.`,
      );
      return NextResponse.json({ ok: true, ignored: "amount mismatch" });
    }

    const userId = parsed.userId;

    // ─── Stage 1: persist entitlement (retry-safe boundary) ───
    let summaryLine = "";
    try {
      if (parsed.type === "plan") {
        const plan = resolvePlan(parsed.kind, parsed.term);
        if (!plan) {
          return NextResponse.json({ ok: true, ignored: "bad plan" });
        }
        await applyPlanPurchase(userId, plan);
        const label = parsed.kind === "plan3" ? "3 devices" : "1 device";
        summaryLine = `${label} · ${parsed.term} mo`;
      } else {
        await applyDeviceAddon(userId);
        summaryLine = "+1 device · 30 days";
      }
    } catch (err) {
      console.error("[platega-webhook] grant failed, requesting retry:", err);
      await releaseDedupKey(dedupKey);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    // ─── Stage 2: sync & notify (best-effort, never retried) ───
    try {
      await syncAllExpiry(userId);
      await markTopup(userId);
    } catch (err) {
      console.error("[platega-webhook] post-grant sync failed:", err);
      await sendTelegram(
        ADMIN_TG_ID,
        `⚠️ <b>Platega: granted but expiry sync failed</b>\nuser <code>${userId}</code>, tx <code>${txId}</code>. Run syncAllExpiry manually.`,
      );
    }

    const subs = await getSubscriptions(userId).catch(() => []);
    const s = summarize(subs);
    const lines = [
      `✅ <b>Payment received</b>`,
      ``,
      `🎟 ${summaryLine}`,
      `📱 Active devices: <b>${s.activeSlots}</b>`,
    ];
    if (s.maxExpiry > 0) lines.push(`📅 Active until: <b>${fmtDate(s.maxExpiry)}</b>`);
    await notifyUser(userId, lines.join("\n"));

    // ─── Referral reward: first paid purchase → referrer gets 14d ───
    try {
      const ref = await grantReferralReward(userId);
      if (ref.rewarded && ref.referrerId) {
        await applyReferralReward(ref.referrerId);
        await syncAllExpiry(ref.referrerId);
        await notifyUser(
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
      console.error("[platega-webhook] referral reward error:", err);
    }

    console.log("[platega-webhook] paid processed", { txId, userId, order: summaryLine });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[platega-webhook] unhandled error:", error);
    return NextResponse.json({ ok: true });
  }
}
