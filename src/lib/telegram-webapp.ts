// src/lib/telegram-webapp.ts
//
// Validation of the `initData` string Telegram hands to a Mini App.
//
// Pure crypto: no Redis, no Next, no network, never throws. Everything that
// touches the database lives in lib/telegram-login.ts and in the route
// /api/auth/telegram/miniapp.
//
// Algorithm (Bot API, "Validating data received via the Mini App"):
//   secret_key        = HMAC_SHA256(key = "WebAppData", data = <bot_token>)
//   data_check_string = every pair except `hash`, sorted by key, as
//                       `key=<value>` joined with '\n' (values URL-decoded)
//   hash              = hex(HMAC_SHA256(key = secret_key, data = data_check_string))
//
// The `signature` field (Bot API 7.10+, Ed25519 for third parties) IS part of
// the data_check_string: Telegram excludes only `hash`. Dropping it would make
// every real initData fail.

import { createHmac, timingSafeEqual } from "crypto";

/** The `user` field of initData, only the keys we use. */
export interface WebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
}

export type InitDataFailure =
  /** Not a query string, too long, or broken JSON in `user`. */
  | "malformed"
  /** No usable `hash` field. */
  | "no_hash"
  /** The signature does not match: another bot's token, edited fields, or a forgery. */
  | "bad_hash"
  /** `auth_date` is missing or older than allowed. */
  | "expired"
  /** Signed, but no `user` or no numeric `id` in it. */
  | "no_user"
  /** The bot token is empty: a server setup problem, not a client one. */
  | "no_token";

export type InitDataCheck =
  | {
      ok: true;
      user: WebAppUser;
      /** Unix seconds when Telegram issued the initData. */
      authDate: number;
      /** `?startapp=…` of the Mini App link (e.g. `paid` after a payment). */
      startParam?: string;
      queryId?: string;
    }
  | { ok: false; reason: InitDataFailure };

export interface ValidateInitDataOptions {
  /** "Now" in milliseconds; injected by tests. */
  now?: number;
  /** How many seconds initData stays fresh. One hour by default. */
  maxAgeSec?: number;
}

/** One hour: enough to open the cabinet, short enough for a leaked string to die. */
export const INIT_DATA_MAX_AGE_SEC = 60 * 60;

/**
 * Guard against junk: real initData is a few hundred bytes (user + auth_date +
 * hash + signature). Anything longer is not parsed at all.
 */
export const INIT_DATA_MAX_LEN = 4096;

/** Telegram allows `[A-Za-z0-9_-]{1,64}` in a start parameter. */
const START_PARAM_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Validate Mini App initData. Pure: never throws, never touches the network.
 *
 * Returns the parsed user ONLY for a matching and fresh signature: `user` in
 * an unchecked string is written by the client and means nothing.
 */
export function validateWebAppInitData(
  initData: string,
  botToken: string,
  opts: ValidateInitDataOptions = {},
): InitDataCheck {
  if (typeof initData !== "string" || initData.length === 0 || initData.length > INIT_DATA_MAX_LEN) {
    return { ok: false, reason: "malformed" };
  }
  if (typeof botToken !== "string" || botToken.length === 0) {
    return { ok: false, reason: "no_token" };
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const hashes = params.getAll("hash");
  const hash = hashes.length === 1 ? hashes[0] : null;
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    return { ok: false, reason: "no_hash" };
  }

  // Every pair except hash, sorted by key. Telegram never repeats keys; if
  // they do repeat, both go in, as in the reference algorithm (it walks pairs).
  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  // Constant-time compare; both are 32 bytes here (hash matched the regex).
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad_hash" };
  }

  // Signature first, freshness second: an `expired` answer must not let
  // anyone probe auth_date without the token.
  const authDate = Number(params.get("auth_date"));
  if (!Number.isInteger(authDate) || authDate <= 0) {
    return { ok: false, reason: "expired" };
  }
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  const maxAge = opts.maxAgeSec ?? INIT_DATA_MAX_AGE_SEC;
  if (nowSec - authDate > maxAge) {
    return { ok: false, reason: "expired" };
  }

  const rawUser = params.get("user");
  if (!rawUser) return { ok: false, reason: "no_user" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawUser);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!isWebAppUser(parsed)) return { ok: false, reason: "no_user" };
  const user = pickUser(parsed);

  const startParam = params.get("start_param");
  const queryId = params.get("query_id");
  return {
    ok: true,
    user,
    authDate,
    ...(startParam && START_PARAM_RE.test(startParam) ? { startParam } : {}),
    ...(queryId ? { queryId } : {}),
  };
}

function isWebAppUser(v: unknown): v is WebAppUser {
  if (typeof v !== "object" || v === null) return false;
  const id = (v as { id?: unknown }).id;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

/** Copy only the known keys with the right types, so nothing else rides along. */
function pickUser(v: WebAppUser): WebAppUser {
  const str = (x: unknown, max: number): string | undefined =>
    typeof x === "string" && x.length > 0 ? x.slice(0, max) : undefined;
  const out: WebAppUser = { id: v.id };
  const firstName = str(v.first_name, 256);
  const lastName = str(v.last_name, 256);
  const username = str(v.username, 64);
  const languageCode = str(v.language_code, 16);
  if (firstName !== undefined) out.first_name = firstName;
  if (lastName !== undefined) out.last_name = lastName;
  if (username !== undefined) out.username = username;
  if (languageCode !== undefined) out.language_code = languageCode;
  if (typeof v.is_premium === "boolean") out.is_premium = v.is_premium;
  if (typeof v.allows_write_to_pm === "boolean") out.allows_write_to_pm = v.allows_write_to_pm;
  return out;
}
