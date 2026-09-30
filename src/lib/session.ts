// src/lib/session.ts
import { redis } from "./redis";
import type { NextResponse } from "next/server";
import { randomUUID } from "crypto";

const SESSION_TTL_DEFAULT = 60 * 60;           // 1 hour
export const SESSION_TTL_REMEMBER = 7 * 24 * 60 * 60; // 7 days
const INACTIVITY_DEFAULT = 60 * 60 * 1000;     // 1 hour in ms
const INACTIVITY_REMEMBER = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
export const COOKIE_NAME = "sid";

export interface Session {
  userId: string;
  createdAt: number;
  lastActivity: number;
  remember: boolean;
}

/** Create a new session in Redis */
export async function createSession(userId: string, remember = false): Promise<string> {
  const sid = randomUUID();
  const now = Date.now();
  const session: Session = { userId, createdAt: now, lastActivity: now, remember };
  const ttl = remember ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT;
  await redis.set(`session:${sid}`, JSON.stringify(session), { ex: ttl });
  return sid;
}

/** Get session data by session ID */
export async function getSession(sid: string): Promise<Session | null> {
  const raw = await redis.get(`session:${sid}`);
  if (!raw) return null;
  const session: Session = typeof raw === "string" ? JSON.parse(raw) : raw as Session;

  // Check inactivity timeout
  const maxInactivity = session.remember ? INACTIVITY_REMEMBER : INACTIVITY_DEFAULT;
  if (Date.now() - (session.lastActivity || session.createdAt) > maxInactivity) {
    await redis.del(`session:${sid}`);
    return null;
  }

  return session;
}

/** Touch session — update lastActivity and extend TTL (sliding window) */
export async function touchSession(sid: string, session: Session): Promise<void> {
  session.lastActivity = Date.now();
  const ttl = session.remember ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT;
  await redis.set(`session:${sid}`, JSON.stringify(session), { ex: ttl });
}

/** Delete session from Redis */
export async function destroySession(sid: string): Promise<void> {
  await redis.del(`session:${sid}`);
}

/** Attach session cookie to response */
export function setSessionCookie(res: NextResponse, sid: string, remember = false): void {
  const maxAge = remember ? SESSION_TTL_REMEMBER : SESSION_TTL_DEFAULT;
  res.cookies.set(COOKIE_NAME, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

/** Clear session cookie */
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Our session ids are `randomUUID()` values. */
const SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The parts of a request the session lookup reads (NextRequest satisfies it). */
export interface SessionCarrier {
  headers: { get(name: string): string | null };
  cookies: { get(name: string): { value: string } | undefined };
}

export interface RequestSid {
  /** Session id to look up, or null when there is none (or it is malformed). */
  sid: string | null;
  /** Where it came from. `bearer` is set even for a malformed Bearer value. */
  source: "bearer" | "cookie" | "none";
}

/**
 * Which session a request speaks for.
 *
 * `Authorization: Bearer <sid>` is what the Telegram Mini App sends: inside
 * Telegram's webview a third-party cookie does not survive, so
 * /api/auth/telegram/miniapp returns the sid in the body and the page sends
 * it as a header. It is the same `session:<sid>` record, no second mechanism.
 *
 * A Bearer header WINS and never falls back to the cookie, even when it is
 * malformed or its session is gone: one Telegram webview can switch between
 * two Telegram accounts, and a stale cookie from the other one would open the
 * wrong cabinet. The Mini App answers a 401 by exchanging initData again.
 */
export function sessionIdFromRequest(req: SessionCarrier): RequestSid {
  const header = req.headers.get("authorization");
  if (header !== null && /^\s*bearer(\s|$)/i.test(header)) {
    const value = header.trim().slice("bearer".length).trim();
    return { sid: SID_RE.test(value) ? value : null, source: "bearer" };
  }
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie) return { sid: cookie, source: "cookie" };
  return { sid: null, source: "none" };
}

/**
 * Session of the incoming request: the Bearer header when present (and only
 * it), otherwise the `sid` cookie. The site never sends the header, so for it
 * nothing changes: one cookie, one Redis lookup.
 */
export async function getSessionFromRequest(
  req: SessionCarrier
): Promise<Session | null> {
  const { sid } = sessionIdFromRequest(req);
  if (!sid) return null;
  return getSession(sid);
}
