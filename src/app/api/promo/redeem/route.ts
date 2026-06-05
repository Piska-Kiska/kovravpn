// src/app/api/promo/redeem/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { redeemPromo } from "@/lib/promo";
import { addBalance, getBalanceInfo } from "@/lib/balance";
import { getAccount, getProfiles } from "@/lib/accounts";

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { code } = await req.json();
    if (!code || typeof code !== "string" || code.length > 32) {
      return NextResponse.json({ error: "Введите промокод" }, { status: 400 });
    }

    const userId = session.userId;
    const result = await redeemPromo(code, userId);

    // Credit balance
    const updated = await addBalance(userId, result.amount);
    const profiles = await getProfiles(userId);
    const bal = getBalanceInfo(updated, profiles.length);

    return NextResponse.json({
      success: true,
      amount: result.amount,
      balance: bal.balance,
      message: `Промокод активирован! +${result.amount} ₽ на баланс`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка активации";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
