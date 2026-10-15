// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { redis } from "@/lib/redis";
import { getAccount, resolveUserId } from "@/lib/accounts";
import { createSession, setSessionCookie } from "@/lib/session";
import { clearRateLimit, getClientIp, loginAccountLimitKey, rateLimit } from "@/lib/ratelimit";
import { normalizeEmail } from "@/lib/email";

/**
 * Tries at one account's password per hour, from every address together
 * (audit 15.10.2026, item 2). The per-address limit alone let many addresses
 * guess without end; this one is counted per e-mail before anything is looked
 * up, so it says nothing about whether the account exists. A successful
 * sign-in and a password reset clear it.
 */
const LOGIN_ACCOUNT_MAX = 20;
const LOGIN_ACCOUNT_WINDOW_SEC = 60 * 60;

/**
 * A hash of a random password nobody knows, at the cost real hashes use (12).
 * Compared against when there is no account or no password, so a wrong
 * address takes as long to refuse as a wrong password; the old fixed decoy was
 * cost 10, four times faster, which told addresses apart. Started at load and
 * awaited only when needed.
 */
const DECOY_HASH: Promise<string> = bcrypt.hash(randomBytes(18).toString("base64"), 12);

const GENERIC_ERROR = "Неверный email или пароль";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await rateLimit(`login:${ip}`, 10, 60);
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Слишком много попыток. Подождите ${rl.retryAfter} сек` },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => null);
    const email = body?.email;
    const password = body?.password;
    const remember = body?.remember;

    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Email и пароль обязательны" }, { status: 400 });
    }
    if (password.length < 1 || password.length > 128 || email.length > 254) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const acctKey = loginAccountLimitKey(normalizeEmail(email));
    const acct = await rateLimit(acctKey, LOGIN_ACCOUNT_MAX, LOGIN_ACCOUNT_WINDOW_SEC);
    if (!acct.ok) {
      const minutes = Math.max(1, Math.ceil(acct.retryAfter / 60));
      return NextResponse.json(
        { error: `Слишком много попыток входа в этот аккаунт. Подождите ${minutes} мин или восстановите пароль` },
        { status: 429 }
      );
    }

    const normalized = email.toLowerCase().trim();
    const userId = await resolveUserId(`em_${normalized}`);
    const raw = userId ? await redis.get(`user:${userId}`) : null;
    const user: { passwordHash?: unknown } | null =
      raw == null
        ? null
        : typeof raw === "string"
          ? (JSON.parse(raw) as { passwordHash?: unknown })
          : (raw as { passwordHash?: unknown });

    // No account, or one without a password (signed up through Telegram):
    // the same refusal after the same bcrypt work as a wrong password.
    const hash = user && typeof user.passwordHash === "string" && user.passwordHash ? user.passwordHash : null;
    const valid = await bcrypt.compare(password, hash ?? (await DECOY_HASH));
    if (!hash || !valid) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const account = await getAccount(userId);
    if (!account) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    await clearRateLimit(acctKey);

    const sid = await createSession(userId, !!remember);
    const res = NextResponse.json({ success: true, userId });
    setSessionCookie(res, sid, !!remember);
    return res;
  } catch (error) {
    console.error("[auth/login]", error);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }
}
