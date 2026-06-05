// src/app/api/promo/list/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listPromos, deletePromo } from "@/lib/promo";

const ADMIN_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

export async function GET(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  if (!key || key !== ADMIN_TOKEN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const promos = await listPromos();
  return NextResponse.json({ promos });
}

export async function DELETE(req: NextRequest) {
  const key = req.headers.get("x-internal-key");
  if (!key || key !== ADMIN_TOKEN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  await deletePromo(code);
  return NextResponse.json({ success: true });
}
