// src/app/api/wallet/route.ts
//
// GET: the prepaid USD wallet of the signed-in user and what the top-up form
// needs — a light poll for the Mini App and the cabinet (e.g. after coming
// back from a payment page), without the whole /api/account.
//
// 200 { ok: true, balanceUsdCents, topup: { methods: [{ id, minUsd, enabled }], maxUsd, quickUsd } }
// 401 unauthorized   429 rate limited

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { getBalanceCents } from "@/lib/bot-wallet";
import { walletTopupConfig } from "@/lib/wallet-topup";

const RL_MAX = 60;
const RL_WINDOW_SEC = 60;
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });

    const rl = await rateLimit(`wallet:${session.userId}`, RL_MAX, RL_WINDOW_SEC);
    if (!rl.ok) {
      return NextResponse.json(
        { ok: false, error: "too_many_requests" },
        { status: 429, headers: { ...NO_STORE, "Retry-After": String(rl.retryAfter) } },
      );
    }

    const balanceUsdCents = Math.max(0, await getBalanceCents(session.userId));
    return NextResponse.json({ ok: true, balanceUsdCents, topup: walletTopupConfig() }, { headers: NO_STORE });
  } catch (error) {
    console.error("[wallet]", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500, headers: NO_STORE });
  }
}
