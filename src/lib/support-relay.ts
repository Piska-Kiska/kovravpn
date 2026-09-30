// src/lib/support-relay.ts
//
// Messages to the bot that no screen is waiting for (free text, photos,
// screenshots) reach the owner, and the owner's reply reaches the person.
//
//   user → bot:   forwardToSupport() forwards the message to the owner's chat
//                 (ADMIN_TG_ID) and adds a card under it: Telegram id,
//                 @username, name, account id and language. Both message ids
//                 in the owner's chat map back to the user's chat for 30 days.
//   owner → user: an owner's message that is a Telegram reply to one of those
//                 two messages is copied to the user (text, photo, anything
//                 copyMessage takes), and the owner gets a one-line receipt.
//
// Limits: 5 forwards per user per 10 minutes, so nobody can flood the owner;
// over the limit nothing is forwarded and the person is told to wait.
// Commands, six-character sign-in codes and the owner's own messages are
// never forwarded (the webhook handles them before this).
//
// Every Telegram call goes through TelegramApi (never throws); Redis errors
// propagate to the webhook, which answers 200 anyway.

import { redis } from "./redis";
import { rateLimit } from "./ratelimit";
import { ADMIN_TG_ID } from "./bot-owner";
import { escapeHtml } from "./admin-alert";
import type { TelegramApi, TgMessage } from "./bot-v2/telegram";

/** Forwards one user may send per window. */
export const SUPPORT_FORWARDS_PER_WINDOW = 5;
export const SUPPORT_WINDOW_SEC = 600;
/** How long an owner's reply can still find its user. */
export const SUPPORT_MAP_TTL_SEC = 30 * 24 * 60 * 60;

const mapKey = (adminMessageId: number): string => `support:msg:${adminMessageId}`;

/** The sender as Telegram describes it (message.from). */
export interface SupportSender {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}

export interface ForwardInput {
  /** The user's private chat with the bot. */
  chatId: number;
  messageId: number;
  from: SupportSender | undefined;
  /** The account the chat speaks for (resolved alias), for the card. */
  userId: string;
  /** The language the bot uses with this person. */
  lang: string;
}

export type ForwardResult = "forwarded" | "rate_limited" | "failed";

/** Text a message carries that must never be forwarded: a command or a sign-in code. */
export function isNotForSupport(text: string | undefined | null): boolean {
  if (typeof text !== "string") return false;
  const t = text.trim();
  return t.startsWith("/") || /^[A-Za-z0-9]{6}$/.test(t);
}

/** The card under a forwarded message. HTML; every user-supplied part escaped. */
export function supportCard(input: ForwardInput): string {
  const f = input.from;
  const name = [f?.first_name, f?.last_name].filter((x): x is string => typeof x === "string" && x.length > 0).join(" ");
  const parts = [
    "💬 <b>Support</b>: reply to this message to answer",
    `tg <code>${input.chatId}</code>${f?.username ? ` @${escapeHtml(f.username)}` : ""}${name ? ` · ${escapeHtml(name.slice(0, 64))}` : ""}`,
    `account <code>${escapeHtml(input.userId)}</code>`,
    `lang ${escapeHtml(input.lang)}${f?.language_code ? ` (Telegram: ${escapeHtml(f.language_code.slice(0, 8))})` : ""}`,
  ];
  return parts.join("\n");
}

/** Forward a user's message to the owner, with the card and the reply mapping. */
export async function forwardToSupport(api: TelegramApi, input: ForwardInput): Promise<ForwardResult> {
  if (String(input.chatId) === ADMIN_TG_ID) return "failed";
  const rl = await rateLimit(`support:fwd:${input.chatId}`, SUPPORT_FORWARDS_PER_WINDOW, SUPPORT_WINDOW_SEC);
  if (!rl.ok) return "rate_limited";

  const fwd = await api.call<TgMessage>("forwardMessage", {
    chat_id: ADMIN_TG_ID,
    from_chat_id: input.chatId,
    message_id: input.messageId,
  });
  if (!fwd.ok) {
    console.error(JSON.stringify({ evt: "support.forward_failed", chatId: input.chatId, error: fwd.description }));
    return "failed";
  }
  const forwardedId = typeof fwd.result?.message_id === "number" ? fwd.result.message_id : null;
  if (forwardedId !== null) {
    await redis.set(mapKey(forwardedId), String(input.chatId), { ex: SUPPORT_MAP_TTL_SEC });
  }

  const card = await api.call<TgMessage>("sendMessage", {
    chat_id: ADMIN_TG_ID,
    text: supportCard(input),
    parse_mode: "HTML",
    ...(forwardedId !== null ? { reply_parameters: { message_id: forwardedId, allow_sending_without_reply: true } } : {}),
  });
  if (card.ok && typeof card.result?.message_id === "number") {
    await redis.set(mapKey(card.result.message_id), String(input.chatId), { ex: SUPPORT_MAP_TTL_SEC });
  }
  console.info(JSON.stringify({ evt: "support.forwarded", chatId: input.chatId }));
  return "forwarded";
}

export type ReplyResult = "not_a_support_reply" | "sent" | "failed";

/**
 * An owner's message: when it replies to a forwarded message or its card,
 * copy it to that user and confirm to the owner. Anything else is left to
 * the other handlers ("not_a_support_reply").
 */
export async function relayOwnerReply(
  api: TelegramApi,
  message: { chat?: { id?: number }; message_id?: number; reply_to_message?: { message_id?: number } },
): Promise<ReplyResult> {
  const ownerChat = message.chat?.id;
  const repliedTo = message.reply_to_message?.message_id;
  if (String(ownerChat) !== ADMIN_TG_ID || typeof repliedTo !== "number" || typeof message.message_id !== "number") {
    return "not_a_support_reply";
  }
  const target = await redis.get(mapKey(repliedTo));
  const userChat = typeof target === "number" ? target : typeof target === "string" && /^\d{1,20}$/.test(target) ? Number(target) : null;
  if (userChat === null) return "not_a_support_reply";

  const copied = await api.call<{ message_id: number }>("copyMessage", {
    chat_id: userChat,
    from_chat_id: ownerChat,
    message_id: message.message_id,
  });
  const receipt = copied.ok ? "✅ Sent to the user." : `⚠️ Not delivered: ${escapeHtml(copied.description.slice(0, 200))}`;
  await api.call("sendMessage", {
    chat_id: ADMIN_TG_ID,
    text: receipt,
    parse_mode: "HTML",
    reply_parameters: { message_id: message.message_id, allow_sending_without_reply: true },
  });
  if (!copied.ok) {
    console.error(JSON.stringify({ evt: "support.reply_failed", userChat, error: copied.description }));
    return "failed";
  }
  console.info(JSON.stringify({ evt: "support.replied", userChat }));
  return "sent";
}
