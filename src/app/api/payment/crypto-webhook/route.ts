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
//
// What was actually paid (KM-09): a `partially_paid` IPN grants nothing and
// alerts the admin once per payment and amount; a `finished` one whose
// actually_paid strays more than 1% from pay_amount is granted as usual and
// alerts the admin (an overpayment is not credited automatically: refund it
// or credit it by hand). Before, both were silent.
//
// Redis failing before the grant or credit releases the dedup key and
// answers 503/500, so NOWPayments retries (KM-07); after it, 200.

import { NextRequest, NextResponse } from "next/server";
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
import { markTopup, resolveUserId } from "@/lib/accounts";
import { grantReferralReward } from "@/lib/referrals";
import { ipnAmountsLine, paidDeviation, verifyIpnSignature, type IpnPayload } from "@/lib/nowpayments";
import { errorText, escapeHtml } from "@/lib/admin-alert";
import { releaseDedupKey, reserveDedupKey } from "@/lib/dedup";
import { addBalanceUsd, parseTopupOrderId } from "@/lib/bot-wallet";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { ADMIN_TG_ID } from "@/lib/admin-bot";
import { noticeCents, noticeProductOf, notifyUser } from "@/lib/bot-v2/notify";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DEDUP_TTL_SEC = 90 * 86400;

/** Прямая отправка по идентификатору чата — для тревог админу. */
async function sendTelegram(chatId: string, text: string): Promise<void> {
  if (!chatId || !BOT_TOKEN) return;
  try {
    await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      timeoutMs: 5000,
    });
  } catch (err) {
    console.error("[crypto-webhook] sendTelegram error:", err);
  }
}

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

/** After a grant or credit: tell the admin when the buyer paid more or less than asked. */
async function alertOnPaidDeviation(payload: IpnPayload, paymentId: string): Promise<void> {
  const deviation = paidDeviation(payload);
  if (!deviation) return;
  const what =
    deviation === "over"
      ? "paid MORE than asked; granted as ordered, the extra is NOT credited: refund it or credit it by hand"
      : "finished but paid LESS than asked; granted as ordered";
  await sendTelegram(
    ADMIN_TG_ID,
    `⚠️ <b>NOWPayments: ${what}</b>\npayment <code>${escapeHtml(paymentId)}</code>, order <code>${escapeHtml(String(payload.order_id))}</code>\n${ipnAmountsLine(payload)}`,
  );
}

export async function POST(req: NextRequest) {
  // The dedup key while it is held for a grant or credit that has not
  // happened yet, and whether it has (see the header).
  let heldKey: string | null = null;
  let granted = false;
  let paymentRef = "?";
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

    paymentRef = String(payload.payment_id);

    // ─── Partially paid: nothing granted, the admin decides ───
    if (payload.payment_status === "partially_paid") {
      const pidP = String(payload.payment_id);
      if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(pidP)) {
        return NextResponse.json({ ok: true, ignored: "bad payment_id" });
      }
      // One alert per payment and amount: NOWPayments repeats the IPN.
      const paidKey = String(Number(payload.actually_paid) || 0).slice(0, 32);
      let fresh: boolean;
      try {
        fresh = await reserveDedupKey(`crypto_partial:${pidP}:${paidKey}`, DEDUP_TTL_SEC);
      } catch (err) {
        console.error("[crypto-webhook] partial-payment record failed, requesting retry:", err);
        return NextResponse.json({ error: "unavailable" }, { status: 503 });
      }
      if (fresh) {
        console.warn("[crypto-webhook] partially paid, NOT granted", {
          payment_id: pidP,
          order_id: payload.order_id,
          pay_amount: payload.pay_amount,
          actually_paid: payload.actually_paid,
        });
        await sendTelegram(
          ADMIN_TG_ID,
          `⚠️ <b>NOWPayments: partially paid, NOT granted</b>\npayment <code>${escapeHtml(pidP)}</code>, order <code>${escapeHtml(String(payload.order_id))}</code>\n${ipnAmountsLine(payload)}\nCheck the payment in the NOWPayments dashboard: refund it or grant by hand.`,
        );
      }
      return NextResponse.json({ ok: true, ignored: "partially_paid" });
    }

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
      let reservedT: boolean;
      try {
        reservedT = await reserveDedupKey(`crypto_payment_done:${pidT}`, DEDUP_TTL_SEC);
      } catch (err) {
        console.error("[crypto-webhook] dedup reserve failed, requesting retry:", err);
        await sendTelegram(
          ADMIN_TG_ID,
          `⚠️ <b>NOWPayments: Redis error, asked for a retry</b>\npayment <code>${escapeHtml(pidT)}</code>: ${errorText(err)}`,
        );
        return NextResponse.json({ error: "unavailable" }, { status: 503 });
      }
      if (!reservedT) return NextResponse.json({ ok: true, ignored: "duplicate" });
      heldKey = `crypto_payment_done:${pidT}`;
      const usd = Number(payload.price_amount) || 0;
      let walletOwner: string;
      let newBal: number;
      try {
        // The account the order's id belongs to now (a linked Telegram account moved).
        walletOwner = await resolveUserId(tu.userId);
        newBal = await addBalanceUsd(walletOwner, usd);
      } catch (err) {
        // Ключ дедупа уже занят, а зачисления не было. Освобождаем его и просим
        // повторить: без этого оплата осталась бы без денег НАВСЕГДА — повтор
        // отсёкся бы как дубликат.
        console.error("[crypto-webhook] wallet credit failed, requesting retry:", err);
        await releaseDedupKey(`crypto_payment_done:${pidT}`).catch(() => {});
        heldKey = null;
        await sendTelegram(
          ADMIN_TG_ID,
          `⚠️ <b>NOWPayments: top-up credit failed, asked for a retry</b>\npayment <code>${escapeHtml(pidT)}</code>: ${errorText(err)}`,
        );
        return NextResponse.json({ error: "internal" }, { status: 500 });
      }
      granted = true;
      await alertOnPaidDeviation(payload, pidT);
      await notifyUser(
        walletOwner,
        { kind: "topup", amountCents: noticeCents(usd), balanceCents: noticeCents(newBal) },
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
    // The account the order's id belongs to now: a Telegram account linked
    // to an e-mail one after the order was made moved there (as top-ups do).
    // A Redis error here goes to the handler below (no key held yet: retry).
    const userId = await resolveUserId(parsed.userId);

    const paymentId = String(payload.payment_id);
    if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(paymentId)) {
      console.warn("[crypto-webhook] suspicious payment_id rejected:", paymentId);
      return NextResponse.json({ ok: true, ignored: "bad payment_id" });
    }

    // ATOMIC DEDUP: must happen before any side effect.
    let reserved: boolean;
    try {
      reserved = await reserveDedupKey(`crypto_payment_done:${paymentId}`, DEDUP_TTL_SEC);
    } catch (err) {
      console.error("[crypto-webhook] dedup reserve failed, requesting retry:", err);
      await sendTelegram(
        ADMIN_TG_ID,
        `⚠️ <b>NOWPayments: Redis error, asked for a retry</b>\npayment <code>${escapeHtml(paymentId)}</code>: ${errorText(err)}`,
      );
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    if (!reserved) {
      return NextResponse.json({ ok: true, ignored: "duplicate" });
    }
    heldKey = `crypto_payment_done:${paymentId}`;

    // ─── Ступень 1: выдача (граница, после которой повтор удваивал бы) ───
    //
    // До этой правки любой сбой здесь улетал в общий catch, который отвечал
    // 200: NOWPayments считал доставку удачной и повторов не слал, а занятый
    // на 90 дней ключ дедупа отсекал даже ручную переотправку. Деньги взяты,
    // подписки нет, тревоги нет — и повторить нечем.
    let summaryLine = "";
    try {
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
    } catch (err) {
      console.error("[crypto-webhook] grant failed, requesting retry:", err);
      await releaseDedupKey(`crypto_payment_done:${paymentId}`).catch(() => {});
      heldKey = null;
      await sendTelegram(
        ADMIN_TG_ID,
        `⚠️ <b>NOWPayments: grant failed, asked for a retry</b>\npayment <code>${escapeHtml(paymentId)}</code>: ${errorText(err)}`,
      );
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
    granted = true;
    await alertOnPaidDeviation(payload, paymentId);

    // ─── Ступень 2: синхронизация и уведомления (повтору не подлежит) ───
    try {
      await syncAllExpiry(userId);
      await markTopup(userId);
    } catch (err) {
      console.error("[crypto-webhook] post-grant sync failed:", err);
      await sendTelegram(
        ADMIN_TG_ID,
        `⚠️ <b>NOWPayments: выдано, но синхронизация не прошла</b>\nuser <code>${userId}</code>, payment <code>${paymentId}</code>. Запустить syncAllExpiry вручную.`,
      );
    }

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
    await notifyUser(
      userId,
      { kind: "purchase", product: noticeProductOf(parsed), activeSlots: s.activeSlots, untilMs: s.maxExpiry },
      lines.join("\n"),
    );

    // ─── Referral reward: first paid purchase → referrer gets 14d sub ───
    try {
      const ref = await grantReferralReward(userId);
      if (ref.rewarded && ref.referrerId) {
        await applyReferralReward(ref.referrerId);
        await syncAllExpiry(ref.referrerId);
        await notifyUser(
          ref.referrerId,
          { kind: "referral_reward" },
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
    // Whatever the stages above did not catch. After the grant the answer is
    // 200 on purpose (a retry would grant twice); before it the key is
    // released and NOWPayments is asked to retry. Either way the admin hears.
    console.error("[crypto-webhook] unhandled error:", error);
    if (granted) {
      await sendTelegram(
        ADMIN_TG_ID,
        `🚨 <b>NOWPayments: error after the grant</b>\n\npayment <code>${escapeHtml(paymentRef)}</code>: <code>${errorText(error)}</code>\n\nGranted; check the expiry sync and the notice.`,
      );
      return NextResponse.json({ ok: true });
    }
    if (heldKey) await releaseDedupKey(heldKey).catch(() => {});
    await sendTelegram(
      ADMIN_TG_ID,
      `🚨 <b>NOWPayments: error before the grant, asked for a retry</b>\n\npayment <code>${escapeHtml(paymentRef)}</code>: <code>${errorText(error)}</code>`,
    );
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
