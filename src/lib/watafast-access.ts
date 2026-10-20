// src/lib/watafast-access.ts
//
// What the two routes of the app's own endpoint decide the same way, in one
// place so they cannot drift apart:
//
//   GET /api/watafast/v1/<token>                    the signed manifest
//   GET /api/watafast/v1/<token>/credential/<key>   a credential for the reserve
//
// Whether a link may connect, and for which device, is lib/sub-access.ts's
// answer, the one /api/sub gives: this module only reads it the way the
// manifest contract needs it. Which reserve nodes an account is given, and
// whether this deployment can issue credentials at all, are decided here.
//
// A credential must never go to a link whose manifest would say "not
// active", nor to one whose manifest names no reserve node: both routes ask
// here, and the answer is one.

import type { UserRecord, VpnProfile } from "./accounts";
import type { SubAccess } from "./sub-access";
import type { StubKind } from "./sub-notices";
import { idKeyFromEnv, issuerKeyFromEnv, rateLimitFromEnv } from "./watafast-credential";
import { reserveNodesFromEnv, reserveOrderFor, type ManifestReserveNode } from "./watafast-reserve";
import { watafastReserveForUser, type ReserveGateStore } from "./watafast-reserve-gate";

/** An environment, as `process.env` is one. */
export type WatafastEnv = Readonly<Record<string, string | undefined>>;

/** A link's access, as the manifest contract reads it. */
export type LinkAccess =
  /** Unknown, malformed or deleted: a final 404. */
  | { readonly kind: "not_found" }
  /** Bound to another device: 403. */
  | { readonly kind: "second_device" }
  /** The link is real and its account may not connect now: a signed "not active". */
  | { readonly kind: "closed"; readonly refusal: Extract<StubKind, "no-plan" | "paused"> }
  /** The account may connect, as this device. */
  | { readonly kind: "open"; readonly userId: string; readonly device: VpnProfile };

/**
 * `access` as the manifest reads it. A per-device link names its device; the
 * legacy whole-account link has no single device, so it speaks for the first
 * device that holds a slot, as /api/sub's xray format does for the same
 * reason (one config, one uuid).
 */
export function linkAccessOf(access: SubAccess): LinkAccess {
  switch (access.kind) {
    case "invalid":
    case "not-found":
    case "deleted":
      return { kind: "not_found" };
    case "second-device":
      return { kind: "second_device" };
    case "no-plan":
    case "paused":
      return { kind: "closed", refusal: access.kind };
    case "device":
      return { kind: "open", userId: access.userId, device: access.profile };
    case "account":
      return { kind: "open", userId: access.userId, device: access.profiles[0] };
  }
}

/**
 * Whether this deployment can issue a credential at all: the issuer key and
 * the id key read, and the speed cap, when set, is a number. A node is of no
 * use to a device that cannot be given a credential for it, and a manifest
 * that named one would send the app to a route that can only refuse.
 */
export function credentialsCanBeIssued(env: WatafastEnv): boolean {
  return (
    issuerKeyFromEnv(env["WATAFAST_ISSUER_KEY"]).ok &&
    idKeyFromEnv(env["WATAFAST_ID_KEY"]).ok &&
    rateLimitFromEnv(env["WATAFAST_RESERVE_RATE_KBPS"]) !== null
  );
}

/** Said once per process: the endpoints are asked all day, and one line is enough to send the owner to the variable. */
let warnedAboutReserveNodes = false;
let warnedAboutCredentialSettings = false;

/**
 * The reserve nodes this deployment offers anyone: none without the setting,
 * none when a credential cannot be issued. Reads only the environment.
 */
export function offeredReserveNodes(env: WatafastEnv): ManifestReserveNode[] {
  const settings = reserveNodesFromEnv(env["WATAFAST_RESERVE_NODES"]);
  if (settings.ignored > 0 && !warnedAboutReserveNodes) {
    warnedAboutReserveNodes = true;
    // A count, never the entries: an address, a path and a key are in them.
    console.warn(`[watafast-reserve] ${settings.ignored} entries of WATAFAST_RESERVE_NODES do not read and were left out`);
  }
  if (settings.nodes.length === 0) return [];
  if (!credentialsCanBeIssued(env)) {
    if (!warnedAboutCredentialSettings) {
      warnedAboutCredentialSettings = true;
      // Which setting, never a value: the route that issues says the reason.
      console.warn("[watafast-reserve] WATAFAST_RESERVE_NODES is set, but a credential cannot be issued; no reserve is named");
    }
    return [];
  }
  return settings.nodes;
}

export interface ReserveDeps {
  readonly store: ReserveGateStore;
  /** The account's record (lib/accounts.ts getUserRecord). */
  readonly userOf: (userId: string) => Promise<UserRecord | null>;
  readonly env: WatafastEnv;
}

/**
 * The reserve nodes this account's device is given, in the order that device
 * is to try them; empty when the deployment offers none or the account is not
 * (yet) given the reserve (lib/watafast-reserve-gate.ts). A deployment
 * without the settings never reads Redis here. Never throws.
 */
export async function reserveNodesForAccount(userId: string, deviceUuid: string, deps: ReserveDeps): Promise<ManifestReserveNode[]> {
  const nodes = offeredReserveNodes(deps.env);
  if (nodes.length === 0) return [];
  let user: UserRecord | null;
  try {
    user = await deps.userOf(userId);
  } catch (err) {
    console.warn("[watafast-reserve] user record not read; deciding by the userId alone:", err instanceof Error ? err.message : "error");
    user = null;
  }
  if (!(await watafastReserveForUser(deps.store, userId, user))) return [];
  return reserveOrderFor(nodes, deviceUuid);
}
