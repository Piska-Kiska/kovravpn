// src/app/api/auth/telegram/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { createSession, setSessionCookie } from "@/lib/session";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { isTelegramId, loginWithTelegram } from "@/lib/telegram-login";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`tgverify:${ip}`, 30, 60);
  if (!rl.ok) {
    return NextResponse.json({ verified: false, error: "Too many requests" }, { status: 429 });
  }

  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { verified: false, error: "No code" },
      { status: 400 }
    );
  }

  const raw = await redis.get(`auth:${code}`);

  if (!raw) {
    return NextResponse.json(
      { verified: false, error: "Expired or invalid" },
      { status: 404 }
    );
  }

  const data =
    typeof raw === "string"
      ? JSON.parse(raw)
      : (raw as { verified: boolean; telegramId?: string | number; ref?: string });

  if (!data.verified) {
    return NextResponse.json({ verified: false });
  }

  if (!isTelegramId(data.telegramId)) {
    console.error("[tgverify] verified code without a valid telegramId");
    return NextResponse.json({ verified: false, error: "Expired or invalid" }, { status: 404 });
  }

  // Verified — find or create the account, apply a pending referral.
  const { userId } = await loginWithTelegram({
    telegramId: data.telegramId,
    ref: typeof data.ref === "string" ? data.ref : null,
  });

  // Clean up auth code
  await redis.del(`auth:${code}`);

  // Create session + set cookie
  const sid = await createSession(userId);
  const res = NextResponse.json({
    verified: true,
    userId,
  });
  setSessionCookie(res, sid);

  return res;
}
