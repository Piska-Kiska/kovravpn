// src/lib/sub-token-lookup.ts
//
// Does a subscription token exist? Used by the /add/<token> bridge so it
// never offers to add a link that would only answer with an error.
//
// Two kinds of token exist (see accounts.ts): per-device `sub_prof:<token>`
// and the older per-user `sub_token:<token>`. One MGET answers both.

import { redis } from "./redis";

/** 16–128 of [A-Za-z0-9_-]; issued tokens are 32 hex characters. */
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function isSubTokenShape(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

/** The plain subscription link of a token: what apps import and what the bot shows. */
export function plainSubUrl(token: string, origin = "https://kovravpn.com"): string {
  return `${origin}/api/sub/${token}`;
}

/** True when the token points at a device or an account. False on a malformed token. */
export async function subTokenExists(token: string): Promise<boolean> {
  if (!isSubTokenShape(token)) return false;
  const [perDevice, perUser] = await redis.mget<[unknown, unknown]>(`sub_prof:${token}`, `sub_token:${token}`);
  return (perDevice !== null && perDevice !== undefined) || (perUser !== null && perUser !== undefined);
}
