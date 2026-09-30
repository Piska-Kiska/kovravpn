// src/lib/hy2-access.ts
//
// Who may connect to a Kovra Hysteria2 location (POST /api/hy2/auth).
//
// ── The decision ────────────────────────────────────────
// Exactly the one the subscription link and the panel-less nodes use
// (lib/device-capacity.ts through node-uuids-body.ts accessPairs): a device
// may connect while it holds a running slot. A device of a user whose plan
// ended, a device paused because the user has more devices than slots, a
// deleted device (it is no longer in `profiles:<id>`) and a UUID nobody owns
// are all refused. Before 30.09.2026 the route only checked that
// `hy2:<uuid>` existed, a key written at creation and never tied to a plan,
// so every device ever created kept Hysteria2 access for good.
//
// The HWID rule of the subscription link (one link, one device) does not
// apply: Hysteria2 authenticates with the password alone and never sees a
// device id. The password is the device UUID, so it is exactly as strong a
// secret as the VLESS UUID of the same device.
//
// ── Cost ────────────────────────────────────────────────
// No Redis reads per connect: the list comes from readNodeUuidPairs (one
// rebuild per REBUILD_EVERY_MS per instance, shared by concurrent callers),
// indexed here once per rebuild into a Map, so a connect is an O(1) lookup.
// A purchase, a pause or a deletion reaches Hysteria2 within that minute.
//
// ── When Redis fails ────────────────────────────────────
// The last list that was read successfully keeps answering for
// STALE_IF_ERROR_MS, so a Redis blip does not throw every paying user off at
// their next reconnect (the panel-less nodes keep their list the same way).
// After that, or with no list at all, every connect is refused: fail closed.
//
// Nothing here logs a UUID.

import { readNodeUuidPairs, type NodeUuidPairsRead } from "./node-uuids";
import { normalizeUuid, type UuidPair } from "./node-uuids-body";

/** How long the last good list may answer while Redis cannot be read. */
export const STALE_IF_ERROR_MS = 5 * 60_000;

export type Hy2Refusal = "malformed" | "unknown" | "inactive" | "unavailable";

export type Hy2Verdict = { ok: true; id: string } | { ok: false; reason: Hy2Refusal };

/** UUID -> the end of the slot it holds (a past date: it held one, it does not now). O(n). */
export function indexPairs(pairs: readonly UuidPair[]): Map<string, number> {
  const byUuid = new Map<string, number>();
  for (const p of pairs) {
    const uuid = normalizeUuid(p.uuid);
    if (uuid === null || !Number.isFinite(p.until)) continue;
    byUuid.set(uuid, Math.max(byUuid.get(uuid) ?? Number.NEGATIVE_INFINITY, p.until));
  }
  return byUuid;
}

/** The pure decision for one password against an index. O(1). */
export function decideHy2(auth: unknown, byUuid: ReadonlyMap<string, number>, now: number): Hy2Verdict {
  const uuid = normalizeUuid(auth);
  if (uuid === null) return { ok: false, reason: "malformed" };
  const until = byUuid.get(uuid);
  if (until === undefined) return { ok: false, reason: "unknown" };
  if (until <= now) return { ok: false, reason: "inactive" };
  return { ok: true, id: uuid };
}

export interface Hy2AccessDeps {
  readPairs(now: number): Promise<NodeUuidPairsRead>;
}

export type Hy2Access = (auth: unknown, now?: number) => Promise<Hy2Verdict>;

/**
 * An access check with its own copy of the last good index. The app uses the
 * one below; tests build their own with fake storage.
 */
export function createHy2Access(deps: Hy2AccessDeps): Hy2Access {
  /** The index of the last successful read, and when it was read. */
  let index: { pairs: readonly UuidPair[]; byUuid: Map<string, number>; readAt: number } | null = null;

  return async function hy2Access(auth: unknown, now: number = Date.now()): Promise<Hy2Verdict> {
    // A malformed password never costs a storage read.
    if (normalizeUuid(auth) === null) return { ok: false, reason: "malformed" };

    let byUuid: ReadonlyMap<string, number>;
    try {
      const { pairs } = await deps.readPairs(now);
      if (index === null || index.pairs !== pairs) {
        index = { pairs, byUuid: indexPairs(pairs), readAt: now };
      } else {
        index.readAt = now;
      }
      byUuid = index.byUuid;
    } catch (err) {
      const last = index;
      const stale = last !== null && now - last.readAt >= 0 && now - last.readAt < STALE_IF_ERROR_MS;
      console.error(
        `[hy2/auth] access list unreadable (${stale ? "answering from the last list" : "refusing"}):`,
        err instanceof Error ? err.message : err,
      );
      if (!stale || last === null) return { ok: false, reason: "unavailable" };
      byUuid = last.byUuid;
    }
    return decideHy2(auth, byUuid, now);
  };
}

/**
 * Whether the device with this password may connect now. Never throws: a
 * storage failure beyond STALE_IF_ERROR_MS is a refusal ("unavailable").
 */
export const hy2Access: Hy2Access = createHy2Access({ readPairs: readNodeUuidPairs });
