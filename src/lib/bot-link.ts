// src/lib/bot-link.ts
//
// Links into Kovra's Telegram bot. Pure: reads only the environment.
//
// The username comes from TELEGRAM_BOT_USERNAME (server) or
// NEXT_PUBLIC_BOT_USERNAME, both spellings used across the code, and falls
// back to Kovra's own bot. Telegram usernames are case-insensitive, so
// "kovravpn_bot" and "KovraVPN_bot" are the same bot.
//
// Mini App links (`?startapp=`) go to one of two apps:
//   • TELEGRAM_MINIAPP_SHORT_NAME set: the direct-link Mini App made with
//     @BotFather /newapp, `https://t.me/<bot>/<short name>?startapp=…`. It
//     is not put on the bot's profile, so it keeps the owner-first rollout:
//     only people who already use the Mini App (from the gated bot buttons)
//     come back through it.
//   • otherwise: the bot's main Mini App, `https://t.me/<bot>?startapp=…`
//     (Bot Settings → Configure Mini App). Configuring it puts an "Open"
//     button on the bot's profile for EVERYONE, so it belongs to the moment
//     the new bot interface opens for all.

/** Kovra's bot, as the site spells it everywhere. */
export const KOVRA_BOT_USERNAME_FALLBACK = "KovraVPN_bot";

/** Telegram usernames: 5–32 of [A-Za-z0-9_]. */
const USERNAME_RE = /^[A-Za-z0-9_]{5,32}$/;

/** `?start=` / `?startapp=` payloads: 1–64 of [A-Za-z0-9_-]. */
const PAYLOAD_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Short names of direct-link Mini Apps (@BotFather /newapp): 3–30 of [A-Za-z0-9_]. */
const SHORT_NAME_RE = /^[A-Za-z0-9_]{3,30}$/;

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

/**
 * The direct-link Mini App's short name, or null for the main Mini App. A
 * malformed value counts as unset: it must never leak into a URL.
 */
export function miniAppShortName(env: BotLinkEnv = process.env): string | null {
  const name = (env.TELEGRAM_MINIAPP_SHORT_NAME ?? "").trim();
  return SHORT_NAME_RE.test(name) ? name : null;
}

function withPayload(param: "start" | "startapp", payload: string | undefined, base: string): string {
  if (payload === undefined) return base;
  if (!PAYLOAD_RE.test(payload)) throw new Error(`bot-link: invalid ${param} payload`);
  return `${base}?${param}=${payload}`;
}

/** Chat with the bot, optionally with a `/start <payload>`. */
export function botChatUrl(start?: string, env: BotLinkEnv = process.env): string {
  return withPayload("start", start, `https://t.me/${botUsername(env)}`);
}

/**
 * Open the Mini App, optionally with a start parameter that arrives in
 * initData as `start_param`: the direct-link app when
 * TELEGRAM_MINIAPP_SHORT_NAME is set, else the bot's main Mini App (see the
 * header). Either works only once it exists in @BotFather.
 */
export function miniAppUrl(startapp?: string, env: BotLinkEnv = process.env): string {
  const shortName = miniAppShortName(env);
  const base = `https://t.me/${botUsername(env)}${shortName ? `/${shortName}` : ""}`;
  if (startapp === undefined) return `${base}?startapp`;
  return withPayload("startapp", startapp, base);
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
