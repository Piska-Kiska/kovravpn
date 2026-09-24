// src/lib/node-token-auth.ts
//
// The bearer check of the endpoints Kovra's own nodes call
// (/api/internal/node-uuids). Each endpoint has its own token, shared only
// with the nodes that need it.
//
// Unset → "unconfigured", never "open": a forgotten variable must close the
// door, and the endpoint answers 503 so a node does not read the refusal as
// "empty".

import { createHash, timingSafeEqual } from "node:crypto";

export type NodeTokenAuth = "ok" | "unconfigured" | "unauthorized";

/**
 * Check the Authorization header against the configured token in constant
 * time. Both sides are hashed first so that their lengths match and the
 * comparison leaks neither the token nor its length.
 */
export function checkNodeToken(header: string | null, token: string | undefined): NodeTokenAuth {
  const expected = (token ?? "").trim();
  if (!expected) return "unconfigured";
  const given = header ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(`Bearer ${expected}`).digest();
  return timingSafeEqual(a, b) ? "ok" : "unauthorized";
}
