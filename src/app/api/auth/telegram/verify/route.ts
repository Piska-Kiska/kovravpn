// src/app/api/auth/telegram/verify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getAccount, createAccount, resolveUserId } from "@/lib/accounts";
import { createSession, setSessionCookie } from "@/lib/session";
import { resolveReferralCode, recordReferral } from "@/lib/referrals";
import { rateLimit, getClientIp } from "@/lib/ratelimit";

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
      : (raw as { verified: boolean; telegramId?: string });

  if (!data.verified) {
    return NextResponse.json({ verified: false });
  }

  // Verified — resolve alias or create user + session
  const userId = await resolveUserId(`tg_${data.telegramId}`);

  // Create user record if first time (no alias, no existing user)
  const existingUser = await redis.get(`user:${userId}`);
  if (!existingUser) {
    await redis.set(
      `user:${userId}`,
      JSON.stringify({
        authMethod: "telegram",
        telegramId: data.telegramId,
        createdAt: Date.now(),
      })
    );
  }

  // Ensure account exists
  const account = await getAccount(userId);
  const isNewUser = !account;
  if (!account) {
    await createAccount(userId, "free");
  }

  // Check for pending referral (from /start ref_CODE in bot or ref in auth code)
  if (isNewUser) {
    let refCodeToUse: string | null = null;

    // Check auth code for ref (from website register with ?ref=)
    if (data.ref) refCodeToUse = data.ref;

    // Check pending_ref from bot /start ref_CODE
    if (!refCodeToUse) {
      const pendingRef = await redis.get(`pending_ref:${data.telegramId}`);
      if (pendingRef) {
        refCodeToUse = String(pendingRef);
        await redis.del(`pending_ref:${data.telegramId}`);
      }
    }

    if (refCodeToUse) {
      const referrerId = await resolveReferralCode(refCodeToUse);
      if (referrerId && referrerId !== userId) {
        await recordReferral(referrerId, userId);
      }
    }
  }

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
