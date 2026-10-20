// src/lib/client-dist.ts
//
// Whether a subscription request comes from a store build of our app, and in
// which of the app's two languages its texts should be written.
//
// ── Why ──────────────────────────────────────────────────
// The Kovra app ships through the App Store without in-app purchases, as a
// free companion to the paid web service (App Review Guidelines 3.1.3(f)).
// That holds only while nothing in the app asks to buy outside it: no "Buy a
// plan", no price, no link to a page that sells, no pointer to the Telegram
// bot (it sells too). The texts the app shows under a refusal are written by
// this site (lib/sub-notices.ts), so the feeds give a store build its own,
// neutral copy of them.
//
// ── Two markers, either is enough ────────────────────────
// A store build sends `x-client-dist: appstore` (`DIST_HEADER` in the app's
// subscription.rs) and a User-Agent of exactly `Kovra/<version> (<platform>;
// appstore)` (lib/own-app.ts). The header is read first; the User-Agent covers
// a request that lost its custom headers on the way. `play` is accepted too,
// so a Google Play build added later gets the same form instead of the web
// one: there is one set of rules for every store.
//
// ── Everybody else is untouched ──────────────────────────
// Happ, v2rayN, sing-box and every other client carry neither marker and get
// the very same response as before this file existed
// (tests/sub-notices-store.test.mjs pins it).
//
// No imports but lib/own-app.ts, itself import-free: tests load this file
// under plain Node type stripping.

import { isOwnAppUa } from "./own-app";

/** The subset of Headers read here. */
export interface HeaderLike {
  get(name: string): string | null;
}

/** Header a store build sends on every subscription request. */
export const CLIENT_DIST_HEADER = "x-client-dist";

/** Stores whose builds get the neutral form. */
const STORE_DISTS: ReadonlySet<string> = new Set(["appstore", "play"]);

/** Whether this request comes from a store build of our app. Never throws. */
export function isStoreClient(headers: HeaderLike): boolean {
  const dist = (headers.get(CLIENT_DIST_HEADER) ?? "").trim().toLowerCase();
  return STORE_DISTS.has(dist) || isOwnAppUa(headers.get("user-agent"));
}

/** The app speaks Russian and English; everything that is not Russian reads English. */
export type StoreLang = "ru" | "en";

/**
 * The language of a store build's texts, from the `lang` the app adds to the
 * subscription link (`force_query` in its subscription.rs: the person's own
 * `lang`, else the window's). `ru`, `ru-RU` and `ru_RU` are Russian.
 */
export function storeLangOf(lang: string | null | undefined): StoreLang {
  const value = (lang ?? "").trim().toLowerCase();
  return value === "ru" || value.startsWith("ru-") || value.startsWith("ru_") ? "ru" : "en";
}
