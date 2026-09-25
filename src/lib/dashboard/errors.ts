// src/lib/dashboard/errors.ts
// Server error strings of the device routes that the shared table in
// src/lib/server-errors.ts does not know (vpn/create limit, vpn/delete,
// vpn/reset-hwid), mapped to dashboard keys. Everything else falls back to
// localizeError(), which never shows Russian server text outside ru.
import type { Lang } from "@/i18n/dict";
import type { DashDict } from "@/lib/dash-i18n";
import { localizeError } from "@/lib/i18n-shell";

/** src/lib/balance.ts canCreateProfileAsync() and src/app/api/vpn/{delete,reset-hwid}. */
type DashErrorKey = keyof Pick<DashDict, "max_devices" | "err_no_slot" | "err_device_gone" | "err_reset_failed" | "err_generic">;

const DASH_ERROR_TABLE: Readonly<Record<string, DashErrorKey>> = {
  "Maximum 100 devices": "max_devices",
  "No active device slot. Buy a plan or add a device to connect.": "err_no_slot",
  "Profile not found": "err_device_gone",
  "No profiles": "err_device_gone",
  "Reset failed": "err_reset_failed",
  // the shared table maps this to "couldn't set up the device", wrong for a delete
  "Delete failed": "err_generic",
};

/**
 * UI text for a failed request. A missing error string on an ordinary status
 * gives `fallback`; 429 / 5xx and every known string are localized.
 */
export function dashError(raw: unknown, status: number | undefined, lang: Lang, t: DashDict, fallback: string): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text && Object.prototype.hasOwnProperty.call(DASH_ERROR_TABLE, text)) return t[DASH_ERROR_TABLE[text]];
  if (!text && !(status === 429 || (typeof status === "number" && status >= 500))) return fallback;
  return localizeError(text || undefined, status, lang);
}
