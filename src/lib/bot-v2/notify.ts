// src/lib/bot-v2/notify.ts
//
// Messages the bot sends on its own: payment and top-up confirmations from
// the payment webhooks, the referral reward, and the expiry reminders of the
// daily cron.
//
// Chats behind the bot v2 gate get them in their own language with buttons
// (Open Kovra, My devices, Renew, and "Pay for …" after a top-up made for an
// order). Every other chat gets exactly the text its caller built before this
// module existed (`legacyText`): the old interface stays as it was until the
// owner opens the gate.
//
// Never throws, and returns whether Telegram accepted the message (the cron
// only marks a reminder sent when it was).

import { getUserRecord } from "../accounts";
import { resolveLang, type BotLang } from "../bot-i18n";
import { getBalanceCents } from "../bot-wallet";
import { fetchWithTimeout } from "../fetch-timeout";
import { DEVICE_ADDON_DAYS, REFERRAL_REWARD_DAYS, type ParsedOrder, type PlanKind, type Term } from "../subscriptions";
import { cb } from "./callbacks";
import { isBotV2 } from "./gate";
import { fmtDate, fmtUsd, tr } from "./i18n";
import { miniAppPageUrl } from "./links";
import { readPendingOrder, type PendingOrder } from "./pending-order";
import { productCents, productSummary } from "./screens";
import { sanitizeKeyboard, type Keyboard, type Screen } from "./telegram";

export type NoticeProduct = { kind: PlanKind; term: Term } | { kind: "device"; days: number };

export type UserNotice =
  | { kind: "topup"; amountCents: number; balanceCents: number }
  | { kind: "purchase"; product: NoticeProduct; activeSlots: number; untilMs: number }
  | { kind: "referral_reward" }
  | { kind: "expiring"; hoursLeft: number }
  | { kind: "expired" };

/** An order the person topped up for, once the balance covers it. */
export type PendingPay = PendingOrder;

function productLine(p: NoticeProduct, lang: BotLang): string {
  if (p.kind === "device") return tr("sum.slotDays", lang, { days: p.days });
  return productSummary(p.kind, p.term, lang);
}

/** The v2 message for a notice. Pure. `pendingPay`: an order the new balance covers. */
export function renderNotice(notice: UserNotice, lang: BotLang, pendingPay: PendingPay | null = null): Screen {
  const open = [{ text: tr("btn.open", lang), web_app: { url: miniAppPageUrl(lang) } }];
  const devices = [{ text: tr("btn.devices", lang), callback_data: cb({ a: "devs" }) }];
  const renew = [{ text: tr("btn.renew", lang), callback_data: cb({ a: "renew", from: "w" }) }];
  switch (notice.kind) {
    case "topup": {
      const kb: Keyboard = [];
      if (pendingPay) {
        kb.push([
          {
            text: tr("btn.payPending", lang, { summary: productSummary(pendingPay.product, pendingPay.term, lang) }),
            callback_data: cb({ a: "order", product: pendingPay.product, term: pendingPay.term, from: pendingPay.from }),
          },
        ]);
      }
      kb.push([{ text: tr("btn.wallet", lang), callback_data: cb({ a: "wallet" }) }], open);
      return {
        text: [
          tr("nt.topup", lang, { amount: fmtUsd(notice.amountCents) }),
          tr("nt.balance", lang, { bal: fmtUsd(notice.balanceCents) }),
        ].join("\n"),
        kb,
      };
    }
    case "purchase":
      return {
        text: [
          tr("nt.purchase", lang, { summary: productLine(notice.product, lang) }),
          notice.untilMs > 0
            ? tr("nt.until", lang, { date: fmtDate(notice.untilMs, lang), slots: notice.activeSlots })
            : null,
        ]
          .filter((l): l is string => l !== null)
          .join("\n"),
        kb: [devices, open],
      };
    case "referral_reward":
      return { text: tr("nt.ref", lang, { days: REFERRAL_REWARD_DAYS }), kb: [devices, open] };
    case "expiring":
      return { text: tr("nt.expiring", lang, { hours: Math.max(1, Math.round(notice.hoursLeft)) }), kb: [renew, open] };
    case "expired":
      return { text: tr("nt.expired", lang), kb: [renew, open] };
  }
}

/** The Telegram chat of an account: tg_<id> accounts are their chat; others by the linked Telegram id. */
export async function chatIdForUser(userId: string): Promise<number | null> {
  let raw: string | null = null;
  if (userId.startsWith("tg_")) raw = userId.slice(3);
  else {
    const user = await getUserRecord(userId).catch(() => null);
    if (user?.telegramId) raw = String(user.telegramId);
  }
  if (raw === null || !/^[1-9][0-9]{0,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

async function sendMessage(chatId: number, text: string, kb: Keyboard | null): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) return false;
  try {
    const res = await fetchWithTimeout(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(kb ? { reply_markup: { inline_keyboard: sanitizeKeyboard(kb, chatId) } } : {}),
      }),
      timeoutMs: 5000,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { description?: string } | null;
      console.error(JSON.stringify({ evt: "bot.notify_failed", chatId, status: res.status, description: body?.description }));
    }
    return res.ok;
  } catch (err) {
    console.error(JSON.stringify({ evt: "bot.notify_failed", chatId, error: err instanceof Error ? err.message : String(err) }));
    return false;
  }
}

async function pendingPayFor(userId: string, notice: UserNotice): Promise<PendingPay | null> {
  if (notice.kind !== "topup") return null;
  const pending = await readPendingOrder(userId);
  if (!pending) return null;
  const balance = await getBalanceCents(userId).catch(() => notice.balanceCents);
  return balance >= productCents(pending.product, pending.term) ? pending : null;
}

/** Notify a known chat. See the header. */
export async function notifyChat(chatId: number, userId: string, notice: UserNotice, legacyText: string): Promise<boolean> {
  try {
    if (!(await isBotV2(chatId))) return await sendMessage(chatId, legacyText, null);
    const lang = await resolveLang(userId).catch(() => "en" as const);
    const screen = renderNotice(notice, lang, await pendingPayFor(userId, notice).catch(() => null));
    return await sendMessage(chatId, screen.text, screen.kb);
  } catch (err) {
    console.error("[bot-v2/notify] failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** Notify an account's Telegram chat, if it has one. See the header. */
export async function notifyUser(userId: string, notice: UserNotice, legacyText: string): Promise<boolean> {
  try {
    const chatId = await chatIdForUser(userId);
    if (chatId === null) return false;
    return await notifyChat(chatId, userId, notice, legacyText);
  } catch (err) {
    console.error("[bot-v2/notify] failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/** What a paid order bought, for the purchase notice. */
export function noticeProductOf(order: ParsedOrder): NoticeProduct {
  return order.type === "plan" ? { kind: order.kind, term: order.term } : { kind: "device", days: DEVICE_ADDON_DAYS };
}

/** Dollars (as the webhooks hold them) → integer cents for a notice. */
export function noticeCents(usd: number): number {
  return Number.isFinite(usd) ? Math.round(usd * 100) : 0;
}
