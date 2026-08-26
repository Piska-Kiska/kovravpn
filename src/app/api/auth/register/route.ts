// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { createAccount, WELCOME_BONUS, WELCOME_BONUS_REFERRED } from "@/lib/accounts";
import { createSession, setSessionCookie } from "@/lib/session";
import { resolveReferralCode, recordReferral } from "@/lib/referrals";
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
import { normalizeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 5 attempts per minute (code brute force protection)
    const rl = await rateLimit(`register:${ip}`, 5, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: `Подождите ${rl.retryAfter} сек` }, { status: 429 });
    }

    const { email, code, ref } = await req.json();

    if (!email || !code) {
      return NextResponse.json(
        { error: "Email и код обязательны" },
        { status: 400 }
      );
    }

    const normalized = normalizeEmail(email);
    const userId = `em_${normalized}`;

    // Check if user already exists
    const existing = await redis.get(`user:${userId}`);
    if (existing) {
      return NextResponse.json(
        { error: "Пользователь уже существует — используйте вход" },
        { status: 409 }
      );
    }

    // Get registration data (code + passwordHash stored during /api/auth/email)
    // Try normalized key first, fallback to raw lowercase for backward compat
    const rawLower = email.toLowerCase().trim();
    const regKeyNorm = `email_reg:${normalized}`;
    const regKeyRaw = `email_reg:${rawLower}`;
    let raw = await redis.get(regKeyNorm);
    let usedKey = regKeyNorm;
    if (!raw) {
      raw = await redis.get(regKeyRaw);
      usedKey = regKeyRaw;
    }
    if (!raw) {
      return NextResponse.json(
        { error: "Код истёк или не найден — запросите новый" },
        { status: 400 }
      );
    }

    const regData =
      typeof raw === "string"
        ? JSON.parse(raw)
        : (raw as { code: string; passwordHash: string });

    if (String(regData.code) !== String(code)) {
      const attempts = Number(await redis.incr(ATTEMPTS_KEY(usedKey))) || 0;
      if (attempts === 1) await redis.expire(ATTEMPTS_KEY(usedKey), CODE_TTL_SEC);
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await redis.del(usedKey);
        await redis.del(ATTEMPTS_KEY(usedKey));
        return NextResponse.json(
          { error: "Слишком много неверных попыток — запросите новый код" },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "Неверный код подтверждения" },
        { status: 400 }
      );
    }

    // Clean up registration data
    await redis.del(usedKey);
    await redis.del(ATTEMPTS_KEY(usedKey));

    // Anti-fraud: limit registrations per IP (max 3 per 24h with bonus)
    const ipRegKey = `reg_ip:${ip}`;
    const ipRegCount = await redis.incr(ipRegKey);
    if (ipRegCount === 1) await redis.expire(ipRegKey, 86400);
    const ipAbuse = ipRegCount > 3;

    // Determine welcome bonus
    let hasReferrer = false;
    if (ref) {
      const referrerId = await resolveReferralCode(String(ref));
      if (referrerId && referrerId !== userId) {
        const recorded = await recordReferral(referrerId, userId);
        hasReferrer = recorded;
      }
    }

    const bonus = ipAbuse ? 0 : (hasReferrer ? WELCOME_BONUS_REFERRED : WELCOME_BONUS);

    // Create user record
    await redis.set(
      `user:${userId}`,
      JSON.stringify({
        passwordHash: regData.passwordHash,
        authMethod: "email",
        createdAt: Date.now(),
      })
    );

    // Create account with appropriate bonus
    await createAccount(userId, "free", bonus);

    // Also create alias for raw email if different from normalized
    if (rawLower !== normalized) {
      await redis.set(`alias:em_${rawLower}`, userId);
    }

    // Create session
    const sid = await createSession(userId);
    const res = NextResponse.json({ success: true, userId });
    setSessionCookie(res, sid);

    return res;
  } catch (error) {
    console.error("[auth/register]", error);
    return NextResponse.json(
      { error: "Ошибка регистрации" },
      { status: 500 }
    );
  }
}
