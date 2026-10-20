// src/lib/login-return.ts
//
// Where /login sends a person back to after signing in.
//
// WHY. The Kovra app for iPhone and iPad links to /dashboard/account/delete
// (App Review Guideline 5.1.1(v): deletion reachable from the app). Opened
// without a session, the middleware used to send everyone to a bare /login,
// and a successful sign-in landed on /dashboard: the person had to find the
// deletion page again. Now the middleware passes the page as `?next=` and
// /login returns there.
//
// WHY AN ALLOW-LIST. `next` arrives in a URL anyone can craft. Anything that
// is not exactly one of our own pages is an open redirect waiting to happen
// ("//evil.example", "/\evil.example", "https:evil.example", encoded forms),
// so the value is parsed and compared to a short list of paths instead of
// being checked for a leading slash. The only query that survives is a
// supported `lang`, so the page opens in the language the link asked for.
// Everything else falls back to /dashboard, the old behaviour.
//
// Pure: its one import (i18n/resolve.ts) has no imports of its own, so the
// edge middleware imports it, and so does the login page in the browser.
//
// Ported from ProxysVPN's src/lib/login-return.ts; tests/login-return.test.mjs.

import { isLang } from "@/i18n/resolve";

/** Pages /login may return to. Add a path here, never a prefix. */
export const LOGIN_RETURN_PATHS: readonly string[] = ["/dashboard/account/delete"];

/** Where a sign-in lands when there is nothing (valid) to return to. */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

/** Longer than any path above with `?lang=xx`; a longer value is not ours. */
const MAX_RETURN_LEN = 200;

/** A throwaway origin to parse a relative value against. Never shown or fetched. */
const PARSE_BASE = "https://return.invalid";

/**
 * The value of `next` as a safe same-site path with an optional `?lang=`, or
 * null when it is anything else. O(length of the value).
 */
export function safeReturnPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_RETURN_LEN) return null;
  // A single leading slash and nothing a browser reads as another host.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  // Control characters (tab, newline) are dropped by URL parsers and can
  // turn "/\t/evil" into "//evil"; refuse them outright.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, PARSE_BASE);
  } catch {
    return null;
  }
  if (url.origin !== PARSE_BASE || url.hash !== "") return null;
  if (!LOGIN_RETURN_PATHS.includes(url.pathname)) return null;
  // `lang` only, once, and only a language the site has.
  const keys = [...url.searchParams.keys()];
  if (keys.some((k) => k !== "lang") || keys.length > 1) return null;
  const lang = url.searchParams.get("lang");
  if (lang !== null && !isLang(lang)) return null;
  return lang ? `${url.pathname}?lang=${lang}` : url.pathname;
}

/**
 * The /login address for a request to `pathname` + `search` that has no
 * session: with `?next=` when the page is one we return to, and with the
 * page's `lang` so /login opens in the same language. Bare /login otherwise,
 * exactly as before.
 */
export function loginUrlFor(pathname: string, search: string): string {
  const back = safeReturnPath(`${pathname}${search}`);
  if (!back) return "/login";
  const params = new URLSearchParams();
  params.set("next", back);
  const lang = new URLSearchParams(search).get("lang");
  if (isLang(lang)) params.set("lang", lang);
  return `/login?${params.toString()}`;
}

/** Where /login goes after a successful sign-in, read from its own query string. */
export function afterLoginPath(search: string): string {
  let next: string | null = null;
  try {
    next = new URLSearchParams(search).get("next");
  } catch {
    next = null;
  }
  return safeReturnPath(next) ?? DEFAULT_AFTER_LOGIN;
}
