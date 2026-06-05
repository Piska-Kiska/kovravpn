// src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { destroySession, clearSessionCookie, COOKIE_NAME } from "@/lib/session";

export async function POST(req: NextRequest) {
  const sid = req.cookies.get(COOKIE_NAME)?.value;

  if (sid) {
    await destroySession(sid);
  }

  const res = NextResponse.json({ success: true });
  clearSessionCookie(res);
  return res;
}
