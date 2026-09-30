// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { destroySession, clearSessionCookie, sessionIdFromRequest } from "@/lib/session";

export async function POST(req: NextRequest) {
  // Bearer (Mini App) wins, exactly as in getSessionFromRequest: logging out
  // of the Mini App ends that session and leaves the site's cookie alone.
  const { sid, source } = sessionIdFromRequest(req);

  if (sid) {
    await destroySession(sid);
  }

  const res = NextResponse.json({ success: true });
  if (source !== "bearer") clearSessionCookie(res);
  return res;
}
