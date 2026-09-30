// src/app/api/payment/cryptobot-webhook/route.ts
//
// CryptoBot (Crypto Pay) webhook — bot prepaid balance top-up ONLY.
//
// Security:
//   1. HMAC-SHA256 verify (header crypto-pay-api-signature) against
//      SHA256(API_TOKEN). Reject 401 on mismatch.
//   2. Atomic dedup `cryptobot_paid:<invoice_id>` SET NX (90d).
//   3. Credits `balance_usd:{userId}` parsed from payload.payload.userId.
//
// Only `invoice_paid` updates with status `paid` credit the balance.

import { NextRequest, NextResponse } from "next/server";
import { verifyCryptoBotSignature, type CryptoBotWebhookUpdate } from "@/lib/cryptobot";
import { addBalanceUsd } from "@/lib/bot-wallet";
import { resolveUserId } from "@/lib/accounts";
import { reserveDedupKey } from "@/lib/dedup";
import { noticeCents, notifyUser } from "@/lib/bot-v2/notify";

const DEDUP_TTL_SEC = 90 * 86400;

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get("crypto-pay-api-signature") || "";
    if (!verifyCryptoBotSignature(rawBody, sig)) {
      console.warn("[cryptobot-webhook] invalid signature");
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    let update: CryptoBotWebhookUpdate;
    try {
      update = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "invalid json" }, { status: 400 });
    }

    if (update.update_type !== "invoice_paid") {
      return NextResponse.json({ ok: true, ignored: "not invoice_paid" });
    }
    const inv = update.payload;
    if (!inv || inv.status !== "paid") {
      return NextResponse.json({ ok: true, ignored: "not paid" });
    }

    let meta: { userId?: string; amountUsd?: number } = {};
    try {
      meta = inv.payload ? JSON.parse(inv.payload) : {};
    } catch {
      /* ignore */
    }
    const userId = meta.userId;
    if (!userId) {
      return NextResponse.json({ ok: true, ignored: "no userId in payload" });
    }

    const invId = String(inv.invoice_id);
    if (!/^[a-zA-Z0-9_\-]{1,128}$/.test(invId)) {
      return NextResponse.json({ ok: true, ignored: "bad invoice_id" });
    }
    const reserved = await reserveDedupKey(`cryptobot_paid:${invId}`, DEDUP_TTL_SEC);
    if (!reserved) return NextResponse.json({ ok: true, ignored: "duplicate" });

    // Prefer the amount actually invoiced (USD fiat). Fall back to paid_amount.
    const usd = Number(inv.amount) || Number(meta.amountUsd) || 0;
    if (usd <= 0) return NextResponse.json({ ok: true, ignored: "zero amount" });

    // The account the invoice's id belongs to now (a linked Telegram account moved).
    const walletOwner = await resolveUserId(userId);
    const newBal = await addBalanceUsd(walletOwner, usd);
    await notifyUser(
      walletOwner,
      { kind: "topup", amountCents: noticeCents(usd), balanceCents: noticeCents(newBal) },
      [`✅ <b>Balance topped up</b>`, ``, `💵 +$${usd.toFixed(2)}`, `💰 Balance: <b>$${newBal.toFixed(2)}</b>`].join("\n"),
    );
    return NextResponse.json({ ok: true, credited: usd });
  } catch (error) {
    console.error("[cryptobot-webhook] unhandled error:", error);
    return NextResponse.json({ ok: true });
  }
}
