// src/app/api/account/lang/route.ts
//
// POST: the language of the signed-in account — the one the Telegram bot
// speaks. The Mini App calls it when the person switches the cabinet
// language, so the bot and the cabinet stay in one language (and the bot's
// buttons open the cabinet with that `?lang=`).
//
// Auth: the session (cookie, or `Authorization: Bearer` in the Mini App).
// Body: { lang: "en" | "ru" | "es" | "de" | "fr" }.
//
// Answers (always Cache-Control: no-store):
//   200 { ok: true, lang }
//   400 { ok: false, error: "invalid_request" | "invalid_lang" }
//   401 unauthorized   429 rate limited (+ Retry-After)   500 internal

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { setUserLang } from "@/lib/accounts";
import { BOT_LANGS, type BotLang } from "@/lib/bot-i18n";

/** A person switches the language a few times at most; this only stops loops. */
const RL_MAX = 10;
const RL_WINDOW_SEC = 60;
const NO_STORE = { "Cache-Control": "no-store" } as const;

function reply(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

function isBotLang(v: unknown): v is BotLang {
  return typeof v === "string" && (BOT_LANGS as readonly string[]).includes(v);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return reply(401, { ok: false, error: "unauthorized" });
    const userId = session.userId;

    const rl = await rateLimit(`acctlang:${userId}`, RL_MAX, RL_WINDOW_SEC);
    if (!rl.ok) return reply(429, { ok: false, error: "too_many_requests" }, { "Retry-After": String(rl.retryAfter) });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return reply(400, { ok: false, error: "invalid_request" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return reply(400, { ok: false, error: "invalid_request" });
    }
    const lang = (body as { lang?: unknown }).lang;
    if (!isBotLang(lang)) return reply(400, { ok: false, error: "invalid_lang" });

    await setUserLang(userId, lang);
    return reply(200, { ok: true, lang });
  } catch (error) {
    console.error("[account/lang]", error instanceof Error ? error.message : error);
    return reply(500, { ok: false, error: "internal" });
  }
}
