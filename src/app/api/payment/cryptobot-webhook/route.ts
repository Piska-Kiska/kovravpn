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
//
// Redis failing is never answered 2xx before the credit: the dedup key is
// released (when held), the answer is 503/500 so CryptoBot retries, and the
// admin is alerted with the invoice id (KM-07). Before this, a failed credit
// answered 200 and kept the key, so the retry was dropped as a duplicate and
// the wallet stayed empty.

import { NextRequest, NextResponse } from "next/server";
import { verifyCryptoBotSignature, type CryptoBotWebhookUpdate } from "@/lib/cryptobot";
import { addBalanceUsd } from "@/lib/bot-wallet";
import { resolveUserId } from "@/lib/accounts";
import { releaseDedupKey, reserveDedupKey } from "@/lib/dedup";
import { alertAdmin, errorText } from "@/lib/admin-alert";
import { noticeCents, notifyUser } from "@/lib/bot-v2/notify";

const DEDUP_TTL_SEC = 90 * 86400;

export async function POST(req: NextRequest) {
  // The dedup key while it is held for a credit that has not happened yet,
  // and whether the credit is done (see the header).
  let heldKey: string | null = null;
  let credited = false;
  let invRef = "?";
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
    invRef = invId;
    const dedupKey = `cryptobot_paid:${invId}`;
    let reserved: boolean;
    try {
      reserved = await reserveDedupKey(dedupKey, DEDUP_TTL_SEC);
    } catch (err) {
      // Nothing is reserved and nothing credited: a retry is exactly right.
      console.error("[cryptobot-webhook] dedup reserve failed, requesting retry:", err);
      await alertAdmin(`⚠️ <b>CryptoBot: Redis error, asked for a retry</b>\ninvoice <code>${invId}</code>: ${errorText(err)}`);
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }
    if (!reserved) return NextResponse.json({ ok: true, ignored: "duplicate" });
    heldKey = dedupKey;

    // Prefer the amount actually invoiced (USD fiat). Fall back to paid_amount.
    const usd = Number(inv.amount) || Number(meta.amountUsd) || 0;
    if (usd <= 0) return NextResponse.json({ ok: true, ignored: "zero amount" });

    // The account the invoice's id belongs to now (a linked Telegram account moved).
    let walletOwner: string;
    let newBal: number;
    try {
      walletOwner = await resolveUserId(userId);
      newBal = await addBalanceUsd(walletOwner, usd);
    } catch (err) {
      console.error("[cryptobot-webhook] wallet credit failed, requesting retry:", err);
      await releaseDedupKey(dedupKey).catch(() => {});
      heldKey = null;
      await alertAdmin(
        `⚠️ <b>CryptoBot: top-up credit failed, asked for a retry</b>\ninvoice <code>${invId}</code>, $${usd.toFixed(2)}: ${errorText(err)}`,
      );
      return NextResponse.json({ error: "internal" }, { status: 500 });
    }
    credited = true;
    await notifyUser(
      walletOwner,
      { kind: "topup", amountCents: noticeCents(usd), balanceCents: noticeCents(newBal) },
      [`✅ <b>Balance topped up</b>`, ``, `💵 +$${usd.toFixed(2)}`, `💰 Balance: <b>$${newBal.toFixed(2)}</b>`].join("\n"),
    );
    return NextResponse.json({ ok: true, credited: usd });
  } catch (error) {
    console.error("[cryptobot-webhook] unhandled error:", error);
    if (credited) {
      // Credited already: a retry would credit a second time.
      await alertAdmin(`⚠️ <b>CryptoBot: error after the credit</b>\ninvoice <code>${invRef}</code>: ${errorText(error)}`);
      return NextResponse.json({ ok: true });
    }
    if (heldKey) await releaseDedupKey(heldKey).catch(() => {});
    await alertAdmin(`⚠️ <b>CryptoBot: error before the credit, asked for a retry</b>\ninvoice <code>${invRef}</code>: ${errorText(error)}`);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
