// src/lib/lava-admin-credit.ts
//
// The owner credits a lava.top payment the webhook could not: the button
// "✅ Зачислить сейчас" under the alert, or the text `lava <contract id>` in
// the admin chat (lib/admin-bot.ts). Why it exists (22.10.2026): a top-up was
// paid, lava.top's event came at once, their API showed the contract neither
// by id nor in the list, and the owner had to wait for lava.top to repeat the
// event — with the money already taken.
//
// It builds a `payment.success` for the contract from OUR record of the
// charge and hands it to the webhook handler as a trusted caller: the same
// money path, the same dedup key, the same amount check, the same messages
// to the buyer and to the admin. lava.top's own answer still wins when it has
// one: COMPLETED is credited as usual, FAILED is not overruled. The admin's
// word stands for the webhook secret, nothing else changes.
//
// Never throws: whatever happens becomes the message the owner reads.

import { NextRequest } from "next/server";
import { escapeHtml } from "./admin-alert";
import { isContractId, ownOrderIdFor } from "./lava";
import { getPendingEvent, type PendingLavaEvent } from "./lava-pending";
import { getCharge, type ExpectedCharge } from "./lava-purchase";
import { handleLavaWebhook } from "./lava-webhook-handler";

/** `lava <contract id>`, with or without the slash, any case. */
export const LAVA_CREDIT_COMMAND = /^\/?lava\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$/i;

/** The callback_data of the button under an alert: `adm:lavaok:<contract id>`. */
export const LAVA_CREDIT_CALLBACK = "lavaok:";

function when(ms: number): string {
  try {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  } catch {
    return "?";
  }
}

function evidenceLine(pending: PendingLavaEvent | null): string {
  if (pending === null) {
    return "⚠️ Событий от lava об этом контракте в памяти нет (или они старше 7 дней): зачисление — только на ваше слово.";
  }
  const sum =
    pending.amount !== null && pending.currency !== null
      ? `${pending.amount} ${escapeHtml(pending.currency)}`
      : "сумма в событии не названа";
  return `Событие lava: ${when(pending.receivedAt)}, ${sum}, статус <code>${escapeHtml(pending.eventStatus ?? "?")}</code>. Не зачислено тогда: ${escapeHtml(pending.reason)}.`;
}

/** Why the handler will refuse the event we build, when our own records already say so. */
function ownRefusal(pointer: string | null, charge: ExpectedCharge | null): string | null {
  if (charge === null) return "нет нашей записи о сумме счёта — зачислять по событию нечего";
  if (pointer !== null && pointer !== charge.orderId) return "указатель и запись счёта называют разные заказы";
  return null;
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The handler's answer, in the owner's words. */
function verdict(status: number, body: Record<string, unknown>, charge: ExpectedCharge | null, refusal: string | null): string {
  if (body.status === "credited") {
    const usd = charge !== null && Number.isFinite(charge.priceUsd) ? ` на <b>$${charge.priceUsd.toFixed(2)}</b>` : "";
    return `✅ <b>Кошелёк пополнен</b>${usd}. Покупатель получил уведомление. Повтор события от lava теперь отвергнется как дубликат.`;
  }
  if (body.status === "paid") {
    return "✅ <b>Подписка выдана.</b> Покупатель получил уведомление. Повтор события от lava теперь отвергнется как дубликат.";
  }
  if (body.ignored === "duplicate") {
    return "ℹ️ <b>Уже зачислено раньше</b>: ключ этого платежа занят. Если баланс покупателя не вырос — обработка когда-то оборвалась после ключа; тогда «Изменить баланс» в карточке юзера.";
  }
  if (body.error === "status_lag") {
    const theirs = typeof body.theirStatus === "string" ? escapeHtml(body.theirStatus) : "не COMPLETED";
    const why = refusal === null ? "" : ` (${escapeHtml(refusal)})`;
    return `⛔ <b>Не зачислено</b>: lava отвечает статусом <code>${theirs}</code> вместо COMPLETED${why}. Слово админа это не перебивает. Если деньги точно пришли — «Изменить баланс» в карточке юзера.`;
  }
  if (body.error === "contract_not_visible") {
    return `⛔ <b>Не зачислено</b>: ${escapeHtml(refusal ?? "событие не прошло проверку")}. Если деньги точно пришли — «Изменить баланс» в карточке юзера.`;
  }
  if (body.status === "amount_mismatch") {
    return "⛔ <b>Не зачислено</b>: lava подтверждает оплату, но сумма у них не сходится с нашей записью (см. сообщение «сумма не сошлась»).";
  }
  if (body.ignored === "another project") {
    return "⛔ <b>Не зачислено</b>: по данным lava это контракт другого проекта.";
  }
  if (body.status === "no topup record" || body.note === "no purchase" || body.ignored === "no purchase") {
    return "⛔ <b>Не зачислено</b>: lava подтверждает оплату, но заказ к контракту не привязан. «Изменить баланс» в карточке юзера.";
  }
  if (body.ignored === "unknown contract") {
    return "⛔ <b>Не зачислено</b>: контракт мы не выставляли.";
  }
  if (status >= 500) {
    return `⚠️ <b>Не вышло</b>: ${escapeHtml(String(body.error ?? status))}. Повторите через минуту.`;
  }
  return `ℹ️ Ответ обработчика: <code>${escapeHtml(JSON.stringify(body).slice(0, 300))}</code>`;
}

/**
 * Credit the contract on the owner's word. Returns the HTML message for the
 * admin chat. O(1) besides the handler's own work.
 */
export async function creditLavaContractByAdmin(raw: string): Promise<string> {
  const contractId = raw.trim().toLowerCase();
  if (!isContractId(contractId)) {
    return "Это не номер контракта lava. Нужен UUID из сообщения бота или из кабинета lava: <code>lava xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</code>.";
  }

  let pointer: string | null;
  let charge: ExpectedCharge | null;
  try {
    pointer = await ownOrderIdFor(contractId);
    charge = await getCharge(contractId);
  } catch (err) {
    console.error("[lava-admin-credit] records unreadable:", err);
    return "⚠️ База недоступна, записи о контракте не прочитать. Повторите через минуту.";
  }
  const head = [`🧾 <b>lava.top: зачисление по слову админа</b>`, ``, `contract <code>${contractId}</code>`];
  if (pointer === null && charge === null) {
    return [
      ...head,
      ``,
      `⛔ <b>Контракт мы не выставляли</b>: нет ни указателя на заказ, ни записи суммы. Зачислять нечего.`,
      `Если деньги точно пришли — найдите юзера и нажмите «Изменить баланс».`,
    ].join("\n");
  }
  head.push(`order <code>${escapeHtml(pointer ?? charge?.orderId ?? "?")}</code>`);
  if (charge !== null) head.push(`счёт: ${charge.amount} ${escapeHtml(charge.currency)} за $${charge.priceUsd.toFixed(2)}`);

  const pending = await getPendingEvent(contractId);
  const payload: Record<string, unknown> = {
    eventType: "payment.success",
    contractId,
    status: "completed",
    ...(charge === null ? {} : { amount: charge.amount, currency: charge.currency }),
  };
  console.warn("[lava-admin-credit] crediting on the admin's word", contractId, pointer ?? charge?.orderId);

  let status: number;
  let body: Record<string, unknown>;
  try {
    const res = await handleLavaWebhook(
      new NextRequest("https://kovravpn.com/api/payment/lava-webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      { source: "admin" },
    );
    status = res.status;
    body = await readJson(res);
  } catch (err) {
    console.error("[lava-admin-credit] handler threw:", err);
    return [...head, ``, `⚠️ <b>Не вышло</b>: ${escapeHtml(err instanceof Error ? err.message : String(err)).slice(0, 300)}. Повторите через минуту.`].join("\n");
  }

  return [...head, ``, evidenceLine(pending), ``, verdict(status, body, charge, ownRefusal(pointer, charge))].join("\n");
}
