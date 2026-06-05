import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Hy2AuthRequest {
  addr?: string;
  auth?: string;
  tx?: number;
}

export async function POST(req: NextRequest) {
  let body: Hy2AuthRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  const uuid = (body.auth ?? "").trim();
  if (!uuid || uuid.length < 8) {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  try {
    const exists = await redis.get(`hy2:${uuid}`);
    if (exists) {
      return NextResponse.json({ ok: true, id: uuid }, { status: 200 });
    }
  } catch (err) {
    console.error("[hy2/auth] redis error:", err);
  }

  return NextResponse.json({ ok: false }, { status: 200 });
}
