// src/lib/bot-link.ts
//
// Links into Kovra's Telegram bot. Pure: reads only the environment.
//
// The username comes from TELEGRAM_BOT_USERNAME (server) or
// NEXT_PUBLIC_BOT_USERNAME, both spellings used across the code, and falls
// back to Kovra's own bot. Telegram usernames are case-insensitive, so
// "kovravpn_bot" and "KovraVPN_bot" are the same bot.

/** Kovra's bot, as the site spells it everywhere. */
export const KOVRA_BOT_USERNAME_FALLBACK = "KovraVPN_bot";

/** Telegram usernames: 5–32 of [A-Za-z0-9_]. */
const USERNAME_RE = /^[A-Za-z0-9_]{5,32}$/;

/** `?start=` / `?startapp=` payloads: 1–64 of [A-Za-z0-9_-]. */
const PAYLOAD_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** The environment variables read here (process.env satisfies it). */
export type BotLinkEnv = Readonly<Record<string, string | undefined>>;

/** The bot's username without '@'. A malformed value falls back, never leaks into a URL. */
export function botUsername(env: BotLinkEnv = process.env): string {
  for (const raw of [env.TELEGRAM_BOT_USERNAME, env.NEXT_PUBLIC_BOT_USERNAME]) {
    const name = (raw ?? "").trim().replace(/^@/, "");
    if (USERNAME_RE.test(name)) return name;
  }
  return KOVRA_BOT_USERNAME_FALLBACK;
}

function withPayload(param: "start" | "startapp", payload: string | undefined, env: BotLinkEnv): string {
  const base = `https://t.me/${botUsername(env)}`;
  if (payload === undefined) return base;
  if (!PAYLOAD_RE.test(payload)) throw new Error(`bot-link: invalid ${param} payload`);
  return `${base}?${param}=${payload}`;
}

/** Chat with the bot, optionally with a `/start <payload>`. */
export function botChatUrl(start?: string, env: BotLinkEnv = process.env): string {
  return withPayload("start", start, env);
}

/**
 * Open the bot's main Mini App, optionally with a start parameter that
 * arrives in initData as `start_param`. Works only when the Mini App is
 * configured in @BotFather (Bot Settings → Configure Mini App).
 */
export function miniAppUrl(startapp?: string, env: BotLinkEnv = process.env): string {
  if (startapp === undefined) return `https://t.me/${botUsername(env)}?startapp`;
  return withPayload("startapp", startapp, env);
}

/** Where a payment provider sends the person back after paying or cancelling. */
export interface PaymentReturnUrls {
  success: string;
  fail: string;
}

/**
 * Return addresses for a payment started inside the Mini App: back into
 * Telegram, which reopens the Mini App with start_param "paid" (the page
 * then shows "Checking payment…"). A site URL would open the external
 * browser, where the person is not signed in.
 */
export function miniAppPaymentReturn(env: BotLinkEnv = process.env): PaymentReturnUrls {
  return { success: miniAppUrl("paid", env), fail: miniAppUrl(undefined, env) };
}

/**
 * The request body asks for the Mini App return (`returnTo: "miniapp"`), else
 * undefined so the caller keeps its own (site) addresses. Only the shape is
 * read: the flag decides where a browser lands afterwards, nothing about money.
 */
export function paymentReturnFor(body: unknown, env: BotLinkEnv = process.env): PaymentReturnUrls | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  return (body as { returnTo?: unknown }).returnTo === "miniapp" ? miniAppPaymentReturn(env) : undefined;
}
