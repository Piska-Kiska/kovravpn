// src/lib/admin-key.ts
//
// The credential of the admin HTTP API (promo codes, account setup, the
// broadcast): the `X-Admin-Key` header against ADMIN_API_KEY, a secret of its
// own. Before 30.09.2026 the promo routes and account/setup took the Telegram
// bot token instead (KM-14 / KS-7); that token travels in every
// api.telegram.org URL and sits in every tool that sends a bot message, so
// anyone holding it could mint promo codes or free plans.
//
// Fails closed: with ADMIN_API_KEY unset or empty the admin API answers 503
// and accepts nothing. Compared in constant time (lib/safe-compare.ts).

import { safeEqual } from "./safe-compare";

export const ADMIN_KEY_HEADER = "x-admin-key";

export type AdminKeyCheck = "ok" | "disabled" | "forbidden";

/** The environment variables read here (process.env satisfies it). */
export type AdminKeyEnv = Readonly<Record<string, string | undefined>>;

export function checkAdminKey(given: string | null | undefined, env: AdminKeyEnv = process.env): AdminKeyCheck {
  const expected = env.ADMIN_API_KEY ?? "";
  if (expected.length === 0) return "disabled";
  if (typeof given !== "string" || given.length === 0 || !safeEqual(given, expected)) return "forbidden";
  return "ok";
}

/** Check the admin key of a request (anything with headers.get, as NextRequest). */
export function checkAdminRequest(
  req: { headers: { get(name: string): string | null } },
  env: AdminKeyEnv = process.env,
): AdminKeyCheck {
  return checkAdminKey(req.headers.get(ADMIN_KEY_HEADER), env);
}
