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
// Only device records decide. The PRO nodes' list also carries a reserve of
// UUIDs that belong to no device yet (lib/uuid-pool.ts), dated ahead so a new
// device works there at once; Hysteria2 never sees them: it reads the device
// view (node-uuids.ts readDevicePairs), which never touches the reserve, so a
// reserve UUID is "unknown" here until a device record holds it.
//
// ── Cost ────────────────────────────────────────────────
// No Redis reads per connect: the list comes from readDevicePairs (one
// rebuild per REBUILD_EVERY_MS per instance, shared by concurrent callers),
// indexed here once per rebuild into a Map, so a connect is an O(1) lookup.
// A purchase, a pause or a deletion reaches Hysteria2 within that minute.
//
// ── When Redis fails or hangs ───────────────────────────
// Hysteria2 waits about 10 s for this answer and then refuses the client, and
// the Upstash REST client has no request timeout of its own (it retries for
// seconds, and a hung socket waits much longer). So a read that has not
// answered within READ_TIMEOUT_MS counts as a failure, exactly like an error:
// the last list that was read successfully keeps answering while it is
// younger than STALE_IF_ERROR_MS (counted from when it was READ, not from
// when it was last used), so a Redis blip does not throw every paying user
// off at their next reconnect (the panel-less nodes keep their list the same
// way). After a failure no new read is tried for RETRY_AFTER_FAILURE_MS, so a
// wave of connects answers at once from that list instead of each waiting
// for the timeout again. A read that answers after its timeout still updates
// the list. With no list young enough, every connect is refused: fail closed.
//
// Nothing here logs a UUID, nor the command an Upstash error quotes (its
// keys are `profiles:<user id>`, and a user id can be an e-mail): errors go
// through safe-error-text.ts.

import { readDevicePairs, type DevicePairsRead } from "./node-uuids";
import { normalizeUuid, type UuidPair } from "./node-uuids-body";
import { safeErrorText } from "./safe-error-text";

/** How long the last good list may answer while Redis cannot be read, from when it was read. */
export const STALE_IF_ERROR_MS = 5 * 60_000;
/** How long a connect waits for the list before it answers from the last one. */
export const READ_TIMEOUT_MS = 1_500;
/** After a failed or timed-out read, how long connects answer from the last list without trying again. */
export const RETRY_AFTER_FAILURE_MS = 15_000;

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

/**
 * A device read and nothing more: `reserve?: never` makes the compiler refuse
 * a read that carries the reserve (node-uuids.ts readNodeUuidPairs).
 */
export type DevicesOnlyRead = DevicePairsRead & { readonly reserve?: never };

export interface Hy2AccessDeps {
  /** The devices alone (never the UUID reserve), with the time they were read. */
  readPairs(now: number): Promise<DevicesOnlyRead>;
  /** Overrides READ_TIMEOUT_MS (tests). */
  readTimeoutMs?: number;
}

export type Hy2Access = (auth: unknown, now?: number) => Promise<Hy2Verdict>;

class ReadTimeout extends Error {
  constructor(ms: number) {
    super(`no answer within ${ms} ms`);
    this.name = "ReadTimeout";
  }
}

/** Resolves with the read, or rejects with ReadTimeout after `ms`; the timer never outlives the race. */
function within<T>(read: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ReadTimeout(ms)), ms);
  });
  return Promise.race([read, timeout]).finally(() => clearTimeout(timer));
}

/**
 * An access check with its own copy of the last good index. The app uses the
 * one below; tests build their own with fake storage.
 */
export function createHy2Access(deps: Hy2AccessDeps): Hy2Access {
  const timeoutMs = deps.readTimeoutMs ?? READ_TIMEOUT_MS;
  /** The index of the newest successful read, and when that read hit Redis. */
  let index: { pairs: readonly UuidPair[]; byUuid: Map<string, number>; readAt: number } | null = null;
  /** No read is tried before this moment (set by a failed or timed-out read). */
  let retryAt = Number.NEGATIVE_INFINITY;

  /** Takes a successful read unless the index already holds a newer one. Indexes only a new list. */
  const adopt = (read: DevicePairsRead): void => {
    if (index !== null && read.at < index.readAt) return;
    const byUuid = index !== null && index.pairs === read.pairs ? index.byUuid : indexPairs(read.pairs);
    index = { pairs: read.pairs, byUuid, readAt: read.at };
    retryAt = Number.NEGATIVE_INFINITY;
  };

  return async function hy2Access(auth: unknown, now: number = Date.now()): Promise<Hy2Verdict> {
    // A malformed password never costs a storage read.
    if (normalizeUuid(auth) === null) return { ok: false, reason: "malformed" };

    let fresh = false;
    if (now >= retryAt) {
      let read: Promise<DevicePairsRead> | null = null;
      try {
        read = deps.readPairs(now);
        adopt(await within(read, timeoutMs));
        fresh = true;
      } catch (err) {
        retryAt = now + RETRY_AFTER_FAILURE_MS;
        // A read that answers late still brings the list up to date.
        if (err instanceof ReadTimeout && read !== null) read.then(adopt, () => undefined);
        const last = index;
        const age = last === null ? Number.NaN : now - last.readAt;
        const usable = age >= 0 && age < STALE_IF_ERROR_MS;
        console.error(
          `[hy2/auth] access list unreadable (${usable ? "answering from the last list" : "refusing"}; next try in ${RETRY_AFTER_FAILURE_MS / 1000} s):`,
          safeErrorText(err),
        );
      }
    }

    const last = index;
    if (last === null) return { ok: false, reason: "unavailable" };
    if (!fresh) {
      const age = now - last.readAt;
      if (!(age >= 0 && age < STALE_IF_ERROR_MS)) return { ok: false, reason: "unavailable" };
    }
    return decideHy2(auth, last.byUuid, now);
  };
}

/**
 * Whether the device with this password may connect now. Never throws and
 * answers within about READ_TIMEOUT_MS: a storage failure or hang beyond
 * STALE_IF_ERROR_MS is a refusal ("unavailable").
 */
export const hy2Access: Hy2Access = createHy2Access({ readPairs: readDevicePairs });
