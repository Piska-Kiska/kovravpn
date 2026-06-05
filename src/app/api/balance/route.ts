// src/app/api/balance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getAccount, getProfiles } from "@/lib/accounts";
import { getBalanceInfo } from "@/lib/balance";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await getAccount(session.userId);
  if (!account) return NextResponse.json({ balance: 0, dailyRate: 0, daysRemaining: 0 });

  const profiles = await getProfiles(session.userId);
  const info = getBalanceInfo(account, profiles.length);

  return NextResponse.json(info);
}
