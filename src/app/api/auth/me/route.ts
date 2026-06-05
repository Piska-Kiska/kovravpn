// src/app/api/auth/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";
import { getUserRecord } from "@/lib/accounts";

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await getUserRecord(session.userId);

  return NextResponse.json({
    authenticated: true,
    userId: session.userId,
    authMethod: user?.authMethod || "unknown",
    email: user?.email || (session.userId.startsWith("em_") ? session.userId.slice(3) : undefined),
    telegramId: user?.telegramId || (session.userId.startsWith("tg_") ? session.userId.slice(3) : undefined),
  });
}
