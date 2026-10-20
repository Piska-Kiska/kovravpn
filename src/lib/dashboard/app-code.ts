// src/lib/dashboard/app-code.ts
//
// The cabinet's side of "code for the app" (POST /api/vpn/pair-code): what a
// 200 must carry before the dialog shows it, and how the time left is shown.
// No React and no imports, so tests load it under plain Node type stripping.

/** A code as the dialog shows it: `K7QM-2XPA` and when it stops working. */
export interface AppCode {
  readonly display: string;
  /** Epoch ms. */
  readonly expiresAt: number;
}

/** Eight characters of the code alphabet with a dash in the middle (lib/pair-code.ts formatPairCode). */
const DISPLAY_RE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

/** No code lives longer (lib/pair-code.ts PAIR_CODE_TTL_SEC is 600). */
const MAX_LIFETIME_SEC = 3_600;

/**
 * The code in a 200 of POST /api/vpn/pair-code, dated from `now`, or null
 * for a body that is not one (the dialog then says "try again").
 */
export function parseAppCode(body: unknown, now: number): AppCode | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const { display, expiresIn } = body as Readonly<Record<string, unknown>>;
  if (typeof display !== "string" || !DISPLAY_RE.test(display)) return null;
  if (typeof expiresIn !== "number" || !Number.isSafeInteger(expiresIn) || expiresIn <= 0 || expiresIn > MAX_LIFETIME_SEC) return null;
  return { display, expiresAt: now + expiresIn * 1000 };
}

/** Time left as `m:ss`, rounded up so `0:00` is never shown while the code still works. */
export function formatLeft(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
