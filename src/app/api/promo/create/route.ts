// src/app/api/promo/create/route.ts
//
// Create a promo code (admin). Auth: X-Internal-Key = the bot token, compared
// in constant time. Promo amounts are US DOLLARS credited to the wallet
// (balance_usd), from $0.01 to PROMO_MAX_USD; lib/promo.ts enforces the same
// limit when the code is created and when it is redeemed.

import { NextRequest, NextResponse } from "next/server";
import { PROMO_MAX_USD, createPromo, isValidPromoAmount } from "@/lib/promo";
import { safeEqual } from "@/lib/safe-compare";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function intOrZero(v: unknown, max: number): number | null {
  if (v === undefined || v === null || v === "" || v === 0) return 0;
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max ? v : null;
}

export async function POST(req: NextRequest) {
  const adminToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const key = req.headers.get("x-internal-key");
  if (!adminToken || !key || !safeEqual(key, adminToken)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  let body: Record<string, unknown>;
  try {
    const raw: unknown = await req.json();
    if (typeof raw !== "object" || raw === null) throw new Error("not an object");
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  if (!isValidPromoAmount(body.amount)) {
    return NextResponse.json(
      { error: `Сумма в долларах: от $0.01 до $${PROMO_MAX_USD}` },
      { status: 400, headers: NO_STORE },
    );
  }
  const maxUses = intOrZero(body.maxUses, 1_000_000);
  const expiresInDays = intOrZero(body.expiresInDays, 3650);
  if (maxUses === null || expiresInDays === null) {
    return NextResponse.json({ error: "maxUses / expiresInDays: целые числа ≥ 0" }, { status: 400, headers: NO_STORE });
  }
  const str = (v: unknown, max: number): string | undefined =>
    typeof v === "string" && v.trim().length > 0 ? v.trim().slice(0, max) : undefined;

  try {
    const promo = await createPromo({
      code: str(body.code, 32),
      amount: body.amount,
      maxUses,
      expiresInDays,
      description: str(body.description, 200) ?? "",
      createdBy: str(body.createdBy, 64) ?? "admin",
    });
    console.info(JSON.stringify({ evt: "promo.create", code: promo.code, amount: promo.amount, maxUses: promo.maxUses }));
    return NextResponse.json({ success: true, promo }, { headers: NO_STORE });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 400, headers: NO_STORE });
  }
}
