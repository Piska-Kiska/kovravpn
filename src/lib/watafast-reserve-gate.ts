// src/lib/watafast-reserve-gate.ts
//
// Who is given the reserve path of the app (lib/watafast-reserve.ts): the
// reserve nodes in their manifest, and a credential for them
// (lib/watafast-credential.ts). Everyone else gets a manifest without them
// and no credential.
//
// Owner first, as with every change people see: the list lives in Redis so it
// widens without a deploy.
//
//   SADD wf:reserve:users tg_<telegram id>   one more account (a userId)
//   SADD wf:reserve:users em_<email>         the same, for an e-mail account
//   SADD wf:reserve:users "*"                everyone
//   SREM wf:reserve:users "*"                back to the list
//
// The gate is asked in two places, and both must agree: the manifest (whether
// the nodes are named) and the route that issues a credential. Leaving the
// nodes out of the manifest alone would leave the issue open to anyone who
// guessed the address of the route.
//
// An account is let in when its own id, or the Telegram id linked to it, is in
// the set; the owner is let in by either without a read. One SMISMEMBER per
// question; a failed read is "no" (the owner still passes). Callers ask only
// when the deployment has reserve nodes at all.

import type { UserRecord } from "./accounts";
import { ADMIN_TG_ID } from "./bot-owner";

export const WATAFAST_RESERVE_USERS_KEY = "wf:reserve:users";
/** The member that opens the reserve to everyone. */
export const WATAFAST_RESERVE_EVERYONE = "*";

/** The owner's account: never depends on Redis, the gate must not lock out the person checking it. */
export const WATAFAST_RESERVE_OWNER_ID = `tg_${ADMIN_TG_ID}`;

const TELEGRAM_ID_RE = /^\d{1,20}$/;

/** What the gate needs of Redis. */
export interface ReserveGateStore {
  smismember(key: string, members: string[]): Promise<unknown[]>;
}

/**
 * Whether this account is given the reserve path. `user` is the account's
 * record (lib/accounts.ts getUserRecord), or null when it has none. Never
 * throws: a failed read means false.
 */
export async function watafastReserveForUser(
  store: ReserveGateStore,
  userId: string | null | undefined,
  user: Pick<UserRecord, "telegramId"> | null,
): Promise<boolean> {
  if (typeof userId !== "string" || userId === "" || userId === WATAFAST_RESERVE_EVERYONE) return false;
  const telegramId = typeof user?.telegramId === "string" && TELEGRAM_ID_RE.test(user.telegramId) ? user.telegramId : null;
  const linked = telegramId === null ? null : `tg_${telegramId}`;
  if (userId === WATAFAST_RESERVE_OWNER_ID || linked === WATAFAST_RESERVE_OWNER_ID) return true;

  const members = [userId, WATAFAST_RESERVE_EVERYONE, ...(linked !== null && linked !== userId ? [linked] : [])];
  try {
    const flags = await store.smismember(WATAFAST_RESERVE_USERS_KEY, members);
    return flags.some((flag) => Number(flag) === 1);
  } catch (err) {
    console.warn(`[watafast-reserve-gate] ${WATAFAST_RESERVE_USERS_KEY} read failed; no reserve for this request:`, err instanceof Error ? err.message : "error");
    return false;
  }
}
