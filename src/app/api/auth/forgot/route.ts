// src/app/api/auth/forgot/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { redis } from "@/lib/redis";
import { resolveUserId, getUserRecord } from "@/lib/accounts";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    const rl = await rateLimit(`forgot:${ip}`, 3, 300);
    if (!rl.ok) {
      return NextResponse.json({ error: `Подождите ${rl.retryAfter} сек` }, { status: 429 });
    }

    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "Некорректный email" },
        { status: 400 }
      );
    }

    const normalized = email.toLowerCase().trim();
    const userId = await resolveUserId(`em_${normalized}`);

    // Check user exists and has password
    const user = await getUserRecord(userId);
    if (!user || !user.passwordHash) {
      // Don't reveal whether email exists
      return NextResponse.json({ success: true });
    }

    const { secureCode6 } = await import("@/lib/ratelimit");
    const code = secureCode6();
    await redis.set(
      `reset:${normalized}`,
      JSON.stringify({ code, userId }),
      { ex: 600 }
    );

    await getResend().emails.send({
      from: "ПроксисВпнович <noreply@proxysvpn.com>",
      to: normalized,
      subject: `${code} — сброс пароля`,
      html: `
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:32px">
          <h2 style="margin:0 0 8px">ПроксисВпнович</h2>
          <p style="color:#666;margin:0 0 24px">Код для сброса пароля:</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:24px;background:#f5f5f5;border-radius:12px">${code}</div>
          <p style="color:#999;font-size:12px;margin:24px 0 0">Код действителен 10 минут. Если вы не запрашивали сброс — проигнорируйте.</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[auth/forgot]", error);
    return NextResponse.json(
      { error: "Ошибка отправки" },
      { status: 500 }
    );
  }
}
