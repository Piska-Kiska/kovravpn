// src/app/api/auth/reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";
import { getUserRecord, saveUserRecord } from "@/lib/accounts";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { revokeUserSessions } from "@/lib/session";
import { attemptsKeyFor, takeCodeAttempt } from "@/lib/code-attempts";
import { safeEqual } from "@/lib/safe-compare";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await rateLimit(`reset:${ip}`, 5, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: `Подождите ${rl.retryAfter} сек` }, { status: 429 });
    }

    const { email, code, password } = await req.json();

    if (!email || !code || !password) {
      return NextResponse.json(
        { error: "Все поля обязательны" },
        { status: 400 }
      );
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { error: "Пароль от 8 до 128 символов" },
        { status: 400 }
      );
    }

    const normalized = email.toLowerCase().trim();
    const resetKey = `reset:${normalized}`;
    const raw = await redis.get(resetKey);

    if (!raw) {
      return NextResponse.json(
        { error: "Код истёк — запросите новый" },
        { status: 400 }
      );
    }

    const data = typeof raw === "string" ? JSON.parse(raw) : raw;

    // The try is taken before the compare (lib/code-attempts.ts): a burst of
    // parallel guesses gets five comparisons per code, not one per request.
    // Counted per code, so a change of address does not reset it.
    const attempt = await takeCodeAttempt(attemptsKeyFor(resetKey, data.code));
    if (!attempt.allowed || !safeEqual(String(code), String(data.code))) {
      if (!attempt.allowed || attempt.last) {
        await redis.del(resetKey);
        return NextResponse.json(
          { error: "Слишком много неверных попыток — запросите новый код" },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "Неверный код" },
        { status: 400 }
      );
    }

    // A code changes the password once: of two right answers racing, only the
    // one whose DEL removed the key goes on.
    if ((await redis.del(resetKey)) === 0) {
      return NextResponse.json(
        { error: "Код истёк — запросите новый" },
        { status: 400 }
      );
    }

    // Update password
    const user = await getUserRecord(data.userId);
    if (!user) {
      return NextResponse.json(
        { error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    await saveUserRecord(data.userId, user);

    // A new password ends every session of the account (KS-10): a stolen
    // "remember" session must not outlive it. That includes sessions of the
    // linked Telegram id, which act for this account (lib/session.ts
    // getSession follows alias:tg_X). The Mini App signs in again from
    // initData on its own. A failure here is logged, not reported: the
    // password is already changed.
    try {
      let revoked = await revokeUserSessions(data.userId);
      if (user.telegramId) {
        const tgUserId = `tg_${user.telegramId}`;
        if ((await redis.get(`alias:${tgUserId}`)) === data.userId) revoked += await revokeUserSessions(tgUserId);
      }
      console.info(JSON.stringify({ evt: "auth.reset_sessions_revoked", userId: data.userId, sessions: revoked }));
    } catch (err) {
      console.error("[auth/reset] sessions not revoked:", err instanceof Error ? err.message : err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/reset]", error);
    return NextResponse.json(
      { error: "Ошибка сброса пароля" },
      { status: 500 }
    );
  }
}
