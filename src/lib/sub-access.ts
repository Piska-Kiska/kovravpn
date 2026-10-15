// src/lib/sub-access.ts
//
// Whether a subscription token may get servers right now, and for which
// devices. One decision for every feed of a token: /api/sub/<token> (the
// link people paste) and /api/sub/<token>/vless (the plain base64 feed of
// the paused Happ encrypted-link flow). Before 30.09.2026 the /vless feed
// skipped all of it (KS-5): appending "/vless" to any link got real servers
// on any number of devices, for an expired plan or a paused device too.
//
// In order:
//   1. a token shorter than 8 chars is invalid (403);
//   2. a token its owner deleted gets the "removed" notice;
//   3. the token must exist: `sub_prof:<token>` (one device, the current
//      model) or `sub_token:<token>` (the legacy per-account link);
//   4. HWID binding, one link = one device: an app that sends x-hwid binds
//      the link on its first fetch, and another device's x-hwid gets the
//      "device limit" notice. Apps that send no x-hwid pass unbound. The
//      binding is written only for a token that exists (step 3), so random
//      tokens no longer leave year-long keys behind;
//   5. the account and the device must exist (404 otherwise);
//   6. no running slot at all: the "no active plan" notice;
//   7. the device holds no slot (more devices than slots, KM-03): the
//      "paused" notice. The legacy link serves only the devices that do.
//
// Redis reads: sub_deleted, sub_prof and sub_token in one MGET; then the
// binding, account, profiles and subs at once. Two round trips instead of six
// or seven in a row (optimization review 15.10.2026); the verdicts still come
// in the order above, each awaiting only its own read, so a failed read
// throws only where it threw before. A refused fetch may have read subs it
// did not need: one command, never a different answer.

import { redis } from "./redis";
import { getAccount, getProfiles, type VpnProfile } from "./accounts";
import { getSubscriptions, activeSlots } from "./subscriptions";
import { deviceAccess } from "./device-capacity";

/** How long an HWID binding holds; resetting the device clears it sooner. */
export const HWID_BINDING_TTL_SEC = 60 * 60 * 24 * 365;

export type SubRefusal =
  | { kind: "invalid" }
  | { kind: "not-found"; message: string }
  | { kind: "deleted" }
  | { kind: "second-device" }
  | { kind: "no-plan" }
  | { kind: "paused" };

export type SubGrant =
  /** A per-device link (`sub_prof:`): this device, until the end of its slot. */
  | { kind: "device"; userId: string; profile: VpnProfile; expireSec: number }
  /** A legacy per-account link (`sub_token:`): the devices that hold a slot. */
  | { kind: "account"; userId: string; profiles: VpnProfile[]; expireSec: number };

export type SubAccess = SubRefusal | SubGrant;

export function isSubGrant(a: SubAccess): a is SubGrant {
  return a.kind === "device" || a.kind === "account";
}

type TokenOwner = { kind: "device"; userId: string; uuid: string } | { kind: "account"; userId: string };

/** The deleted-link marker and the token's owner, from one MGET. */
async function tokenKeys(token: string): Promise<{ deleted: boolean; owner: TokenOwner | null }> {
  const [deleted, prof, legacyUserId] = await redis.mget<[unknown, unknown, unknown]>(
    `sub_deleted:${token}`,
    `sub_prof:${token}`,
    `sub_token:${token}`,
  );
  if (deleted) return { deleted: true, owner: null };
  if (prof) {
    const { userId, uuid } =
      typeof prof === "string" ? (JSON.parse(prof) as { userId: string; uuid: string }) : (prof as { userId: string; uuid: string });
    return { deleted: false, owner: { kind: "device", userId, uuid } };
  }
  if (!legacyUserId || typeof legacyUserId !== "string") return { deleted: false, owner: null };
  return { deleted: false, owner: { kind: "account", userId: legacyUserId } };
}

/** Starts a read now; its failure waits for the place that awaits it. */
function early<T>(read: () => Promise<T>): Promise<T> {
  const pending = Promise.resolve().then(read);
  pending.catch(() => {});
  return pending;
}

/**
 * The decision for one fetch of a subscription token (see the header).
 * `hwid` is the x-hwid request header, or null/empty when the app sent none.
 * Throws only when Redis fails or a stored record is corrupt.
 */
export async function resolveSubAccess(token: string, hwid: string | null, now: number = Date.now()): Promise<SubAccess> {
  if (!token || token.length < 8) return { kind: "invalid" };

  // Deleted-subscription notice (set by removeProfile), then the owner.
  const { deleted, owner } = await tokenKeys(token);
  if (deleted) return { kind: "deleted" };
  if (!owner) return { kind: "not-found", message: "Token not found" };

  const device = (hwid ?? "").trim();
  const hwidKey = `sub:${token}:hwid`;
  const boundRead = device ? early(() => redis.get(hwidKey)) : null;
  const accountRead = early(() => getAccount(owner.userId));
  const profilesRead = early(() => getProfiles(owner.userId));
  const subsRead = early(() => getSubscriptions(owner.userId));

  if (boundRead) {
    const bound = await boundRead;
    if (bound && bound !== device) return { kind: "second-device" };
    if (!bound) await redis.set(hwidKey, device, { ex: HWID_BINDING_TTL_SEC });
  }

  const account = await accountRead;
  if (!account) return { kind: "not-found", message: "Account not found" };

  const profiles = await profilesRead;
  if (owner.kind === "device") {
    const index = profiles.findIndex((p) => p.uuid === owner.uuid);
    if (index < 0) return { kind: "not-found", message: "Profile not found" };
    const subs = await subsRead;
    if (activeSlots(subs, now) <= 0) return { kind: "no-plan" };
    const access = deviceAccess(profiles, subs, now)[index];
    if (access.state !== "active") return { kind: "paused" };
    return { kind: "device", userId: owner.userId, profile: profiles[index], expireSec: Math.floor(access.until / 1000) };
  }

  if (profiles.length === 0) return { kind: "not-found", message: "No profiles" };
  const subs = await subsRead;
  if (activeSlots(subs, now) <= 0) return { kind: "no-plan" };
  // The legacy link serves every device of the account: only those that hold
  // a slot (KM-03).
  const access = deviceAccess(profiles, subs, now);
  const served = profiles.filter((_, i) => access[i].state === "active");
  if (served.length === 0) return { kind: "paused" };
  const expireSec = Math.floor(Math.max(...access.map((a) => a.until)) / 1000);
  return { kind: "account", userId: owner.userId, profiles: served, expireSec };
}
