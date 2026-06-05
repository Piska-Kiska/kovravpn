import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import type { UserAccount } from "@/lib/accounts";

export async function POST(req: NextRequest) {
  try {
    const { userId, plan, extraProfiles, days, adminKey } = await req.json();

    if (adminKey !== process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const PLAN_LIMITS: Record<string, number> = { free: 1, base: 3, optimal: 3, max: 3 };
    const PLAN_DAYS: Record<string, number> = { free: 3, base: 30, optimal: 180, max: 365 };

    const account: UserAccount = {
      plan: plan || "optimal",
      maxProfiles: PLAN_LIMITS[plan] || 3,
      extraProfiles: extraProfiles || 0,
      paidUntil: Date.now() + (days || PLAN_DAYS[plan] || 180) * 86400000,
      createdAt: Date.now(),
      balance: 0,
      balanceUpdatedAt: Date.now(),
    };

    await redis.set(`account:${userId}`, JSON.stringify(account));
    return NextResponse.json({ success: true, account });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
