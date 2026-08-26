// src/app/api/payment/lava-webhook/route.ts
//
// Приём событий lava.top. Порядок и запреты те же, что у cashera-webhook, и по
// тем же причинам: дедупликация занимается ДО побочных действий, выдача идёт
// двумя ступенями, сумма сверяется с прайсом на нашей стороне, а не с телом
// события.
//
// ЧЕМ ЛАВА ОТЛИЧАЕТСЯ ОТ ОСТАЛЬНЫХ ЛИНИЙ:
//
//   • В событии НЕТ нашего идентификатора покупки — только номер контракта.
//     Покупка находится по указателю, записанному при выставлении счёта, а
//     запасным путём по метке utm_content ИЗ ОТВЕТА ИХ API (не из тела: тело
//     подделывается, ответ API — нет).
//   • Тело не подписано. Подлинность — заголовок X-Api-Key или Basic-авторизация
//     из кабинета, а настоящий рубеж — запрос к их API за состоянием контракта.
//   • Повторы шлются и на 4xx, и на 5xx — девятнадцать раз за пять часов.
//     Поэтому всё, что мы не обрабатываем, подтверждается кодом 200: отказ
//     превратил бы одно чужое событие в двадцать.
//   • Возвраты и чарджбеки приходят в ДРУГОМ формате и номера контракта не
//     содержат вовсе — связать их с покупкой автоматически нечем.

import { NextRequest, NextResponse } from "next/server";
import { getUserRecord, markTopup } from "@/lib/accounts";
import {
  applyDeviceAddon,
  applyPlanPurchase,
  applyReferralReward,
  getSubscriptions,
  parseSubOrderId,
  resolvePlan,
  summarize,
} from "@/lib/subscriptions";
import { syncAllExpiry } from "@/lib/balance";
import { grantReferralReward } from "@/lib/referrals";
import { releaseDedupKey, reserveDedupKey } from "@/lib/dedup";
import {
  LAVA_UTM_SOURCE,
  LavaError,
  getInvoice,
  isContractId,
  lavaConfigured,
  orderIdFor,
  verifyWebhookAuth,
} from "@/lib/lava";
import { chargeIn, getCharge, priceUsdForOrderId } from "@/lib/lava-purchase";
import type { LavaCurrency } from "@/lib/lava-methods";
import { redis } from "@/lib/redis";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { ADMIN_TG_ID } from "@/lib/admin-bot";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DEDUP_TTL_SEC = 90 * 86400;
/** После какой по счёту попытки отставание их статуса перестаёт быть рябью. */
const LAG_ALERT_AFTER = 5;
const LAG_TTL_SEC = 6 * 60 * 60;

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
    console.error("[lava-webhook] sendTelegram error:", err);
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

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function POST(req: NextRequest) {
  if (!lavaConfigured) {
    console.error("[lava-webhook] not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const auth = verifyWebhookAuth(req.headers);
  if (auth === "bad") {
    console.warn("[lava-webhook] rejected: bad credentials");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (auth === "unconfigured") {
    // Не отказ: настоящий рубеж — запрос к их API ниже. Но знать, что защита
    // адреса не включена, надо: в кабинете она задаётся отдельно от ключа.
    console.warn("[lava-webhook] webhook credentials are not set, relying on API check only");
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  // Возврат или чарджбек: ни контракта, ни покупки в теле нет — связать не с
  // чем, разбирается руками. Молчать нельзя, деньги уходят с баланса.
  const moneyBack = str(payload.event_type);
  if (moneyBack === "refund.success" || moneyBack === "chargeback.initiated") {
    const data = (payload.data ?? {}) as Record<string, unknown>;
    await sendTelegram(
      ADMIN_TG_ID,
      [
        `⚠️ <b>lava.top ${moneyBack === "refund.success" ? "refund" : "chargeback"}</b>`,
        ``,
        `amount: ${esc(data.amount)} ${esc(data.currency)}`,
        `buyer: <code>${esc(data.customer_email)}</code>`,
        `id: <code>${esc(data.refund_id ?? data.chargeback_id)}</code>`,
        ``,
        `Событие не содержит номера контракта — искать по почте покупателя.`,
        `Подписка НЕ отзывается автоматически.`,
      ].join("\n"),
    );
    return NextResponse.json({ ok: true, note: moneyBack });
  }

  const event = str(payload.eventType);
  // Подписок через лаву не продаём: товар-заглушка разовый.
  if (event !== "payment.success" && event !== "payment.failed") {
    return NextResponse.json({ ok: true, ignored: "event" });
  }

  const contractId = payload.contractId;
  if (!isContractId(contractId)) {
    return NextResponse.json({ ok: true, ignored: "payload" });
  }

  // Статус в ключе: один контракт законно приносит и неудачу, и успех.
  const dedupKey = `lava_payment_done:${contractId}:${event}`;
  let reserved: boolean;
  try {
    reserved = await reserveDedupKey(dedupKey, DEDUP_TTL_SEC);
  } catch (err) {
    console.error("[lava-webhook] dedup failed:", err);
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
  if (!reserved) return NextResponse.json({ ok: true, ignored: "duplicate" });

  /** Просим повторить — и обязательно освобождаем ключ. */
  const retry = async (reason: string): Promise<NextResponse> => {
    await releaseDedupKey(dedupKey).catch(() => {});
    return NextResponse.json({ error: reason }, { status: 503 });
  };

  // Источник правды — их API, а не присланное тело.
  let invoice;
  try {
    invoice = await getInvoice(contractId);
  } catch (err) {
    if (err instanceof LavaError && err.status === 404) {
      console.warn("[lava-webhook] unknown contract", contractId);
      return NextResponse.json({ ok: true, ignored: "unknown contract" });
    }
    console.error("[lava-webhook] invoice fetch failed:", err);
    return retry("upstream_unavailable");
  }


  // Событие чужого проекта.
  //
  // Все три бренда могут жить в одном кабинете lava.top, а адрес вебхука там
  // один на кабинет — управления вебхуками в их API нет ни одного метода.
  // Значит сюда прилетает и то, что куплено у соседей. Отличаем по метке
  // источника ИЗ ОТВЕТА ИХ API: тело события подделывается, ответ — нет.
  //
  // Тихие 200 и никаких тревог: чужая оплата не наша забота, а «оплачен счёт
  // без заказа» на каждую соседскую продажу — это сообщение, которое админ
  // научится не читать.
  const utmSource = invoice.clientUtm?.utm_source;
  if (
    typeof utmSource === "string" &&
    utmSource !== "" &&
    utmSource !== LAVA_UTM_SOURCE
  ) {
    return NextResponse.json({ ok: true, ignored: "another project" });
  }

  let orderId: string | null;
  try {
    orderId = await orderIdFor(contractId, invoice);
  } catch (err) {
    console.error("[lava-webhook] contract lookup failed:", err);
    return retry("storage_unavailable");
  }

  const parsed = orderId === null ? null : parseSubOrderId(orderId);
  if (parsed === null) {
    console.warn("[lava-webhook] contract without a purchase", contractId, invoice.status);
    // Тревожим ТОЛЬКО когда деньги действительно взяты. Неоплаченные
    // проверочные контракты копятся десятками и будить админа не должны.
    if (invoice.status === "COMPLETED") {
      await sendTelegram(
        ADMIN_TG_ID,
        [
          `⚠️ <b>lava.top: ОПЛАЧЕН счёт без покупки</b>`,
          ``,
          `contract <code>${esc(contractId)}</code>`,
          `buyer: <code>${esc(invoice.buyer?.email)}</code>`,
          `amount: ${esc(invoice.receipt?.amount)} ${esc(invoice.receipt?.currency)}`,
          ``,
          `Деньги пришли, приложить их не к чему. Разобрать вручную.`,
        ].join("\n"),
      );
    }
    return NextResponse.json({ ok: true, note: "no purchase", status: invoice.status });
  }

  const userId = parsed.userId;

  // Успех, о котором их собственный API ещё не знает.
  //
  // Ключ дедупликации уже занят, а на 200 повторов не будет — то есть
  // оплаченная подписка осталась бы невыданной МОЛЧА. Просим повторить: у лавы
  // девятнадцать попыток за пять часов, чтобы догнать собственный статус.
  if (event === "payment.success" && invoice.status !== "COMPLETED") {
    console.warn("[lava-webhook] payment.success while the contract is", invoice.status);
    try {
      const lagKey = `lava_lag:${contractId}`;
      const attempts = await redis.incr(lagKey);
      if (attempts === 1) await redis.expire(lagKey, LAG_TTL_SEC);
      if (attempts === LAG_ALERT_AFTER) {
        await sendTelegram(
          ADMIN_TG_ID,
          [
            `⏳ <b>lava.top: платёж есть, подтверждения нет</b>`,
            ``,
            `contract <code>${esc(contractId)}</code>`,
            `order <code>${esc(orderId)}</code>`,
            `их статус: <code>${esc(invoice.status)}</code> вместо COMPLETED`,
            ``,
            `Событие пришло ${attempts} раз, контракт так и не исполнен. Выдачи не было.`,
          ].join("\n"),
        );
      }
    } catch (err) {
      console.error("[lava-webhook] lag counter failed:", err);
    }
    return retry("status_lag");
  }

  // Неудачный платёж: выдавать нечего и отзывать нечего — подтверждаем.
  if (invoice.status !== "COMPLETED") {
    return NextResponse.json({ ok: true, status: invoice.status });
  }

  // ── Сверка суммы ──────────────────────────────────────────────────────────
  //
  // Сначала запись, сделанная при выставлении счёта: она переживает правку
  // курса EUR_PER_USD, после которой пересчёт «как сейчас» отверг бы честно
  // оплаченный евровый счёт. Записи может не быть — тогда считаем из прайса.
  const paid = Number(invoice.receipt?.amount);
  const currency = str(invoice.receipt?.currency);
  const stored = await getCharge(contractId).catch(() => null);
  let expected: { amount: number; currency: string } | null = null;
  if (stored !== null) {
    expected = { amount: stored.amount, currency: stored.currency };
  } else {
    const priceUsd = priceUsdForOrderId(parsed);
    try {
      expected =
        priceUsd === null
          ? null
          : { amount: chargeIn(priceUsd, currency as LavaCurrency), currency };
    } catch {
      expected = null;
    }
  }

  if (
    expected === null ||
    currency !== expected.currency ||
    !Number.isFinite(paid) ||
    Math.abs(paid - expected.amount) > 0.01
  ) {
    console.error("[lava-webhook] amount mismatch", { orderId, paid, currency, expected });
    await sendTelegram(
      ADMIN_TG_ID,
      [
        `⚠️ <b>lava.top: сумма не сошлась</b>`,
        ``,
        `order <code>${esc(orderId)}</code>`,
        `expected: ${expected === null ? "?" : `${expected.amount} ${esc(expected.currency)}`}`,
        `paid: ${Number.isFinite(paid) ? paid : "?"} ${esc(currency)}`,
        `contract <code>${esc(contractId)}</code>`,
        ``,
        `Подписка НЕ выдана.`,
      ].join("\n"),
    );
    return NextResponse.json({ ok: true, status: "amount_mismatch" });
  }

  // ── Ступень 1: выдача (граница, после которой повтор удваивал бы) ─────────
  let summaryLine = "";
  try {
    if (parsed.type === "plan") {
      const plan = resolvePlan(parsed.kind, parsed.term);
      if (!plan) return NextResponse.json({ ok: true, ignored: "bad plan" });
      await applyPlanPurchase(userId, plan);
      summaryLine = `${parsed.kind === "plan3" ? "3 devices" : "1 device"} · ${parsed.term} mo`;
    } else {
      await applyDeviceAddon(userId);
      summaryLine = "+1 device · 30 days";
    }
  } catch (err) {
    console.error("[lava-webhook] grant failed, requesting retry:", err);
    return retry("grant_failed");
  }

  // ── Ступень 2: синхронизация и уведомления (повтору не подлежит) ──────────
  try {
    await syncAllExpiry(userId);
    await markTopup(userId);
  } catch (err) {
    console.error("[lava-webhook] post-grant sync failed:", err);
    await sendTelegram(
      ADMIN_TG_ID,
      `⚠️ <b>lava.top: выдано, но синхронизация не прошла</b>\nuser <code>${esc(userId)}</code>, contract <code>${esc(contractId)}</code>. Запустить syncAllExpiry вручную.`,
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

  const fee = Number(invoice.receipt?.fee);
  await sendTelegram(
    ADMIN_TG_ID,
    [
      `🌋 <b>Kovra: оплата через lava.top</b>`,
      ``,
      `${summaryLine}`,
      `списано: ${paid} ${esc(currency)}` + (Number.isFinite(fee) ? ` · комиссия ${fee}` : ""),
      `user <code>${esc(userId)}</code>`,
      `contract <code>${esc(contractId)}</code>`,
    ].join("\n"),
  );

  // ── Реферальная награда за первую оплаченную покупку ──────────────────────
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
    console.error("[lava-webhook] referral reward error:", err);
  }

  return NextResponse.json({ ok: true, status: "paid" });
}
