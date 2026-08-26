// src/app/api/auth/reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";
import { getUserRecord, saveUserRecord } from "@/lib/accounts";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

/**
 * Сколько неверных попыток переживает код, прежде чем его гасят.
 *
 * Ограничение частоты стоит на АДРЕСЕ, а адрес меняется прокси: код из шести
 * цифр живёт десять минут и без этого счётчика выдерживает сколько угодно
 * попыток с разных адресов. Двести адресов по пять попыток в минуту дают
 * десять тысяч догадок на окно — около процента на код, и это повторяемо.
 * Счётчик привязан к самому коду, поэтому смена адреса его не обходит.
 */
const MAX_CODE_ATTEMPTS = 5;
/** Тот же срок, с каким код кладут: счётчик не должен его пережить. */
const CODE_TTL_SEC = 600;
const ATTEMPTS_KEY = (key: string) => `${key}:attempts`;

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

    if (String(data.code) !== String(code)) {
      const attempts = Number(await redis.incr(ATTEMPTS_KEY(resetKey))) || 0;
      if (attempts === 1) await redis.expire(ATTEMPTS_KEY(resetKey), CODE_TTL_SEC);
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await redis.del(resetKey);
        await redis.del(ATTEMPTS_KEY(resetKey));
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

    // Clean up
    await redis.del(resetKey);
    await redis.del(ATTEMPTS_KEY(resetKey));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/reset]", error);
    return NextResponse.json(
      { error: "Ошибка сброса пароля" },
      { status: 500 }
    );
  }
}
