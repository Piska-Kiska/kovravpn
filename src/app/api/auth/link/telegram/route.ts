// src/app/api/auth/link/telegram/route.ts
import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { getSessionFromRequest } from "@/lib/session";

export async function POST(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user already has Telegram linked
  const raw = await redis.get(`user:${session.userId}`);
  if (raw) {
    const user = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (user.telegramId) {
      return NextResponse.json(
        { error: "Telegram уже привязан" },
        { status: 409 }
      );
    }
  }

  const { secureCodeAlpha } = await import("@/lib/ratelimit");
  const code = secureCodeAlpha();

  await redis.set(
    `link_tg:${code}`,
    JSON.stringify({ userId: session.userId, verified: false }),
    { ex: 600 }
  );

  return NextResponse.json({ code });
}
