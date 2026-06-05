// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "sid";
const INACTIVITY_DEFAULT = 60 * 60 * 1000;     // 1 hour
const INACTIVITY_REMEMBER = 7 * 24 * 60 * 60 * 1000; // 7 days
const SESSION_TTL_DEFAULT = 60 * 60;
const SESSION_TTL_REMEMBER = 7 * 24 * 60 * 60;

export async function middleware(req: NextRequest) {
  const sid = req.cookies.get(COOKIE_NAME)?.value;

  if (!sid) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!redisUrl || !redisToken) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    // Get session
    const res = await fetch(
      `${redisUrl}/get/session:${encodeURIComponent(sid)}`,
      { headers: { Authorization: `Bearer ${redisToken}` } }
    );
    const data = await res.json();

    if (!data.result) {
      const response = NextResponse.redirect(new URL("/login", req.url));
      response.cookies.delete(COOKIE_NAME);
      return response;
    }

    const session = JSON.parse(data.result);
    const now = Date.now();
    const maxInactivity = session.remember ? INACTIVITY_REMEMBER : INACTIVITY_DEFAULT;

    // Check inactivity
    if (now - (session.lastActivity || session.createdAt) > maxInactivity) {
      // Delete expired session
      await fetch(`${redisUrl}/del/session:${encodeURIComponent(sid)}`, {
        headers: { Authorization: `Bearer ${redisToken}` },
      });
      const response = NextResponse.redirect(new URL("/login", req.url));
      response.cookies.delete(COOKIE_NAME);
      return response;
    }

    // Touch session — update lastActivity (sliding window)
    session.lastActivity = now;
    const ttl = session.remember ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT;
    await fetch(redisUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", `session:${sid}`, JSON.stringify(session), "EX", ttl]),
    });

    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
