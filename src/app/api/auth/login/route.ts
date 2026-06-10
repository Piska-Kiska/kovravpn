// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";
import { getAccount, resolveUserId } from "@/lib/accounts";
import { createSession, setSessionCookie } from "@/lib/session";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

const DUMMY_HASH = "$2b$10$fbt6LPepFi9PBEHAfDz6OuhV2Wq36WPeRIk4dwtgZmuEAo4VqehqS";
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

    const normalized = email.toLowerCase().trim();
    const userId = await resolveUserId(`em_${normalized}`);
    const raw = userId ? await redis.get(`user:${userId}`) : null;
    const user =
      raw == null
        ? null
        : typeof raw === "string"
          ? (JSON.parse(raw) as { passwordHash: string })
          : (raw as { passwordHash: string });

    // Всегда выполняем bcrypt — против timing-enumeration.
    const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
    if (!user || !valid) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const account = await getAccount(userId);
    if (!account) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
    }

    const sid = await createSession(userId, !!remember);
    const res = NextResponse.json({ success: true, userId });
    setSessionCookie(res, sid, !!remember);
    return res;
  } catch (error) {
    console.error("[auth/login]", error);
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }
}
