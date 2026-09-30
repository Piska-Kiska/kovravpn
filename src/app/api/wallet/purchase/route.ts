// src/app/api/wallet/purchase/route.ts
//
// Pay for a plan (purchase or renewal) or a device add-on from the prepaid
// USD wallet — the "Pay from balance" button of the web cabinet and the
// Mini App. All the money rules live in lib/wallet-purchase.ts.
//
// Auth: the session (cookie on the site, `Authorization: Bearer` in the Mini
// App). Body: { kind: "plan1" | "plan3" | "device", term: 1 | 6 | 12,
// requestId: string (8–80 of [A-Za-z0-9_-], one per tap), source?: "web" | "miniapp" }.
//
// Answers (always Cache-Control: no-store):
//   200 { ok: true, product, priceCents, balanceCents, replayed }
//   402 { ok: false, error: "insufficient_balance", priceCents, balanceCents, needCents }
//   409 { ok: false, error: "busy" | "in_progress" | "request_reused" | "other_plan_active" | "no_plan", activePlan? }
//       ("no_plan": an extra device slot is sold only on top of a running plan)
//   400 { ok: false, error: "invalid_request" }   401 unauthorized   429 rate limited
//   500 { ok: false, error: "grant_failed", refunded } | { ok: false, error: "internal" }

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import {
  isValidRequestId,
  parseWalletProduct,
  purchaseFromWallet,
  type WalletPurchaseSource,
} from "@/lib/wallet-purchase";

const RL_MAX = 20;
const RL_WINDOW_SEC = 60;
const NO_STORE = { "Cache-Control": "no-store" } as const;

function reply(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return reply(401, { ok: false, error: "unauthorized" });
    const userId = session.userId;

    const rl = await rateLimit(`walletbuy:${userId}`, RL_MAX, RL_WINDOW_SEC);
    if (!rl.ok) return reply(429, { ok: false, error: "too_many_requests" }, { "Retry-After": String(rl.retryAfter) });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return reply(400, { ok: false, error: "invalid_request" });
    }
    if (typeof body !== "object" || body === null) return reply(400, { ok: false, error: "invalid_request" });
    const b = body as { kind?: unknown; term?: unknown; requestId?: unknown; source?: unknown };
    const product = parseWalletProduct(b.kind, b.term);
    if (!product || !isValidRequestId(b.requestId)) return reply(400, { ok: false, error: "invalid_request" });
    const source: WalletPurchaseSource = b.source === "miniapp" ? "miniapp" : "web";

    const r = await purchaseFromWallet({ userId, product, requestId: b.requestId, source });
    if (r.status === "ok") {
      return reply(200, {
        ok: true,
        product: r.product,
        priceCents: r.priceCents,
        balanceCents: r.balanceCents,
        replayed: r.replayed,
      });
    }
    if (r.status === "insufficient") {
      return reply(402, {
        ok: false,
        error: "insufficient_balance",
        priceCents: r.priceCents,
        balanceCents: r.balanceCents,
        needCents: r.needCents,
      });
    }
    if (r.status === "conflict") {
      return reply(409, { ok: false, error: r.reason, ...(r.activePlan ? { activePlan: r.activePlan } : {}) });
    }
    if (r.reason === "invalid_request") return reply(400, { ok: false, error: "invalid_request" });
    if (r.reason === "grant_failed") return reply(500, { ok: false, error: "grant_failed", refunded: r.refunded === true });
    return reply(500, { ok: false, error: "internal" });
  } catch (error) {
    console.error("[wallet/purchase]", error instanceof Error ? error.message : error);
    return reply(500, { ok: false, error: "internal" });
  }
}
