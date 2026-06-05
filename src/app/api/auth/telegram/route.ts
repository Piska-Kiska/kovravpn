// src/app/api/auth/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { secureCodeAlpha, rateLimit, getClientIp } from "@/lib/ratelimit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`tgauth:${ip}`, 5, 60);
  if (!rl.ok) {
    return NextResponse.json({ error: `Подождите ${rl.retryAfter} сек` }, { status: 429 });
  }

  let ref: string | null = null;
  try {
    const body = await req.json();
    ref = body.ref || null;
  } catch {}

  const code = secureCodeAlpha();

  await redis.set(
    `auth:${code}`,
    JSON.stringify({ verified: false, ...(ref ? { ref } : {}) }),
    { ex: 600 }
  );

  return NextResponse.json({ code });
}
