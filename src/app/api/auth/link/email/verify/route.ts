// src/app/api/auth/link/email/verify/route.ts
//
// Check the code sent by /api/auth/link/email and attach the address.
//
// The six-digit code lives ten minutes; without a limit a session could try
// all of them and attach an address it does not own (KS-6). Now: a per-IP
// rate limit, and an attempt counter tied to the code itself (five tries,
// taken before the compare, then it burns), as in register and reset.
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getSessionFromRequest } from "@/lib/session";
import { getUserRecord, saveUserRecord, createAlias } from "@/lib/accounts";
import { getClientIp, rateLimit } from "@/lib/ratelimit";
import { safeEqual } from "@/lib/safe-compare";
import { attemptsKeyFor, takeCodeAttempt } from "@/lib/code-attempts";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rl = await rateLimit(`linkemv:${getClientIp(req)}`, 10, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: `Подождите ${rl.retryAfter} сек` }, { status: 429 });
    }

    const body: unknown = await req.json().catch(() => null);
    const { email, code } = (typeof body === "object" && body !== null ? body : {}) as {
      email?: unknown;
      code?: unknown;
    };
    if (typeof email !== "string" || !email || email.length > 254 || (typeof code !== "string" && typeof code !== "number")) {
      return NextResponse.json({ error: "Email и код обязательны" }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();
    const key = `link_em:${normalized}`;
    const raw = await redis.get(key);

    if (!raw) {
      return NextResponse.json(
        { error: "Код истёк — запросите новый" },
        { status: 400 }
      );
    }

    const data = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (data.userId !== session.userId) {
      return NextResponse.json({ error: "Недопустимо" }, { status: 403 });
    }

    const attempt = await takeCodeAttempt(attemptsKeyFor(key, data.code));
    if (!attempt.allowed || !safeEqual(String(code), String(data.code))) {
      if (!attempt.allowed || attempt.last) {
        await redis.del(key);
        return NextResponse.json(
          { error: "Слишком много неверных попыток — запросите новый код" },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    }

    // A code links once: of two right answers racing, only the one whose DEL
    // removed the key goes on.
    if ((await redis.del(key)) === 0) {
      return NextResponse.json({ error: "Код истёк — запросите новый" }, { status: 400 });
    }

    // Create alias: em_{email} → primary userId
    await createAlias(`em_${normalized}`, session.userId);

    // Update user record with email + passwordHash
    const user = await getUserRecord(session.userId);
    if (user) {
      user.email = normalized;
      user.passwordHash = data.passwordHash;
      if (user.authMethod === "telegram") user.authMethod = "linked";
      await saveUserRecord(session.userId, user);
    }

    return NextResponse.json({ linked: true, email: normalized });
  } catch (error) {
    console.error("[auth/link/email/verify]", error);
    return NextResponse.json({ error: "Ошибка" }, { status: 500 });
  }
}
