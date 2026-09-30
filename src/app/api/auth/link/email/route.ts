// src/app/api/auth/link/email/route.ts
//
// Send a code to attach an e-mail (and password) to the signed-in account.
//
// Rate limited per account (3 codes / 10 min) and per IP (10 / 10 min)
// before any hashing or mail: without it, any session (a free Telegram
// login is enough) could send unlimited mail from our domain to any
// address, burning the Resend quota and the domain's reputation that
// registration and password reset depend on (KS-6). An address already used
// by an account is refused in its raw and normalized form.
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";
import { getSessionFromRequest } from "@/lib/session";
import { getUserRecord } from "@/lib/accounts";
import { getClientIp, rateLimit, secureCode6 } from "@/lib/ratelimit";
import { normalizeEmail } from "@/lib/email";

const CODES_PER_ACCOUNT = 3;
const CODES_PER_IP = 10;
const WINDOW_SEC = 600;

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await req.json().catch(() => null);
    const { email, password } = (typeof body === "object" && body !== null ? body : {}) as {
      email?: unknown;
      password?: unknown;
    };

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
      return NextResponse.json(
        { error: "Email и пароль обязательны" },
        { status: 400 }
      );
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: "Некорректный email" }, { status: 400 });
    }

    if (password.length < 8 || password.length > 128) {
      return NextResponse.json(
        { error: "Пароль от 8 до 128 символов" },
        { status: 400 }
      );
    }

    // Before bcrypt and the mail: both limits count every attempt.
    for (const [key, max] of [
      [`linkem:u:${session.userId}`, CODES_PER_ACCOUNT],
      [`linkem:ip:${getClientIp(req)}`, CODES_PER_IP],
    ] as const) {
      const rl = await rateLimit(key, max, WINDOW_SEC);
      if (!rl.ok) {
        return NextResponse.json({ error: `Подождите ${rl.retryAfter} сек` }, { status: 429 });
      }
    }

    // Check if user already has email linked
    const user = await getUserRecord(session.userId);
    if (user?.email || session.userId.startsWith("em_")) {
      return NextResponse.json(
        { error: "Email уже привязан" },
        { status: 409 }
      );
    }

    const normalized = email.toLowerCase().trim();

    // Already used by another account, as typed or in its normalized form
    // (registration keys accounts by normalizeEmail: dots and +tags of Gmail).
    const canonical = normalizeEmail(normalized);
    const ids = [...new Set([`em_${normalized}`, `em_${canonical}`])];
    for (const id of ids) {
      const [existingAlias, existingUser] = await Promise.all([redis.get(`alias:${id}`), redis.get(`user:${id}`)]);
      if (existingAlias || existingUser) {
        return NextResponse.json(
          { error: "Этот email уже привязан к другому аккаунту" },
          { status: 409 }
        );
      }
    }

    const code = secureCode6();
    const passwordHash = await bcrypt.hash(password, 12);

    await redis.set(
      `link_em:${normalized}`,
      JSON.stringify({ userId: session.userId, code, passwordHash }),
      { ex: 600 }
    );
    // A new code starts with a clean attempt count (link/email/verify).
    await redis.del(`link_em:${normalized}:attempts`);

    await getResend().emails.send({
      from: "Kovra <noreply@kovravpn.com>",
      to: normalized,
      subject: `${code} — привязка email`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
          <h2 style="margin:0 0 8px">Kovra</h2>
          <p style="color:#666;margin:0 0 24px">Код для привязки email:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px;background:#f5f5f5;border-radius:12px">${code}</div>
          <p style="color:#999;font-size:12px;margin:24px 0 0">Код действителен 10 минут.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/link/email]", error);
    return NextResponse.json(
      { error: "Ошибка отправки" },
      { status: 500 }
    );
  }
}
