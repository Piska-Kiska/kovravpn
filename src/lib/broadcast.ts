// src/lib/broadcast.ts
//
// Telegram broadcast utilities:
// - getAllTelegramTargets(): scan Redis for all users with linked Telegram chat
// - resolveUserIds(userIds): resolve list of userIds to {userId, chatId} pairs
// - broadcastToUsers(payload, targets): send to all targets with rate limit

import { redis } from "./redis";

const TG_API = "https://api.telegram.org/bot";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const SAFE_RATE_PER_SEC = 25;

export interface BroadcastTarget {
  userId: string;
  chatId: number;
}

export interface BroadcastResult {
  total: number;
  sent: number;
  failed: number;
  blocked: number;
  errors: { userId: string; chatId: number; error: string }[];
}

/** A Telegram inline keyboard button: URL or web_app. */
export type BroadcastButton =
  | { type: "url"; text: string; url: string }
  | { type: "web_app"; text: string; url: string };

/** Inline keyboard: array of rows, each row is an array of buttons. */
export type BroadcastKeyboard = BroadcastButton[][];

/**
 * Media attachment: only file_id is stored. Telegram's file_id is reusable
 * across sends as long as the bot saw the file at least once.
 */
export type BroadcastMedia =
  | { type: "photo"; file_id: string }
  | { type: "animation"; file_id: string }
  | { type: "video"; file_id: string }
  | { type: "document"; file_id: string };

export interface BroadcastPayload {
  /** Body text (caption when media is present). */
  text: string;
  /** Optional media attachment. */
  media?: BroadcastMedia;
  /** Optional inline keyboard. */
  keyboard?: BroadcastKeyboard;
  /** Parse mode. Default: HTML. */
  parseMode?: "HTML" | "Markdown";
  /** Disable URL preview for plain-text messages. Default: false. */
  disablePreview?: boolean;
}

/**
 * Scan Redis for all users with a Telegram chat linked.
 */
export async function getAllTelegramTargets(): Promise<BroadcastTarget[]> {
  const seen = new Set<number>();
  const result: BroadcastTarget[] = [];

  await scanKeys("account:tg_*", (key) => {
    const userId = key.replace("account:", "");
    const chatId = Number(userId.replace("tg_", ""));
    if (!isNaN(chatId) && chatId > 0 && !seen.has(chatId)) {
      seen.add(chatId);
      result.push({ userId, chatId });
    }
  });

  await scanKeys("user:em_*", async (key) => {
    const raw = await redis.get(key);
    if (!raw) return;
    const user = typeof raw === "string" ? JSON.parse(raw) : raw;
    const tgId = (user as { telegramId?: number | string })?.telegramId;
    if (!tgId) return;
    const chatId = Number(tgId);
    if (!isNaN(chatId) && chatId > 0 && !seen.has(chatId)) {
      seen.add(chatId);
      result.push({ userId: key.replace("user:", ""), chatId });
    }
  });

  return result;
}

/**
 * Resolve a list of arbitrary userIds into chat IDs.
 */
export async function resolveUserIds(userIds: string[]): Promise<BroadcastTarget[]> {
  const seen = new Set<number>();
  const result: BroadcastTarget[] = [];

  for (const userId of userIds) {
    if (typeof userId !== "string" || !userId.trim()) continue;

    if (userId.startsWith("tg_")) {
      const chatId = Number(userId.replace("tg_", ""));
      if (!isNaN(chatId) && chatId > 0 && !seen.has(chatId)) {
        seen.add(chatId);
        result.push({ userId, chatId });
      }
      continue;
    }

    const raw = await redis.get(`user:${userId}`);
    if (!raw) continue;
    const user = typeof raw === "string" ? JSON.parse(raw) : raw;
    const tgId = (user as { telegramId?: number | string })?.telegramId;
    if (!tgId) continue;
    const chatId = Number(tgId);
    if (!isNaN(chatId) && chatId > 0 && !seen.has(chatId)) {
      seen.add(chatId);
      result.push({ userId, chatId });
    }
  }

  return result;
}

/**
 * Broadcast to a list of targets. Accepts either a plain string (legacy)
 * or a full BroadcastPayload (text + media + keyboard).
 */
export async function broadcastToUsers(
  payload: BroadcastPayload | string,
  targets: BroadcastTarget[],
): Promise<BroadcastResult> {
  const normalized: BroadcastPayload =
    typeof payload === "string" ? { text: payload } : payload;

  const result: BroadcastResult = {
    total: targets.length,
    sent: 0,
    failed: 0,
    blocked: 0,
    errors: [],
  };

  const minDelayMs = Math.ceil(1000 / SAFE_RATE_PER_SEC);

  for (const target of targets) {
    const r = await sendOne(target.chatId, normalized);

    if (r.ok) {
      result.sent++;
    } else if (r.status === 403 || r.status === 400) {
      result.blocked++;
    } else {
      result.failed++;
      result.errors.push({
        userId: target.userId,
        chatId: target.chatId,
        error: r.error,
      });
    }

    await sleep(minDelayMs);
  }

  return result;
}

/**
 * Send a single broadcast payload — exposed so the admin UI can render a
 * live preview by sending the message to the admin themselves.
 */
export async function sendBroadcastPayload(
  chatId: number,
  payload: BroadcastPayload,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  return sendOne(chatId, payload);
}

// ---- internals ----

function buildKeyboard(kb: BroadcastKeyboard | undefined): unknown {
  if (!kb || kb.length === 0) return undefined;
  return {
    inline_keyboard: kb.map((row) =>
      row.map((btn) => {
        if (btn.type === "web_app") {
          return { text: btn.text, web_app: { url: btn.url } };
        }
        return { text: btn.text, url: btn.url };
      }),
    ),
  };
}

function buildBody(
  chatId: number,
  payload: BroadcastPayload,
): { endpoint: string; body: string } {
  const parseMode = payload.parseMode ?? "HTML";
  const replyMarkup = buildKeyboard(payload.keyboard);

  if (payload.media) {
    const m = payload.media;
    let endpoint: string;
    let mediaField: string;
    switch (m.type) {
      case "photo":
        endpoint = "sendPhoto";
        mediaField = "photo";
        break;
      case "animation":
        endpoint = "sendAnimation";
        mediaField = "animation";
        break;
      case "video":
        endpoint = "sendVideo";
        mediaField = "video";
        break;
      case "document":
        endpoint = "sendDocument";
        mediaField = "document";
        break;
    }
    const body: Record<string, unknown> = {
      chat_id: chatId,
      [mediaField]: m.file_id,
      caption: payload.text,
      parse_mode: parseMode,
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    return { endpoint, body: JSON.stringify(body) };
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: payload.text,
    parse_mode: parseMode,
    disable_web_page_preview: payload.disablePreview ?? false,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return { endpoint: "sendMessage", body: JSON.stringify(body) };
}

async function sendOne(
  chatId: number,
  payload: BroadcastPayload,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!BOT_TOKEN) {
    return { ok: false, status: 0, error: "no_bot_token" };
  }

  const { endpoint, body } = buildBody(chatId, payload);
  const url = `${TG_API}${BOT_TOKEN}/${endpoint}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch (e) {
    return { ok: false, status: 0, error: String(e) };
  }

  if (resp.ok) return { ok: true };

  const data: { description?: string; parameters?: { retry_after?: number } } =
    await resp.json().catch(() => ({}));

  if (resp.status === 429) {
    const retryAfter = Math.min(data.parameters?.retry_after ?? 5, 30);
    await sleep(retryAfter * 1000);
    try {
      const retry = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (retry.ok) return { ok: true };
      const retryData: { description?: string } = await retry
        .json()
        .catch(() => ({}));
      return {
        ok: false,
        status: retry.status,
        error: retryData.description || `HTTP ${retry.status}`,
      };
    } catch (e) {
      return { ok: false, status: 0, error: String(e) };
    }
  }

  return {
    ok: false,
    status: resp.status,
    error: data.description || `HTTP ${resp.status}`,
  };
}

async function scanKeys(
  pattern: string,
  visit: (key: string) => void | Promise<void>,
): Promise<void> {
  let cursor: string | number = 0;
  do {
    const result = (await redis.scan(cursor, {
      match: pattern,
      count: 200,
    })) as [string | number, string[]];
    const nextCursor: string | number = result[0];
    const keys: string[] = result[1];
    for (const key of keys) {
      await visit(key);
    }
    cursor = nextCursor;
  } while (Number(cursor) !== 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
