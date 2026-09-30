// src/app/api/auth/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { secureCodeAlpha, rateLimit, getClientIp } from "@/lib/ratelimit";
import { isReferralCode } from "@/lib/telegram-login";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`tgauth:${ip}`, 5, 60);
  if (!rl.ok) {
    return NextResponse.json({ error: `Подождите ${rl.retryAfter} сек` }, { status: 429 });
  }

  // The referral code from /register?ref=…; it rides on the sign-in code
  // until /verify creates the account (lib/telegram-login.ts). Only a value
  // shaped like a code is kept.
  let ref: string | null = null;
  try {
    const body: unknown = await req.json();
    const candidate = body && typeof body === "object" ? (body as { ref?: unknown }).ref : undefined;
    ref = isReferralCode(candidate) ? candidate : null;
  } catch {
    // No body or not JSON: a sign-in without a referral.
  }

  const code = secureCodeAlpha();

  await redis.set(
    `auth:${code}`,
    JSON.stringify({ verified: false, ...(ref ? { ref } : {}) }),
    { ex: 600 }
  );

  return NextResponse.json({ code });
}
