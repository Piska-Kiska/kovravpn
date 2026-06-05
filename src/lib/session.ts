// src/lib/session.ts
import { redis } from "./redis";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

const SESSION_TTL_DEFAULT = 60 * 60;           // 1 hour
const SESSION_TTL_REMEMBER = 7 * 24 * 60 * 60; // 7 days
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

/** Extract session from incoming request cookie */
export async function getSessionFromRequest(
  req: NextRequest
): Promise<Session | null> {
  const sid = req.cookies.get(COOKIE_NAME)?.value;
  if (!sid) return null;
  return getSession(sid);
}
