import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import bcrypt from "bcryptjs";
import { redis } from "@/lib/redis";
import { rateLimit, getClientIp, secureCode6 } from "@/lib/ratelimit";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

const BCRYPT_ROUNDS = 12;
const MAX_PASSWORD_LENGTH = 128;

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);

    // 3 emails per minute per IP
    const rl = await rateLimit(`email:${ip}`, 3, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: `Подождите ${rl.retryAfter} сек` }, { status: 429 });
    }

    const { email, password } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Некорректный email" },
        { status: 400 }
      );
    }

    const normalized = email.toLowerCase().trim();
    const code = secureCode6();

    if (password) {
      if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
        return NextResponse.json(
          { error: "Пароль от 8 до 128 символов" },
          { status: 400 }
        );
      }

      // Check if user already exists
      const existing = await redis.get(`user:em_${normalized}`);
      if (existing) {
        return NextResponse.json(
          { error: "Пользователь уже существует — используйте вход" },
          { status: 409 }
        );
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      await redis.set(
        `email_reg:${normalized}`,
        JSON.stringify({ code, passwordHash }),
        { ex: 600 }
      );
    } else {
      // Code-only flow (password reset, etc.)
      await redis.set(`email_code:${normalized}`, code, { ex: 600 });
    }

    const { data: sendData, error: sendError } = await getResend().emails.send({
      from: "Kovra <onboarding@resend.dev>",
      to: normalized,
      subject: `${code} — код подтверждения`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
          <h2 style="margin:0 0 8px">Kovra</h2>
          <p style="color:#666;margin:0 0 24px">Код подтверждения:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px;background:#f5f5f5;border-radius:12px">${code}</div>
          <p style="color:#999;font-size:12px;margin:24px 0 0">Код действителен 10 минут. Если вы не запрашивали код — проигнорируйте это письмо.</p>
        </div>
      `,
    });

    if (sendError) {
      console.error("[auth/email] Resend error:", sendError);
      return NextResponse.json({ error: "Не удалось отправить код" }, { status: 500 });
    }
    console.log("[auth/email] Resend ok, id:", sendData?.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/email]", error);
    return NextResponse.json(
      { error: "Не удалось отправить код" },
      { status: 500 }
    );
  }
}
