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
