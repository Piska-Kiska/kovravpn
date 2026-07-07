// src/app/api/cashera/webhook/route.ts
//
// Cashera webhook receiver (card payments, subscription model).
//
// Security model (mirrors crypto-webhook):
//   1. Authenticate via X-Api-Key + X-Secret headers, constant-time compare
//      against our credentials. Reject 401 on mismatch.
//   2. ATOMIC dedup via `cashera_payment_done:<uuid>:<status>` SET NX (90d),
//      reserved BEFORE any side effect. Status is part of the key because a
//      transaction legitimately moves paid → refunded/chargeback and each
//      transition must be processed exactly once (Cashera retries up to 3x).
//   3. Purchase decoded from `parseSubOrderId(tx.external_id)` (sub_/dev_,
//      same scheme as NOWPayments order_id). Amount and currency re-verified
//      against the server-side price list BEFORE granting.
//
// paid                  → grant subscription (same sequence as crypto-webhook)
// refunded / chargeback → alert admin, manual handling (no auto-revoke)
// failed / expired      → acknowledged, no action
//
// Response codes: 2xx = delivered (Cashera stops), 5xx = retry (up to 3x),
// 4xx = misconfiguration (no retries) — used only for auth failures.

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
import { addBalanceUsd, parseTopupOrderId } from "@/lib/bot-wallet";
import { reserveDedupKey, releaseDedupKey } from "@/lib/dedup";
import {
  verifyWebhookHeaders,
  type CasheraStatus,
  type CasheraOrderRecord,
} from "@/lib/cashera";
import { redis } from "@/lib/redis";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { ADMIN_TG_ID } from "@/lib/admin-bot";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DEDUP_TTL_SEC = 90 * 86400;

interface WebhookTransaction {
  uuid: string;
  external_id: string;
  status: CasheraStatus;
  type: string;
  amount: number; // minor units (cents)
  gross_amount: number;
  net_amount: number;
  currency: string;
  payment_method: string;
  paid_at: string | null;
}

interface WebhookBody {
  event?: string;
  transaction?: WebhookTransaction;
}

async function sendTelegram(chatId: string, text: string): Promise<void> {
  if (!chatId || !BOT_TOKEN) return;
  try {
    await fetchWithTimeout(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        timeoutMs: 5000,
      },
    );
  } catch (err) {
    console.error("[cashera-webhook] sendTelegram error:", err);
  }
}

async function notifyUser(userId: string, message: string): Promise<void> {
  let chatId: string | null = null;
  if (userId.startsWith("tg_")) chatId = userId.slice(3);
  else {
    const user = await getUserRecord(userId);
    if (user?.telegramId) chatId = String(user.telegramId);
  }
  if (chatId) await sendTelegram(chatId, message);
}

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

/** Read the order record persisted by the create route. */
async function getOrderRecord(
  externalId: string,
): Promise<CasheraOrderRecord | null> {
  const raw = await redis.get(`cashera_order:${externalId}`).catch(() => null);
  if (!raw) return null;
  try {
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as CasheraOrderRecord;
    return typeof v?.amountMinor === "number" && typeof v?.currency === "string"
      ? v
      : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!verifyWebhookHeaders(req.headers)) {
      console.warn("[cashera-webhook] invalid credentials headers");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as WebhookBody | null;
    if (body?.event !== "transaction.status_updated" || !body.transaction) {
      // payout.* or unknown event — acknowledge without processing.
      return NextResponse.json({ ok: true, ignored: "event" });
    }
    const tx = body.transaction;

    console.log("[cashera-webhook] event", {
      uuid: tx.uuid,
      status: tx.status,
      external_id: tx.external_id,
      amount: tx.amount,
      currency: tx.currency,
    });

    const uuid = String(tx.uuid || "");
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(uuid)) {
      console.warn("[cashera-webhook] suspicious uuid rejected:", uuid.slice(0, 80));
      return NextResponse.json({ ok: true, ignored: "bad uuid" });
    }

    const status = tx.status;
    if (status !== "paid" && status !== "refunded" && status !== "chargeback") {
      // pending transitions never arrive; failed/expired need no action.
      return NextResponse.json({ ok: true, ignored: status });
    }

    // ATOMIC DEDUP: must happen before any side effect.
    const dedupKey = `cashera_payment_done:${uuid}:${status}`;
    const reserved = await reserveDedupKey(dedupKey, DEDUP_TTL_SEC);
    if (!reserved) {
      return NextResponse.json({ ok: true, ignored: "duplicate" });
    }

    const extId = String(tx.external_id || "").slice(0, 255);
    const parsed = parseSubOrderId(extId);

    // ─── Money moved back: alert admin, handle manually ───
    if (status === "refunded" || status === "chargeback") {
      console.error("[cashera-webhook] payment revoked", {
        status,
        uuid,
        external_id: extId,
      });
      await sendTelegram(
        ADMIN_TG_ID,
        [
          `⚠️ <b>Cashera ${status}</b>`,
          ``,
          `tx: <code>${uuid}</code>`,
          `order: <code>${extId}</code>`,
          `user: <code>${parsed ? parsed.userId : "?"}</code>`,
          `amount: ${(Number(tx.amount) / 100).toFixed(2)} ${tx.currency}`,
          ``,
          `Subscription NOT auto-revoked — handle manually.`,
        ].join("\n"),
      );
      return NextResponse.json({ ok: true });
    }

    // ─── Bot prepaid balance top-up (topup_<userId>_<ts>) ───
    // Mirrors the crypto-webhook topup_ branch. Balance is credited with the
    // USD value fixed at creation time (order.amountUsd), never recomputed
    // from the RUB charge.
    if (extId.startsWith("topup_")) {
      const tu = parseTopupOrderId(extId);
      const order = await getOrderRecord(extId);
      if (!tu || !order || order.kind !== "topup") {
        console.error("[cashera-webhook] paid topup with bad/missing order", {
          uuid,
          external_id: extId,
        });
        await sendTelegram(
          ADMIN_TG_ID,
          `⚠️ <b>Cashera: topup paid but order record missing</b>\ntx <code>${uuid}</code>, order <code>${extId}</code>, ${(Number(tx.amount) / 100).toFixed(2)} ${tx.currency}. NOT credited — verify and credit manually.`,
        );
        return NextResponse.json({ ok: true, ignored: "bad topup order" });
      }
      if (Number(tx.amount) !== order.amountMinor || tx.currency !== order.currency) {
        console.error("[cashera-webhook] topup amount/currency mismatch", {
          expected: { amount: order.amountMinor, currency: order.currency },
          got: { amount: tx.amount, currency: tx.currency },
          uuid,
        });
        await sendTelegram(
          ADMIN_TG_ID,
          `⚠️ <b>Cashera topup amount mismatch</b>\ntx <code>${uuid}</code>: got ${tx.amount} ${tx.currency}, expected ${order.amountMinor} ${order.currency}. NOT credited.`,
        );
        return NextResponse.json({ ok: true, ignored: "amount mismatch" });
      }
      let newBal: number;
      try {
        newBal = await addBalanceUsd(tu.userId, order.amountUsd);
      } catch (err) {
        console.error("[cashera-webhook] topup credit failed, requesting retry:", err);
        await releaseDedupKey(dedupKey);
        return NextResponse.json({ error: "internal" }, { status: 500 });
      }
      await notifyUser(
        tu.userId,
        [
          `✅ <b>Balance topped up</b>`,
          ``,
          `💵 +$${order.amountUsd.toFixed(2)}`,
          `💰 Balance: <b>$${newBal.toFixed(2)}</b>`,
        ].join("\n"),
      );
      console.log("[cashera-webhook] topup processed", {
        uuid,
        userId: tu.userId,
        usd: order.amountUsd,
      });
      return NextResponse.json({ ok: true });
    }

    // ─── paid: verify order and amount, then grant ───
    if (!parsed) {
      console.error("[cashera-webhook] paid for unknown external_id:", extId);
      return NextResponse.json({ ok: true, ignored: "bad external_id" });
    }
    const userId = parsed.userId;

    const order = await getOrderRecord(extId);
    if (!order) {
      // Record expired (7d TTL) or was never written — cannot verify the
      // charged amount, so nothing is granted. Deliberate 200: retries
      // won't restore the record; admin verifies via getTransaction(uuid)
      // and grants manually.
      console.error("[cashera-webhook] paid but order record missing", {
        uuid,
        external_id: extId,
      });
      await sendTelegram(
        ADMIN_TG_ID,
        `⚠️ <b>Cashera: paid but order record missing</b>\ntx <code>${uuid}</code>, order <code>${extId}</code>, ${(Number(tx.amount) / 100).toFixed(2)} ${tx.currency}. NOT granted — verify and grant manually.`,
      );
      return NextResponse.json({ ok: true, ignored: "order record missing" });
    }

    if (Number(tx.amount) !== order.amountMinor || tx.currency !== order.currency) {
      console.error("[cashera-webhook] amount/currency mismatch", {
        expected: { amount: order.amountMinor, currency: order.currency },
        got: { amount: tx.amount, currency: tx.currency },
        uuid,
        external_id: extId,
      });
      // Deliberate 200: this is either misconfiguration or tampering —
      // retries won't fix it and nothing was granted. Admin gets an alert.
      await sendTelegram(
        ADMIN_TG_ID,
        `⚠️ <b>Cashera amount mismatch</b>\ntx <code>${uuid}</code>: got ${tx.amount} ${tx.currency}, expected ${order.amountMinor} ${order.currency}. NOT granted.`,
      );
      return NextResponse.json({ ok: true, ignored: "amount mismatch" });
    }

    // ─── Stage 1: persist entitlement (retry-safe boundary) ───
    // If this throws, NOTHING was persisted → releasing the dedup key and
    // answering 5xx makes the Cashera retry re-run the grant cleanly.
    // After this stage a retry would double-credit, so later failures must
    // NOT release the key (see stage 2).
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
      console.error("[cashera-webhook] grant failed, requesting retry:", err);
      await releaseDedupKey(dedupKey);
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }

    // ─── Stage 2: sync & notify (best-effort, never retried) ───
    try {
      await syncAllExpiry(userId);
      await markTopup(userId);
    } catch (err) {
      console.error("[cashera-webhook] post-grant sync failed:", err);
      await sendTelegram(
        ADMIN_TG_ID,
        `⚠️ <b>Cashera: granted but expiry sync failed</b>\nuser <code>${userId}</code>, tx <code>${uuid}</code>. Run syncAllExpiry manually.`,
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
    if (s.maxExpiry > 0)
      lines.push(`📅 Active until: <b>${fmtDate(s.maxExpiry)}</b>`);
    await notifyUser(userId, lines.join("\n"));

    // ─── Referral reward: first paid purchase → referrer gets 14d sub ───
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
      console.error("[cashera-webhook] referral reward error:", err);
    }

    console.log("[cashera-webhook] paid processed", {
      uuid,
      userId,
      order: summaryLine,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[cashera-webhook] unhandled error:", error);
    return NextResponse.json({ ok: true });
  }
}
