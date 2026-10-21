// src/lib/lava-webhook-handler.ts
//
// Приём событий lava.top — обработчик маршрута /api/payment/lava-webhook,
// вынесенный в библиотеку, чтобы его мог вызвать и админ-бот (кнопка
// «Зачислить сейчас», lib/lava-admin-credit.ts): денежный путь один. Порядок и запреты те же, что у cashera-webhook, и по
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
//
// КОНТРАКТ, КОТОРОГО «НЕТ» (11–12.10.2026). Их чтение по номеру стало отвечать
// 404 на контракты, об оплате которых они сами только что прислали событие.
// Здесь это читалось как «чужой контракт» и подтверждалось кодом 200 — а на 200
// лава не повторяет: оплата терялась молча (так на соседнем сайте за два дня
// не зачислилась ни одна). Теперь успех ищется вторым путём, в списке
// исполненных контрактов того же ключа (lib/lava-lookup.ts). Контракт, который
// выставили мы и которого нет и там, — не «чужой»: просим повторить и тревожим.

import { NextRequest, NextResponse } from "next/server";
import { markTopup, resolveUserId } from "@/lib/accounts";
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
  findCompletedInvoice,
  getInvoice,
  isContractId,
  isLavaNotFound,
  lavaConfigured,
  orderIdFor,
  ownOrderIdFor,
  verifyWebhookAuth,
  type LavaInvoice,
} from "@/lib/lava";
import { lookupContract, paidByEvent, type EventProof } from "@/lib/lava-lookup";
import { forgetPendingEvent, pendingFromPayload, rememberPendingEvent } from "@/lib/lava-pending";
import { chargeIn, getCharge, priceUsdForOrderId, type ExpectedCharge } from "@/lib/lava-purchase";
import { addBalanceUsd, parseTopupOrderId } from "@/lib/bot-wallet";
import type { LavaCurrency } from "@/lib/lava-methods";
import { redis } from "@/lib/redis";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { ADMIN_TG_ID } from "@/lib/bot-owner";
import { noticeCents, noticeProductOf, notifyUser } from "@/lib/bot-v2/notify";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DEDUP_TTL_SEC = 90 * 86400;
/** После какой по счёту попытки отставание их статуса перестаёт быть рябью. */
const LAG_ALERT_AFTER = 5;
const LAG_TTL_SEC = 6 * 60 * 60;
/** «Их API не показывает оплаченный контракт» — не чаще раза на контракт за это время. */
const NOT_VISIBLE_ALERT_TTL_SEC = 6 * 60 * 60;
/** «Чтение по номеру не находит, взято из списка» — раз в сутки на всю линию. */
const BY_ID_ALERT_TTL_SEC = 24 * 60 * 60;

interface InlineKeyboardButton {
  readonly text: string;
  readonly callback_data: string;
}

/** "✅ Зачислить сейчас" under an alert: lib/admin-bot.ts routes it to lib/lava-admin-credit.ts. */
function creditButton(contractId: string): InlineKeyboardButton[][] {
  return [[{ text: "✅ Зачислить сейчас", callback_data: `adm:lavaok:${contractId}` }]];
}

async function sendTelegram(chatId: string, text: string, kb?: InlineKeyboardButton[][]): Promise<void> {
  if (!chatId || !BOT_TOKEN) return;
  try {
    await fetchWithTimeout(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...(kb === undefined ? {} : { reply_markup: { inline_keyboard: kb } }),
      }),
      timeoutMs: 5000,
    });
  } catch (err) {
    console.error("[lava-webhook] sendTelegram error:", err);
  }
}

/**
 * Сообщение админу не чаще раза за `ttlSeconds` по ключу `key`.
 *
 * Никогда не бросает: сбой счётчика не должен менять ответ лаве.
 */
async function alertOnce(
  key: string,
  ttlSeconds: number,
  lines: readonly string[],
  kb?: InlineKeyboardButton[][],
): Promise<void> {
  try {
    if (await reserveDedupKey(key, ttlSeconds)) await sendTelegram(ADMIN_TG_ID, lines.join("\n"), kb);
  } catch (err) {
    console.error("[lava-webhook] alert failed:", err);
  }
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

/**
 * Who calls the handler besides lava.top. The admin's button or command
 * (lib/lava-admin-credit.ts) passes `{ source: "admin" }`: the request is
 * built in this process, so its headers prove nothing and are not checked —
 * the admin's word stands for the webhook secret. A caller from outside
 * never reaches this parameter: the route passes null.
 */
export interface LavaTrustedCaller {
  readonly source: "admin";
}

export async function handleLavaWebhook(
  req: NextRequest,
  trusted: LavaTrustedCaller | null = null,
): Promise<NextResponse> {
  if (!lavaConfigured) {
    console.error("[lava-webhook] not configured");
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const auth = trusted === null ? verifyWebhookAuth(req.headers) : "ok";
  if (auth === "bad") {
    console.warn("[lava-webhook] rejected: bad credentials");
    // Разъехавшийся секрет — тихая катастрофа: событий не будет ни одного, все
    // оплаты повиснут невыданными, и увидеть это можно только в журнале
    // функции, куда никто не смотрит без повода. Поэтому тревога.
    //
    // Не чаще раза в час: по этому адресу стучат и сканеры, и превращать их в
    // поток сообщений нельзя — иначе первое настоящее потеряется среди них.
    try {
      if (await reserveDedupKey("lava_auth_alert", 3600)) {
        await sendTelegram(
          ADMIN_TG_ID,
          [
            `🔐 <b>lava.top: событие отвергнуто по учётным данным</b>`,
            ``,
            `Заголовок вебхука не сошёлся с LAVA_WEBHOOK_API_KEY.`,
            `Если это лава, а не сканер — <b>ни одна оплата сейчас не доходит</b>.`,
            ``,
            `Сверить секрет в кабинете и в переменных. Следующее такое сообщение — не раньше чем через час.`,
          ].join("\n"),
        );
      }
    } catch {
      /* тревога не должна мешать ответу */
    }
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
  const retry = async (reason: string, extra: Record<string, unknown> = {}): Promise<NextResponse> => {
    await releaseDedupKey(dedupKey).catch(() => {});
    return NextResponse.json({ error: reason, ...extra }, { status: 503 });
  };

  // Источник правды — их API, а не присланное тело. По номеру, а успех,
  // которого по номеру «нет», — ещё и по списку исполненных контрактов.
  const lookup = await lookupContract(
    { byId: getInvoice, inList: findCompletedInvoice, isNotFound: isLavaNotFound },
    contractId,
    event,
  );

  // ── A success their API does not confirm (yet) ───────────────────────────
  //
  // Their API is asked first and its "executed" wins. When it cannot say so —
  // the read failed, neither read knows the contract, or it is still NEW or
  // IN_PROGRESS — a success is credited on the event itself, by the owner's
  // decision of 22.10.2026: the payment is seen, so it is credited at once.
  // Only an event that carried our webhook secret, for a contract we issued,
  // with the sum we recorded for it (paidByEvent). A contract their API calls
  // FAILED is not overruled by an event. Anything short of that keeps the old
  // way: a retry, and the admin is told.
  let invoice: LavaInvoice | null = lookup.kind === "found" ? lookup.invoice : null;
  let byEvent = false;
  let eventRefusal: string | null = null;
  let ownOrderId: string | null = null;
  const unconfirmed =
    invoice === null || invoice.status === "NEW" || invoice.status === "IN_PROGRESS";
  if (event === "payment.success" && unconfirmed) {
    let pointer: string | null;
    let recorded: ExpectedCharge | null;
    try {
      pointer = await ownOrderIdFor(contractId);
      recorded = await getCharge(contractId);
    } catch (err) {
      console.error("[lava-webhook] contract lookup failed:", err);
      return retry("storage_unavailable");
    }
    ownOrderId = pointer ?? recorded?.orderId ?? null;
    if (ownOrderId !== null) {
      const proof: EventProof =
        auth !== "ok"
          ? { kind: "refused", reason: "секрет вебхука не задан (LAVA_WEBHOOK_API_KEY)" }
          : pointer !== null && recorded !== null && pointer !== recorded.orderId
            ? { kind: "refused", reason: "указатель и запись счёта называют разные заказы" }
            : paidByEvent(payload, contractId, recorded);
      if (proof.kind === "paid") {
        invoice = proof.invoice;
        byEvent = true;
        console.warn("[lava-webhook] credited on the event, their API does not confirm", contractId, lookup.kind);
      } else {
        eventRefusal = proof.reason;
      }
    }
  }

  if (!byEvent && lookup.kind === "failed") {
    console.error("[lava-webhook] invoice fetch failed:", lookup.error);
    return retry("upstream_unavailable");
  }
  if (!byEvent && lookup.kind === "unknown") {
    // Их API контракта не знает. Чужой он или подделан — решают НАШИ записи
    // (указатель и ожидаемая сумма, обе пишутся при выставлении счёта), а не
    // их ответ: 404 по номеру они отдавали и на оплаченные контракты.
    if (ownOrderId !== null) {
      // Счёт выставляли мы, лава говорит «оплачен», а показать его не может,
      // и само событие зачислить не позволило. Подтвердить — значит потерять
      // оплату: просим повторить (у них девятнадцать попыток за пять часов) и
      // говорим об этом вслух.
      console.error("[lava-webhook] paid contract their API does not show", contractId, eventRefusal);
      if (trusted !== null) return retry("contract_not_visible");
      // What lava sent is kept as evidence for the admin's "credit now"; an
      // event the admin built from our own record is not evidence.
      await rememberPendingEvent(
        contractId,
        pendingFromPayload(payload, auth === "ok" ? "ok" : "unconfigured", eventRefusal ?? "?", Date.now()),
      );
      await alertOnce(`lava_not_visible_alert:${contractId}`, NOT_VISIBLE_ALERT_TTL_SEC, [
        `⚠️ <b>lava.top: оплата пришла, а их API счёт не показывает</b>`,
        ``,
        `order <code>${esc(ownOrderId)}</code>`,
        `contract <code>${esc(contractId)}</code>`,
        ``,
        `Событие об оплате пришло, но ни по номеру, ни в списке оплаченных счетов контракта нет. <b>Ничего НЕ выдано.</b>`,
        `По самому событию не зачислено: ${esc(eventRefusal ?? "?")}.`,
        `Лава повторит событие в течение пяти часов. Деньги у покупателя уже списаны — кнопка ниже зачисляет по нашей записи счёта сейчас.`,
      ], creditButton(contractId));
      return retry("contract_not_visible");
    }
    // Не наш счёт: событие чужое либо поддельное. Просить повтор бессмысленно.
    // Ключ освобождаем — мы ничего не сделали, и повторная отправка из
    // кабинета не должна упереться в «дубликат».
    console.warn("[lava-webhook] unknown contract", contractId);
    await releaseDedupKey(dedupKey).catch(() => {});
    return NextResponse.json({ ok: true, ignored: "unknown contract" });
  }
  if (invoice === null) {
    // Not reachable: a lookup that found nothing returned above unless the
    // event was taken, and a taken event sets the invoice.
    return retry("upstream_unavailable");
  }
  /** The line the admin's payment message gets when the event alone proved it. */
  const apiSaid = esc(lookup.kind === "found" ? lookup.invoice.status : lookup.kind);
  const proofLine = !byEvent
    ? ""
    : trusted?.source === "admin"
      ? `\n🧾 зачислено по слову админа: их API оплату не подтвердил (${apiSaid}). Сверить контракт в кабинете lava.`
      : `\n🔔 зачислено по событию lava: их API оплату не подтвердил (${apiSaid}). Сверить контракт в кабинете lava.`;
  if (lookup.kind === "found" && lookup.via === "list") {
    console.warn("[lava-webhook] contract not found by id, taken from the list", contractId);
    await alertOnce("lava_by_id_404_alert", BY_ID_ALERT_TTL_SEC, [
      `ℹ️ <b>lava.top: счёт не находится по номеру, взят из списка</b>`,
      ``,
      `contract <code>${esc(contractId)}</code>`,
      ``,
      `Чтение счёта по номеру у лавы отвечает «не найдено», оплата подтверждена по списку оплаченных счетов и обрабатывается как обычно.`,
      `Делать ничего не нужно. Следующее такое сообщение — не раньше чем через сутки.`,
    ]);
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
    // Обрабатывать чужой контракт нельзя: ни заказа, ни суммы у нас нет.
    //
    // Но если он ОПЛАЧЕН — молчать тоже нельзя. Вебхук у lava.top вешается на
    // API-ключ, и оплаченное событие чужого проекта здесь означает ровно одно:
    // ключи и адреса перепутаны, деньги взяты, а выдачи не будет ни у нас, ни
    // у соседа. Неоплаченные чужие события проходят тихо — их много и они
    // ничего не стоят.
    if (invoice.status === "COMPLETED") {
      await sendTelegram(
        ADMIN_TG_ID,
        [
          `⚠️ <b>lava.top: оплачен контракт ЧУЖОГО проекта</b>`,
          ``,
          `контракт <code>${esc(contractId)}</code>`,
          `метка источника: <code>${esc(utmSource)}</code>, а мы — <code>${esc(LAVA_UTM_SOURCE)}</code>`,
          `сумма: ${esc(invoice.receipt?.amount)} ${esc(invoice.receipt?.currency)}`,
          ``,
          `Похоже, вебхук повешен не на тот API-ключ. Выдачи не было НИГДЕ.`,
        ].join("\n"),
      );
    }
    return NextResponse.json({ ok: true, ignored: "another project" });
  }

  let orderId: string | null;
  try {
    // An event taken on its own names our order by our own records only.
    orderId = byEvent ? ownOrderId : await orderIdFor(contractId, invoice);
  } catch (err) {
    console.error("[lava-webhook] contract lookup failed:", err);
    return retry("storage_unavailable");
  }

  // Два вида покупки на одной линии, и различаются они только видом номера.
  //
  // `sub_…`/`dev_…` — покупка подписки с сайта. `topup_…` — пополнение
  // кошелька из бота: тарифы бот покупает с кошелька, поэтому валютная линия
  // пополняет именно его. Без этой ветки оплата из бота дошла бы до сюда и
  // упала в «контракт без покупки» — деньги взяты, кошелёк пуст.
  const topup = orderId === null ? null : parseTopupOrderId(orderId);
  const parsed = orderId === null ? null : parseSubOrderId(orderId);
  // Владелец покупки — то из двух, что разобралось. Оба вида несут userId, и
  // одна переменная избавляет от приведений типов ниже по коду.
  const owner = topup ?? parsed;
  if (owner === null) {
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

  const userId = owner.userId;

  // Успех, о котором их собственный API ещё не знает.
  //
  // Ключ дедупликации уже занят, а на 200 повторов не будет — то есть
  // оплаченная подписка осталась бы невыданной МОЛЧА. Просим повторить: у лавы
  // девятнадцать попыток за пять часов, чтобы догнать собственный статус.
  if (event === "payment.success" && invoice.status !== "COMPLETED") {
    console.warn("[lava-webhook] payment.success while the contract is", invoice.status);
    // Their status is their word: the admin's event does not overrule it, and
    // it is not kept as evidence either (see the not-visible branch above).
    if (trusted !== null) return retry("status_lag", { theirStatus: invoice.status });
    await rememberPendingEvent(
      contractId,
      pendingFromPayload(
        payload,
        auth === "ok" ? "ok" : "unconfigured",
        `их статус ${invoice.status}${eventRefusal === null ? "" : `; ${eventRefusal}`}`,
        Date.now(),
      ),
    );
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
            ...(eventRefusal === null ? [] : [`По самому событию не зачислено: ${esc(eventRefusal)}.`]),
            `Кнопка ниже зачисляет по нашей записи счёта, если деньги у покупателя списаны.`,
          ].join("\n"),
          creditButton(contractId),
        );
      }
    } catch (err) {
      console.error("[lava-webhook] lag counter failed:", err);
    }
    return retry("status_lag", { theirStatus: invoice.status });
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
  } else if (parsed !== null) {
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
  // У пополнения кошелька пересчитать нечего: сумму выбирал человек, и знать
  // её можно только из записи. Нет записи — не зачисляем, будет тревога ниже.

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

  // ── Пополнение кошелька ──────────────────────────────────────────────────
  //
  // Зачисляем ДОЛЛАРЫ, выбранные человеком, а не списанную сумму: у еврового
  // счёта это разные числа, и зачислить €9.20 как $9.20 значит подарить
  // разницу или отобрать её.
  if (topup !== null) {
    const usd = stored?.priceUsd;
    if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
      await sendTelegram(
        ADMIN_TG_ID,
        `⚠️ <b>lava.top: оплачено пополнение без записи</b>\nконтракт <code>${esc(contractId)}</code>, пополнение <code>${esc(orderId)}</code>. Кошелёк НЕ пополнен — зачислить вручную.`,
      );
      return NextResponse.json({ ok: true, status: "no topup record" });
    }
    // The account the order's id belongs to now (a linked Telegram account moved).
    const walletOwner = await resolveUserId(userId);
    let newBal: number;
    try {
      newBal = await addBalanceUsd(walletOwner, usd);
    } catch (err) {
      console.error("[lava-webhook] wallet credit failed, requesting retry:", err);
      return retry("credit_failed");
    }
    await notifyUser(
      walletOwner,
      { kind: "topup", amountCents: noticeCents(usd), balanceCents: noticeCents(newBal) },
      [
        `✅ <b>Balance topped up</b>`,
        ``,
        `💵 +$${usd.toFixed(2)}`,
        `💰 Balance: <b>$${newBal.toFixed(2)}</b>`,
      ].join("\n"),
    );
    const feeTopup = Number(invoice.receipt?.fee);
    await sendTelegram(
      ADMIN_TG_ID,
      [
        `🌋 <b>Kovra: пополнение кошелька через lava.top</b>`,
        ``,
        `+$${usd.toFixed(2)} · списано ${paid} ${esc(currency)}` +
          (Number.isFinite(feeTopup) ? ` · комиссия ${feeTopup}` : ""),
        `user <code>${esc(userId)}</code>`,
        `contract <code>${esc(contractId)}</code>` + proofLine,
      ].join("\n"),
    );
    await forgetPendingEvent(contractId);
    return NextResponse.json({ ok: true, status: "credited" });
  }

  // Дальше — только покупка подписки: пополнение кошелька вышло выше, а
  // «ни то, ни другое» отсеяно ещё до сверки суммы.
  if (parsed === null) {
    return NextResponse.json({ ok: true, ignored: "no purchase" });
  }

  // The account the order's id belongs to now: a Telegram account linked to
  // an e-mail one after the order was made moved there, so the plan lands
  // where it is seen (as top-ups already do).
  let grantee: string;
  try {
    grantee = await resolveUserId(userId);
  } catch (err) {
    console.error("[lava-webhook] owner lookup failed, requesting retry:", err);
    return retry("owner_lookup_failed");
  }

  // ── Ступень 1: выдача (граница, после которой повтор удваивал бы) ─────────
  let summaryLine = "";
  try {
    if (parsed.type === "plan") {
      const plan = resolvePlan(parsed.kind, parsed.term);
      if (!plan) return NextResponse.json({ ok: true, ignored: "bad plan" });
      await applyPlanPurchase(grantee, plan);
      summaryLine = `${parsed.kind === "plan3" ? "3 devices" : "1 device"} · ${parsed.term} mo`;
    } else {
      await applyDeviceAddon(grantee);
      summaryLine = "+1 device · 30 days";
    }
  } catch (err) {
    console.error("[lava-webhook] grant failed, requesting retry:", err);
    return retry("grant_failed");
  }

  // ── Ступень 2: синхронизация и уведомления (повтору не подлежит) ──────────
  try {
    await syncAllExpiry(grantee);
    await markTopup(grantee);
  } catch (err) {
    console.error("[lava-webhook] post-grant sync failed:", err);
    await sendTelegram(
      ADMIN_TG_ID,
      `⚠️ <b>lava.top: выдано, но синхронизация не прошла</b>\nuser <code>${esc(grantee)}</code>, contract <code>${esc(contractId)}</code>. Запустить syncAllExpiry вручную.`,
    );
  }

  const subs = await getSubscriptions(grantee).catch(() => []);
  const s = summarize(subs);
  const lines = [
    `✅ <b>Payment received</b>`,
    ``,
    `🎟 ${summaryLine}`,
    `📱 Active devices: <b>${s.activeSlots}</b>`,
  ];
  if (s.maxExpiry > 0) lines.push(`📅 Active until: <b>${fmtDate(s.maxExpiry)}</b>`);
  await notifyUser(
    grantee,
    { kind: "purchase", product: noticeProductOf(parsed), activeSlots: s.activeSlots, untilMs: s.maxExpiry },
    lines.join("\n"),
  );

  const fee = Number(invoice.receipt?.fee);
  await sendTelegram(
    ADMIN_TG_ID,
    [
      `🌋 <b>Kovra: оплата через lava.top</b>`,
      ``,
      `${summaryLine}`,
      `списано: ${paid} ${esc(currency)}` + (Number.isFinite(fee) ? ` · комиссия ${fee}` : ""),
      `user <code>${esc(grantee)}</code>`,
      `contract <code>${esc(contractId)}</code>` + proofLine,
    ].join("\n"),
  );
  await forgetPendingEvent(contractId);

  // ── Реферальная награда за первую оплаченную покупку ──────────────────────
  try {
    const ref = await grantReferralReward(grantee);
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
    console.error("[lava-webhook] referral reward error:", err);
  }

  return NextResponse.json({ ok: true, status: "paid" });
}
