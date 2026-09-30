// src/lib/bot-v2/telegram.ts
//
// The Bot API calls the new bot interface makes, and the one rule that keeps
// a conversation to a single message edited in place:
//
//   editScreen() edits the message. "message is not modified" (the same tap
//   twice, or a Back to the screen already shown) is SUCCESS: nothing to do.
//   Only when the message cannot be edited at all (a photo message from the
//   old UI, a deleted or too old message) is a new one sent, and the old one
//   removed where it still exists. Any other failure (a markup error, a rate
//   limit, the network) is logged and NOT answered with a resend: a resend
//   would fail the same way, or duplicate the screen.
//
// Every function here returns a result and never throws: a failed Telegram
// call must not turn into a 500 that makes Telegram redeliver the update.

import { fetchWithTimeout } from "../fetch-timeout";

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
  web_app?: { url: string };
}

export type Keyboard = InlineButton[][];

/** One screen: Telegram HTML and its inline keyboard. */
export interface Screen {
  text: string;
  kb: Keyboard;
}

export type TgResult<T> =
  | { ok: true; result: T }
  | { ok: false; errorCode: number; description: string };

export interface TgMessage {
  message_id: number;
}

export interface TelegramApi {
  call<T>(method: string, body: Readonly<Record<string, unknown>>): Promise<TgResult<T>>;
  upload<T>(method: string, form: FormData): Promise<TgResult<T>>;
}

const TIMEOUT_MS = 8000;

function toResult<T>(status: number, json: unknown): TgResult<T> {
  const j = (json ?? {}) as { ok?: unknown; result?: unknown; error_code?: unknown; description?: unknown };
  if (j.ok === true) return { ok: true, result: j.result as T };
  return {
    ok: false,
    errorCode: typeof j.error_code === "number" ? j.error_code : status,
    description: typeof j.description === "string" ? j.description : `HTTP ${status}`,
  };
}

/** Bot API client over fetch. `token` is the bot token; nothing is logged with it. */
export function createTelegramApi(token: string): TelegramApi {
  const base = `https://api.telegram.org/bot${token}/`;
  async function run<T>(method: string, init: RequestInit): Promise<TgResult<T>> {
    if (!token) return { ok: false, errorCode: 0, description: "bot token is not configured" };
    try {
      const res = await fetchWithTimeout(base + method, { ...init, method: "POST", timeoutMs: TIMEOUT_MS });
      const json: unknown = await res.json().catch(() => null);
      return toResult<T>(res.status, json);
    } catch (err) {
      return { ok: false, errorCode: 0, description: `network: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  return {
    call: (method, body) =>
      run(method, { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    upload: (method, form) => run(method, { body: form }),
  };
}

// ─── Keyboards ──────────────────────────────────────────────────────────────

/**
 * The keyboard as Telegram will accept it: empty rows dropped, and web_app
 * buttons dropped outside private chats (Telegram rejects the whole keyboard
 * with one in a group, and the message would not go out at all).
 */
export function sanitizeKeyboard(kb: Keyboard, chatId: number): Keyboard {
  const privateChat = chatId > 0;
  return kb
    .map((row) => row.filter((b) => privateChat || b.web_app === undefined))
    .filter((row) => row.length > 0);
}

function messageBody(chatId: number, screen: Screen): Record<string, unknown> {
  return {
    chat_id: chatId,
    text: screen.text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    // Always sent, also when empty: on an edit, an empty keyboard removes the
    // previous one instead of leaving stale buttons under a new text.
    reply_markup: { inline_keyboard: sanitizeKeyboard(screen.kb, chatId) },
  };
}

// ─── Messages ───────────────────────────────────────────────────────────────

/** Send a screen as a new message. Returns its message_id, or null. */
export async function sendScreen(api: TelegramApi, chatId: number, screen: Screen): Promise<number | null> {
  const r = await api.call<TgMessage>("sendMessage", messageBody(chatId, screen));
  if (r.ok) return r.result.message_id;
  console.error(JSON.stringify({ evt: "bot.send_failed", chatId, code: r.errorCode, description: r.description }));
  return null;
}

export type EditFailure = "not_modified" | "cannot_edit" | "other";

/**
 * What an editMessageText error means. Descriptions are Telegram's, e.g.
 * "Bad Request: message is not modified: specified new message content …".
 */
export function classifyEditFailure(description: string): EditFailure {
  const d = description.toLowerCase();
  if (d.includes("message is not modified")) return "not_modified";
  if (
    d.includes("there is no text in the message to edit") ||
    d.includes("message to edit not found") ||
    d.includes("message can't be edited") ||
    d.includes("message_id_invalid")
  ) {
    return "cannot_edit";
  }
  return "other";
}

export type EditOutcome =
  | { kind: "edited"; messageId: number }
  | { kind: "unchanged"; messageId: number }
  | { kind: "resent"; messageId: number }
  | { kind: "failed"; messageId: null };

/** Edit `messageId` into `screen` (see the header for when it resends). */
export async function editScreen(
  api: TelegramApi,
  chatId: number,
  messageId: number,
  screen: Screen,
): Promise<EditOutcome> {
  const r = await api.call<TgMessage | true>("editMessageText", { ...messageBody(chatId, screen), message_id: messageId });
  if (r.ok) return { kind: "edited", messageId };

  const failure = classifyEditFailure(r.description);
  if (failure === "not_modified") return { kind: "unchanged", messageId };
  if (failure === "other") {
    console.error(JSON.stringify({ evt: "bot.edit_failed", chatId, code: r.errorCode, description: r.description }));
    return { kind: "failed", messageId: null };
  }

  const sent = await sendScreen(api, chatId, screen);
  if (sent === null) return { kind: "failed", messageId: null };
  // A photo message from the old interface still exists: remove it so the
  // chat keeps one live screen. "Not found" needs no cleanup.
  if (!r.description.toLowerCase().includes("not found")) await deleteMessage(api, chatId, messageId);
  return { kind: "resent", messageId: sent };
}

/** Delete a message. False when Telegram refuses (too old, already gone). */
export async function deleteMessage(api: TelegramApi, chatId: number, messageId: number): Promise<boolean> {
  const r = await api.call<boolean>("deleteMessage", { chat_id: chatId, message_id: messageId });
  return r.ok;
}

/** Answer a callback query, optionally with a short toast. */
export async function answerCallback(api: TelegramApi, callbackId: string, text?: string): Promise<void> {
  if (!callbackId) return;
  const r = await api.call<boolean>("answerCallbackQuery", {
    callback_query_id: callbackId,
    ...(text ? { text: text.slice(0, 200) } : {}),
  });
  if (!r.ok && !/query is too old|query id is invalid/i.test(r.description)) {
    console.warn(JSON.stringify({ evt: "bot.answer_failed", description: r.description }));
  }
}

/** "typing…" in the chat header while something slow runs. */
export async function sendTyping(api: TelegramApi, chatId: number): Promise<void> {
  await api.call<boolean>("sendChatAction", { chat_id: chatId, action: "typing" });
}

/** Send a PNG as a photo message (multipart). Returns its message_id, or null. */
export async function sendPhotoPng(
  api: TelegramApi,
  chatId: number,
  png: Uint8Array,
  caption: string,
  kb: Keyboard,
): Promise<number | null> {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  // A copy on a plain ArrayBuffer: Blob does not take a Buffer's shared backing store.
  form.append("photo", new Blob([new Uint8Array(png)], { type: "image/png" }), "qr.png");
  form.append("caption", caption);
  form.append("parse_mode", "HTML");
  form.append("reply_markup", JSON.stringify({ inline_keyboard: sanitizeKeyboard(kb, chatId) }));
  const r = await api.upload<TgMessage>("sendPhoto", form);
  if (r.ok) return r.result.message_id;
  console.error(JSON.stringify({ evt: "bot.photo_failed", chatId, code: r.errorCode, description: r.description }));
  return null;
}
