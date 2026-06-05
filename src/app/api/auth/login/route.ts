// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";
import { getAccount, resolveUserId } from "@/lib/accounts";
import { createSession, setSessionCookie } from "@/lib/session";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 10 login attempts per minute per IP
    const rl = await rateLimit(`login:${ip}`, 10, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: `Слишком много попыток. Подождите ${rl.retryAfter} сек` }, { status: 429 });
    }

    const { email, password, remember } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email и пароль обязательны" },
        { status: 400 }
      );
    }

    if (typeof password !== "string" || password.length > 128) {
      return NextResponse.json({ error: "Некорректный пароль" }, { status: 400 });
    }

    const normalized = email.toLowerCase().trim();
    const userId = await resolveUserId(`em_${normalized}`);

    // Look up user by resolved userId
    const raw = await redis.get(`user:${userId}`);
    if (!raw) {
      return NextResponse.json(
        { error: "Неверный email или пароль" },
        { status: 401 }
      );
    }

    const user =
      typeof raw === "string"
        ? JSON.parse(raw)
        : (raw as { passwordHash: string; authMethod: string });

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Неверный email или пароль" },
        { status: 401 }
      );
    }

    // Ensure account exists (shouldn't be missing, but safety net)
    const account = await getAccount(userId);
    if (!account) {
      return NextResponse.json(
        { error: "Аккаунт не найден — обратитесь в поддержку" },
        { status: 404 }
      );
    }

    // Create session
    const sid = await createSession(userId, !!remember);
    const res = NextResponse.json({ success: true, userId });
    setSessionCookie(res, sid, !!remember);

    return res;
  } catch (error) {
    console.error("[auth/login]", error);
    return NextResponse.json({ error: "Ошибка входа" }, { status: 500 });
  }
}
