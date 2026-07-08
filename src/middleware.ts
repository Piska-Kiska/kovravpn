// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "sid";
const INACTIVITY_DEFAULT = 60 * 60 * 1000;            // 1h
const INACTIVITY_REMEMBER = 7 * 24 * 60 * 60 * 1000;  // 7d
const SESSION_TTL_DEFAULT = 60 * 60;                  // 1h  (Redis EX)
const SESSION_TTL_REMEMBER = 7 * 24 * 60 * 60;        // 7d  (Redis EX)
const REDIS_TIMEOUT_MS = 1500;                        // fail fast вместо зависания
const TOUCH_THRESHOLD_MS = 60 * 1000;                 // не писать чаще раза в минуту

type Session = { remember?: boolean; createdAt?: number; lastActivity?: number };

function redirectLogin(req: NextRequest, clearCookie = false) {
  const res = NextResponse.redirect(new URL("/login", req.url));
  if (clearCookie) res.cookies.delete(COOKIE_NAME);
  return res;
}

async function redisFetch(url: string, init: RequestInit, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

export async function middleware(req: NextRequest) {
  // Dev-only design preview: NEXT_PUBLIC_DASH_MOCK=1 npm run dev
  if (process.env.NEXT_PUBLIC_DASH_MOCK === "1" && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }
  const sid = req.cookies.get(COOKIE_NAME)?.value;
  if (!sid) return redirectLogin(req);

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return redirectLogin(req, true);

  const auth = { Authorization: `Bearer ${redisToken}` };
  const key = `session:${encodeURIComponent(sid)}`;

  let session: Session;
  try {
    const res = await redisFetch(`${redisUrl}/get/${key}`, { headers: auth }, REDIS_TIMEOUT_MS);
    if (!res.ok) return redirectLogin(req, true);
    const data = (await res.json()) as { result?: string | null };
    if (!data.result) return redirectLogin(req, true);
    session = JSON.parse(data.result) as Session;
  } catch {
    return redirectLogin(req, true);
  }

  const now = Date.now();
  const last = session.lastActivity ?? session.createdAt ?? 0;
  const maxInactivity = session.remember ? INACTIVITY_REMEMBER : INACTIVITY_DEFAULT;
  if (now - last > maxInactivity) {
    redisFetch(`${redisUrl}/del/${key}`, { headers: auth }, REDIS_TIMEOUT_MS).catch(() => {});
    return redirectLogin(req, true);
  }

  if (now - last > TOUCH_THRESHOLD_MS) {
    session.lastActivity = now;
    const ttl = session.remember ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT;
    redisFetch(
      redisUrl,
      {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(["SET", `session:${sid}`, JSON.stringify(session), "EX", ttl]),
      },
      REDIS_TIMEOUT_MS
    ).catch(() => {});
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
