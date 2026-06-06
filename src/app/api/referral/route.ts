// src/app/api/referral/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getReferralStats } from "@/lib/referrals";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats = await getReferralStats(session.userId);

  return NextResponse.json({
    code: stats.code,
    link: `https://kovravpn.com/register?ref=${stats.code}`,
    botLink: `https://t.me/KovraVPN_bot?start=ref_${stats.code}`,
    total: stats.total,
    rewarded: stats.rewarded,
    pending: stats.pending,
    rewardDays: 14,
  });
}
