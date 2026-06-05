// src/app/api/promo/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createPromo } from "@/lib/promo";

const ADMIN_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

export async function POST(req: NextRequest) {
  try {
    // Admin auth: X-Internal-Key = bot token
    const key = req.headers.get("x-internal-key");
    if (!key || key !== ADMIN_TOKEN) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { code, amount, maxUses, expiresInDays, description, createdBy } = await req.json();

    if (!amount || amount <= 0 || amount > 10000) {
      return NextResponse.json({ error: "Сумма от 1 до 10000 ₽" }, { status: 400 });
    }

    const promo = await createPromo({
      code: code || undefined,
      amount,
      maxUses: maxUses || 0,
      expiresInDays: expiresInDays || 0,
      description: description || "",
      createdBy: createdBy || "admin",
    });

    return NextResponse.json({ success: true, promo });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Ошибка";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
