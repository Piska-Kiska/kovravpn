// src/app/api/promo/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listPromos, deletePromo } from "@/lib/promo";
import { safeEqual } from "@/lib/safe-compare";

/** Admin auth: X-Internal-Key = the bot token, compared in constant time. */
function isAdmin(req: NextRequest): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN || "";
  const key = req.headers.get("x-internal-key");
  return token.length > 0 && key !== null && safeEqual(key, token);
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const promos = await listPromos();
  return NextResponse.json({ promos });
}

export async function DELETE(req: NextRequest) {
  if (!isAdmin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  await deletePromo(code);
  return NextResponse.json({ success: true });
}
