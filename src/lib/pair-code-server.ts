// src/lib/pair-code-server.ts
//
// Issuing a "code for the app" for one device, and what a redeemed code
// leaves behind. Ported from the ProxysVPN site's module of the same name;
// Kovra has one link shape, so the language-dependent domain is gone.
//
// The link is never taken from a client. It is the device's own subscription
// link: its subToken (a legacy device gets one here, as the reset route does)
// on the plain feed `https://kovravpn.com/api/sub/<token>` (lib/sub-token-
// lookup.ts plainSubUrl). Never the encrypted `/p/` page that getSubUrl may
// give: the app reads the feed itself.
//
// Steps: the account id, the shape of the device id, the device among the
// account's own, and the code itself (lib/pair-code.ts: limit, generate,
// store). Every dependency is injectable; `sitePairCodeDeps()` is the
// production wiring.

import { ensureProfileSubToken, getProfiles } from "./accounts";
import {
  createRedisPairCodeStore,
  issuePairCode,
  type PairCodeDeps,
  type PairCodeIssueResult,
  type PairCodeStore,
} from "./pair-code";
import { rateLimit } from "./ratelimit";
import { redis } from "./redis";
import { claimedHwidKey } from "./sub-access";
import { plainSubUrl } from "./sub-token-lookup";

/** A device as the lookup needs it. */
export interface PairCodeDevice {
  readonly uuid: string;
  readonly subToken?: string;
}

export interface DeviceIssueDeps {
  /** The account's own devices (lib/accounts.ts getProfiles). */
  readonly devices: (userId: string) => Promise<readonly PairCodeDevice[]>;
  /** lib/accounts.ts ensureProfileSubToken: a legacy device gets its token here. */
  readonly ensureToken: (userId: string, uuid: string) => Promise<string>;
  /** Store, limiter, clock and logger of lib/pair-code.ts. */
  readonly core: PairCodeDeps;
}

export interface DeviceIssueInput {
  readonly userId: string;
  readonly deviceId: string;
}

export type DeviceIssueResult =
  | PairCodeIssueResult
  /** Not a device of this account. */
  | { readonly ok: false; readonly reason: "not_found" };

const UUID_SHAPE = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Issue a code for one of the account's own devices. Refusals resolve; a
 * Redis failure rejects and the caller answers "try again".
 */
export async function issuePairCodeForDevice(input: DeviceIssueInput, deps: DeviceIssueDeps = sitePairCodeDeps()): Promise<DeviceIssueResult> {
  if (input === null || typeof input !== "object") return { ok: false, reason: "bad_input" };
  const { userId, deviceId } = input;
  if (typeof userId !== "string" || userId === "") return { ok: false, reason: "bad_input" };
  if (typeof deviceId !== "string" || !UUID_SHAPE.test(deviceId)) return { ok: false, reason: "bad_input" };

  const device = (await deps.devices(userId)).find((d) => d.uuid === deviceId);
  if (device === undefined) return { ok: false, reason: "not_found" };

  const token = typeof device.subToken === "string" && device.subToken !== "" ? device.subToken : await deps.ensureToken(userId, deviceId);
  return issuePairCode(deps.core, { userId, deviceId, subUrl: plainSubUrl(token) });
}

let siteStore: PairCodeStore | null = null;

/** The codes in the site's Redis. */
export function sitePairCodeStore(): PairCodeStore {
  if (siteStore === null) {
    siteStore = createRedisPairCodeStore({
      set: (key, value, opts) => redis.set(key, value, opts),
      eval: (script, keys, args) => redis.eval(script, keys, args),
    });
  }
  return siteStore;
}

/** Production wiring: Upstash and lib/ratelimit.ts. */
export function sitePairCodeDeps(): DeviceIssueDeps {
  return {
    devices: (userId) => getProfiles(userId),
    ensureToken: (userId, uuid) => ensureProfileSubToken(userId, uuid),
    core: { store: sitePairCodeStore(), limit: rateLimit },
  };
}

/**
 * How long a redeemed code lets our app take the link: the app fetches its
 * subscription seconds after the code is accepted; ten minutes cover a ladder
 * of names and a retry.
 */
export const CLAIMED_HWID_TTL_S = 60 * 10;

/**
 * The note by which our app takes the link `token` (lib/sub-access.ts
 * `claimedHwidKey` tells who may use it and how). Nothing moves here: the
 * app's device id is not known yet, since its pairing request sends none.
 * Rejects on a Redis failure; the caller decides what a lost note means.
 */
export async function claimHwidForOwnApp(token: string): Promise<void> {
  await redis.set(claimedHwidKey(token), "1", { ex: CLAIMED_HWID_TTL_S });
}

export interface LinkHandoverDeps {
  /** The account's own devices (lib/accounts.ts getProfiles). */
  readonly devices: (userId: string) => Promise<readonly PairCodeDevice[]>;
  /** `claimHwidForOwnApp`. */
  readonly claim: (token: string) => Promise<void>;
}

/** Production wiring of `handLinkToOwnApp`. */
export function siteLinkHandoverDeps(): LinkHandoverDeps {
  return { devices: (userId) => getProfiles(userId), claim: claimHwidForOwnApp };
}

/**
 * A code of `deviceId` has just been redeemed: let our app take that device's
 * link from whichever app holds it.
 *
 * What this costs: whoever is given a fresh code can take the link with it,
 * where the binding used to stop them. A code is issued only in its owner's
 * cabinet, typed by hand, lives ten minutes and works once.
 *
 * The link is found the way the code was issued - by the account and the
 * device the code's record names, never by anything the redeeming request
 * said. Returns whether the note was written: false for a device that is gone
 * or has no link yet (nothing to take). A Redis failure rejects; the route
 * still answers with the link, and the app is then told the link is taken,
 * as it would be without this.
 */
export async function handLinkToOwnApp(userId: string, deviceId: string, deps: LinkHandoverDeps = siteLinkHandoverDeps()): Promise<boolean> {
  if (typeof userId !== "string" || userId === "" || typeof deviceId !== "string" || !UUID_SHAPE.test(deviceId)) return false;
  const device = (await deps.devices(userId)).find((d) => d.uuid === deviceId);
  const token = device?.subToken;
  if (typeof token !== "string" || token === "") return false;
  await deps.claim(token);
  return true;
}
