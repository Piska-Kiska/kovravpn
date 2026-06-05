// src/app/api/auth/link/email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";
import { getSessionFromRequest } from "@/lib/session";
import { getUserRecord } from "@/lib/accounts";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { email, password } = await req.json();

    if (!email || !email.includes("@") || !password) {
      return NextResponse.json(
        { error: "Email и пароль обязательны" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Пароль не менее 8 символов" },
        { status: 400 }
      );
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

    // Check if email already used by another account
    const existingAlias = await redis.get(`alias:em_${normalized}`);
    const existingUser = await redis.get(`user:em_${normalized}`);
    if (existingAlias || existingUser) {
      return NextResponse.json(
        { error: "Этот email уже привязан к другому аккаунту" },
        { status: 409 }
      );
    }

    const { secureCode6 } = await import("@/lib/ratelimit");
    const code = secureCode6();
    const passwordHash = await bcrypt.hash(password, 12);

    await redis.set(
      `link_em:${normalized}`,
      JSON.stringify({ userId: session.userId, code, passwordHash }),
      { ex: 600 }
    );

    await getResend().emails.send({
      from: "ПроксисВпнович <noreply@proxysvpn.com>",
      to: normalized,
      subject: `${code} — привязка email`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
          <h2 style="margin:0 0 8px">ПроксисВпнович</h2>
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
