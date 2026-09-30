// src/app/api/wallet/topup/route.ts
//
// Create a top-up invoice for the prepaid USD wallet from the web cabinet or
// the Mini App — the same invoices the bot creates (lib/wallet-topup.ts); the
// payment webhooks credit `balance_usd:{userId}` from the `topup_` order id.
//
// Auth: the session (cookie or `Authorization: Bearer`). Body:
//   { method: "card" | "cryptobot" | "crypto" | "lava",
//     amountUsd: number (per-method minimum … 1000),
//     returnTo: "web" | "miniapp",
//     lavaMethod?: "card" | "paypal" | "applepay" | "pix" | "sepa" | "ideal" | "mbway",
//     lavaCurrency?: "USD" | "EUR" }
// Return addresses: web → /dashboard?paid=1; miniapp → https://t.me/<bot>?startapp=paid.
//
// Answers (always Cache-Control: no-store):
//   200 { ok: true, method, amountUsd, amountCents, payUrl, chargeLabel }
//   400 { ok: false, error: "invalid_request" | "invalid_method" | "invalid_amount", minUsd?, maxUsd? }
//   401 unauthorized   429 rate limited
//   503 { ok: false, error: "unavailable" }      (the line has no keys here)
//   502 { ok: false, error: "provider_error" }   (the provider refused or timed out)

import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { resolveLang } from "@/lib/bot-i18n";
import { isLavaCurrency, lavaMethod } from "@/lib/lava-methods";
import { createWalletTopupInvoice, isTopupMethod, type TopupReturn } from "@/lib/wallet-topup";

/** Every call may create an invoice at a provider: keep it low. */
const RL_MAX = 10;
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

    const rl = await rateLimit(`wallettopup:${userId}`, RL_MAX, RL_WINDOW_SEC);
    if (!rl.ok) return reply(429, { ok: false, error: "too_many_requests" }, { "Retry-After": String(rl.retryAfter) });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return reply(400, { ok: false, error: "invalid_request" });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return reply(400, { ok: false, error: "invalid_request" });
    }
    const b = body as {
      method?: unknown;
      amountUsd?: unknown;
      returnTo?: unknown;
      lavaMethod?: unknown;
      lavaCurrency?: unknown;
    };
    if (!isTopupMethod(b.method)) return reply(400, { ok: false, error: "invalid_method" });
    if (b.returnTo !== "web" && b.returnTo !== "miniapp") return reply(400, { ok: false, error: "invalid_request" });
    const returnTo: TopupReturn = b.returnTo;
    if (typeof b.amountUsd !== "number" || !Number.isFinite(b.amountUsd)) {
      return reply(400, { ok: false, error: "invalid_amount" });
    }
    let lavaMethodId: Parameters<typeof createWalletTopupInvoice>[0]["lavaMethodId"];
    if (b.lavaMethod !== undefined) {
      const spec = typeof b.lavaMethod === "string" ? lavaMethod(b.lavaMethod) : null;
      if (!spec) return reply(400, { ok: false, error: "invalid_method" });
      lavaMethodId = spec.id;
    }
    if (b.lavaCurrency !== undefined && !(isLavaCurrency(b.lavaCurrency) && b.lavaCurrency !== "RUB")) {
      return reply(400, { ok: false, error: "invalid_method" });
    }

    const r = await createWalletTopupInvoice({
      userId,
      method: b.method,
      amountUsd: b.amountUsd,
      returnTo,
      ...(lavaMethodId ? { lavaMethodId } : {}),
      ...(b.lavaCurrency === "USD" || b.lavaCurrency === "EUR" ? { lavaCurrency: b.lavaCurrency } : {}),
      locale: await resolveLang(userId),
    });
    if (r.ok) {
      console.info(JSON.stringify({ evt: "wallet.topup_invoice", userId, method: r.method, amountCents: r.amountCents, returnTo }));
      return reply(200, {
        ok: true,
        method: r.method,
        amountUsd: r.amountUsd,
        amountCents: r.amountCents,
        payUrl: r.payUrl,
        chargeLabel: r.chargeLabel,
      });
    }
    if (r.error === "unavailable") return reply(503, { ok: false, error: "unavailable" });
    if (r.error === "provider_error") return reply(502, { ok: false, error: "provider_error" });
    return reply(400, {
      ok: false,
      error: r.error,
      ...("minUsd" in r && r.minUsd !== undefined ? { minUsd: r.minUsd, maxUsd: r.maxUsd } : {}),
    });
  } catch (error) {
    console.error("[wallet/topup]", error instanceof Error ? error.message : error);
    return reply(500, { ok: false, error: "internal" });
  }
}
