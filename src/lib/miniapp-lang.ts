// src/lib/miniapp-lang.ts
//
// Which language the cabinet speaks inside the Telegram Mini App (/tg).
//
// Order:
//   1. `?lang=` of the bot's button — the bot's language, chosen in the bot;
//   2. the account's language, returned by the sign-in (the same value the
//      bot keeps: a startapp link or the return from a payment carries no
//      `?lang=`, and must still match the bot);
//   3. Telegram's `language_code` ("de-AT" counts as "de");
//   4. a choice stored in this webview (`kovra_lang`, explicit only);
//   5. English.
//
// The result is written into the page URL as `?lang=` before the cabinet
// mounts: the cabinet's own resolver (src/i18n/resolve.ts) reads the URL
// first, so nothing else has to know about Telegram.
//
// Pure: no DOM, no storage; the shell passes the values in.

import { isLang, type Lang } from "@/i18n/resolve";

export interface MiniAppLangInput {
  /** `?lang=` of the page URL. */
  urlLang: string | null | undefined;
  /** `lang` from POST /api/auth/telegram/miniapp (null when unknown). */
  accountLang: string | null | undefined;
  /** `initDataUnsafe.user.language_code` (display only, never trusted). */
  telegramLang: string | null | undefined;
  /** localStorage `kovra_lang`, only when it was an explicit choice. */
  storedExplicit: string | null | undefined;
}

/** "de-AT" / "DE_at" / "de" -> "de"; anything we do not speak -> null. */
export function langFromCode(code: string | null | undefined): Lang | null {
  if (typeof code !== "string") return null;
  const primary = code.trim().toLowerCase().split(/[-_]/)[0];
  return isLang(primary) ? primary : null;
}

export function pickMiniAppLang(i: MiniAppLangInput): Lang {
  // The URL value is exact: the bot writes one of our codes, nothing else.
  if (isLang(i.urlLang)) return i.urlLang;
  return langFromCode(i.accountLang) ?? langFromCode(i.telegramLang) ?? langFromCode(i.storedExplicit) ?? "en";
}

/**
 * `search` with `lang` set to `lang` (other parameters kept, in order).
 * Returns the string to put after the path, "" or "?…".
 */
export function searchWithLang(search: string, lang: Lang): string {
  const p = new URLSearchParams(search);
  p.set("lang", lang);
  const q = p.toString();
  return q ? `?${q}` : "";
}
