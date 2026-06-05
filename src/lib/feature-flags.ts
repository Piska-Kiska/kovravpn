// src/lib/feature-flags.ts
//
// Per-user feature flags for staged rollout. Centralized so we can move
// to a Redis-backed implementation later without touching call sites.
//
// To roll out globally: replace the body of `isHappEncryptedEnabled` with
// `return true`. To shut off: `return false`.

// Empty — encrypted Happ flow is paused. iOS Happ Plus uses RSA keys that
// are neither in the official docs nor exposed via crypto.happ.su API, so
// encrypted links currently fail with "ошибка 39 / no server links".
// To re-enable later: add Telegram user IDs back, format "tg_<id>".
const HAPP_ENCRYPTED_TEST_USERS: ReadonlySet<string> = new Set([]);

/**
 * Whether the user receives the new encrypted-format subscription URL
 * (`/p/<token>`) instead of the plain `/api/sub/<token>`.
 *
 * The old endpoint stays operational for backwards compatibility — existing
 * subscriptions in client apps keep working unchanged. Only newly displayed
 * links use the encrypted form.
 */
export function isHappEncryptedEnabled(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return HAPP_ENCRYPTED_TEST_USERS.has(userId);
}
