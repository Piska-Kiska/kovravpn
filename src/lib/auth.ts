// src/lib/auth.ts
import { NextRequest } from "next/server";
import { getSessionFromRequest } from "./session";

const INTERNAL_KEY = process.env.INTERNAL_API_KEY || process.env.TELEGRAM_BOT_TOKEN || "";

/**
 * Authenticate API request. Returns userId or null.
 * Supports:
 * 1. Session cookie (website)
 * 2. X-Internal-Key header (bot/server-to-server)
 *
 * Pass `preParsedBody` when the caller has already consumed the request
 * stream via `await req.json()`. Otherwise `req.clone().json()` below
 * would fail (stream already read) and authentication would silently
 * return 401 for internal-key callers.
 */
export async function authenticateRequest(
  req: NextRequest,
  preParsedBody?: { userId?: string } | null
): Promise<{ userId: string | null; error?: string }> {
  // 1. Session cookie (website flow)
  const session = await getSessionFromRequest(req);
  if (session) return { userId: session.userId };

  // 2. Internal API key (bot / server-to-server)
  const internalKey = req.headers.get("x-internal-key");
  if (internalKey && internalKey === INTERNAL_KEY) {
    // Prefer pre-parsed body
    if (preParsedBody && typeof preParsedBody.userId === "string" && preParsedBody.userId) {
      return { userId: preParsedBody.userId };
    }
    // Fallback: read stream if still available
    try {
      const body = await req.clone().json();
      if (body && typeof body.userId === "string" && body.userId) {
        return { userId: body.userId };
      }
    } catch {
      // Body already consumed upstream and preParsedBody wasn't supplied
    }
  }

  return { userId: null, error: "Unauthorized" };
}
