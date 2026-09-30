// src/app/api/promo/redeem/route.ts
//
// Redeem a promo code into the prepaid USD wallet (`balance_usd:{userId}`),
// exactly like the bot does and through the same function
// (lib/promo.ts redeemPromoToWallet): once per code and user, never burning a
// code without crediting it. Until 30.09.2026 this route marked the code used
// and credited nothing (it called the retired rouble balance).
//
// Auth: the session (cookie or `Authorization: Bearer`). Body: { code }.
// 200 { success: true, amount (USD), amountCents, balanceUsdCents, message }
// 400/409/429/500 { error } — the Russian texts are what the cabinet's
// classifier (lib/server-errors.ts) maps to its dictionary.

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import { PROMO_ERROR_TEXT, redeemPromoToWallet } from "@/lib/promo";

/** Guessing codes must stay slow: per user and per address, 10 minutes. */
const RL_USER_MAX = 10;
const RL_IP_MAX = 30;
const RL_WINDOW_SEC = 600;
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    const userId = session.userId;

    const ip = getClientIp(req);
    const [rlUser, rlIp] = await Promise.all([
      rateLimit(`promo:u:${userId}`, RL_USER_MAX, RL_WINDOW_SEC),
      rateLimit(`promo:ip:${ip}`, RL_IP_MAX, RL_WINDOW_SEC),
    ]);
    if (!rlUser.ok || !rlIp.ok) {
      const retryAfter = Math.max(rlUser.retryAfter, rlIp.retryAfter);
      return NextResponse.json(
        { error: `Подождите ${retryAfter} сек` },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(retryAfter) } },
      );
    }

    let code: unknown;
    try {
      const body: unknown = await req.json();
      code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
    } catch {
      code = undefined;
    }
    if (typeof code !== "string" || code.trim().length === 0 || code.length > 32) {
      return NextResponse.json({ error: PROMO_ERROR_TEXT.empty }, { status: 400, headers: NO_STORE });
    }

    const r = await redeemPromoToWallet(code, userId);
    if (r.ok) {
      const usd = (r.amountCents / 100).toFixed(2);
      return NextResponse.json(
        {
          success: true,
          amount: r.amountCents / 100,
          amountCents: r.amountCents,
          balanceUsdCents: r.balanceCents,
          message: `Promo code applied: +$${usd} to your balance`,
        },
        { headers: NO_STORE },
      );
    }
    const status = r.error === "busy" ? 409 : r.error === "internal" ? 500 : 400;
    return NextResponse.json({ error: PROMO_ERROR_TEXT[r.error] }, { status, headers: NO_STORE });
  } catch (error) {
    console.error("[promo/redeem]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: PROMO_ERROR_TEXT.internal }, { status: 500, headers: NO_STORE });
  }
}
