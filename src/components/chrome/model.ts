// src/components/chrome/model.ts
//
// Pure helpers and types of the header chrome. Type-only imports, so the
// node tests load this file directly under type stripping.
import type { HeroState } from "@/lib/dashboard/format";

/** Who is signed in, as the account menu shows it. */
export interface Identity {
  /** Email, or "Telegram ID 123" for Telegram-only accounts. */
  label: string;
  /** First character of the email; null for Telegram-only accounts. */
  initial: string | null;
}

export type StatusTone = "ok" | "warn" | "danger";

/** The plan line under the email in the account menu. */
export interface AccountStatus {
  tone: StatusTone;
  text: string;
}

const MONOGRAM_RE = /^[\p{L}\p{N}]$/u;

/**
 * The lowercase letter of the "d." monogram, or null when the initial is
 * missing or not a letter / digit (the trigger then shows the person glyph).
 */
export function monogramChar(initial: string | null | undefined): string | null {
  if (typeof initial !== "string") return null;
  const first = Array.from(initial.trim())[0];
  if (!first) return null;
  // Lower-casing can add a combining mark ("İ" -> "i" + U+0307): keep the base letter.
  const ch = Array.from(first.toLocaleLowerCase())[0] ?? "";
  return MONOGRAM_RE.test(ch) ? ch : null;
}

/** active = ok, expiring = warn, expired = danger, never had a plan = no line. */
export function statusTone(state: HeroState): StatusTone | null {
  switch (state) {
    case "active":
      return "ok";
    case "expiring":
      return "warn";
    case "expired":
      return "danger";
    default:
      return null;
  }
}
