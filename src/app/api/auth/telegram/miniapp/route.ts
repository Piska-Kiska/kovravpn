// src/app/api/auth/telegram/miniapp/route.ts
//
// Sign-in for the Telegram Mini App.
//
// The page inside Telegram posts `initData`, the string Telegram signed with
// the bot token. A matching and fresh signature proves who the person is; the
// account is found or created by the same loginWithTelegram as the site's
// code login, and a session is returned in the BODY as a Bearer token.
//
// No cookie is set here, on purpose: inside Telegram's webview a third-party
// cookie does not survive, and a cookie left by another Telegram account in
// the same webview must never decide whose cabinet opens. The page sends
// `Authorization: Bearer <token>`, which lib/session.ts prefers over any
// cookie (and never falls back from).
//
// Nothing from the client is trusted before the signature check: `user`
// inside initData is written by the client, and without `hash` it is just
// somebody's id.

import { NextRequest, NextResponse } from "next/server";
import { createSession, SESSION_TTL_REMEMBER } from "@/lib/session";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { getUserLang, setUserLang, syncTelegramIdentity } from "@/lib/accounts";
import { normalizeLang } from "@/lib/bot-i18n";
import { loginWithTelegram } from "@/lib/telegram-login";
import { INIT_DATA_MAX_LEN, validateWebAppInitData } from "@/lib/telegram-webapp";

/** Per address: one open Mini App signs in once, again only after a 401. */
const RL_IP_MAX = 20;
/** Per Telegram account, after the signature matched. */
const RL_TG_MAX = 10;
const RL_WINDOW_SEC = 60;

/** Mini App sessions are long ("remember me"): initData itself dies in an hour. */
const SESSION_REMEMBER = true;

const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(status: number, error: string, extra: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, error }, { status, headers: { ...NO_STORE, ...extra } });
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rlIp = await rateLimit(`tgminiapp:ip:${ip}`, RL_IP_MAX, RL_WINDOW_SEC);
    if (!rlIp.ok) return fail(429, "too_many_requests", { "Retry-After": String(rlIp.retryAfter) });

    let initData: unknown;
    try {
      const body: unknown = await req.json();
      initData = body && typeof body === "object" ? (body as { initData?: unknown }).initData : undefined;
    } catch {
      return fail(400, "bad_json");
    }
    if (typeof initData !== "string" || initData.length === 0 || initData.length > INIT_DATA_MAX_LEN) {
      return fail(400, "init_data_required");
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
    if (!botToken) {
      console.error("[tgminiapp] TELEGRAM_BOT_TOKEN is not set: cannot check initData");
      return fail(500, "not_configured");
    }

    const check = validateWebAppInitData(initData, botToken);
    if (!check.ok) {
      // 401, not 400: the client sent a well-formed string we do not trust.
      if (check.reason !== "expired") console.warn(`[tgminiapp] initData rejected: ${check.reason}`);
      return fail(401, check.reason);
    }

    const telegramId = check.user.id;
    const rlTg = await rateLimit(`tgminiapp:tg:${telegramId}`, RL_TG_MAX, RL_WINDOW_SEC);
    if (!rlTg.ok) return fail(429, "too_many_requests", { "Retry-After": String(rlTg.retryAfter) });

    const { userId, isNewUser } = await loginWithTelegram({ telegramId });

    // Name and @username, as the webhook does on every update. Awaited, and
    // one after the other: both rewrite the same `user:` record, and on
    // Vercel a promise left running after the response is lost. A failure
    // here must not block the sign-in.
    //
    // The account's language (the bot's, or Telegram's on first contact) goes
    // back to the page: a Mini App opened without `?lang=` (a startapp link,
    // the return from a payment) must speak the language the bot speaks.
    let accountLang: string | null = null;
    try {
      await syncTelegramIdentity(userId, {
        username: check.user.username,
        first_name: check.user.first_name,
        last_name: check.user.last_name,
      });
      accountLang = normalizeLang(await getUserLang(userId));
      const tgLang = normalizeLang(check.user.language_code);
      if (!accountLang && tgLang) {
        await setUserLang(userId, tgLang);
        accountLang = tgLang;
      }
    } catch (e) {
      console.warn("[tgminiapp] identity/lang sync failed:", e instanceof Error ? e.message : e);
    }

    const sid = await createSession(userId, SESSION_REMEMBER);
    console.info(JSON.stringify({ evt: "auth.miniapp", userId, isNewUser }));

    return NextResponse.json(
      {
        ok: true,
        token: sid,
        tokenType: "Bearer",
        expiresInSec: SESSION_TTL_REMEMBER,
        userId,
        isNewUser,
        // `?startapp=paid` after a payment, and the Telegram UI language:
        // the page decides what to do with them.
        startParam: check.startParam ?? null,
        languageCode: check.user.language_code ?? null,
        // One of the bot's languages, or null when neither is known.
        lang: accountLang,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[tgminiapp] error:", error instanceof Error ? error.message : error);
    return fail(500, "internal");
  }
}
