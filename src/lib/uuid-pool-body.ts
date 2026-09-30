// src/lib/uuid-pool-body.ts
//
// The reserve of device UUIDs, without I/O: the Redis scripts, their
// arguments and replies, and the lines the reserve adds to
// GET /api/internal/node-uuids. The I/O is lib/uuid-pool.ts.
//
// ── Why ─────────────────────────────────────────────────
// Germany, Britain and the USA are 3X-UI panels: /api/vpn/create writes the
// new device there and it works at once. The PRO nodes (pl, ru, fi, se, kz,
// tr) have no panel: an agent pulls the node-uuids list every 120 s, and the
// site caches that list up to 60 s per instance, so a device with a fresh
// UUID reached them only after up to ~3 minutes. Polling faster is not an
// option (Vercel's DDoS mitigation blocked node polling before).
//
// So the site keeps a reserve of random UUIDs that no one holds yet and lists
// them for the nodes in advance, dated 48 h ahead. A new device takes the
// oldest of them: every PRO node already lets it in. Nobody knows a reserve
// UUID (never shown, never in a subscription), so while unassigned it opens
// the door for no one.
//
// ── Three sorted sets (member = UUID, score = ms) ───────
//   ready    the reserve; score = when it was added. Taken only after
//            POOL_MIN_AGE_MS: by then every instance's cached list and every
//            node's poll have seen it.
//   taken    handed to a device; score = when. Listed like the reserve until
//            the device record is visible (then the device's own date and
//            slot decide, paused included: lib/device-capacity.ts), and the
//            mark is dropped. A mark whose device never appeared (creation
//            failed after the take) is listed with a PAST date after
//            TAKEN_GRACE_MS, so the nodes remove it by the clock.
//   retired  rotated out of the reserve (older than POOL_MAX_AGE_MS, or over
//            a lowered cap); score = when. Listed with that PAST date for the
//            window the node answer keeps expired lines, then forgotten.
//
// Past dates, not missing lines: an agent refuses a list that DROPS more than
// max(10, 25 %) of its live users, but a line whose date passed is an
// expiry, removed by the clock and never counted as a drop. Rotation is also
// capped at POOL_ROTATE_PER_BUILD per build.
//
// ── Atomicity ───────────────────────────────────────────
// TAKE_LUA moves one UUID from `ready` to `taken` in one script: no two
// devices get the same UUID, and there is no instant when the UUID is in
// neither set. The list builder reads both sets in one script (MAINTAIN_LUA)
// BEFORE it reads the profiles, and /api/vpn/create drops the taken mark only
// AFTER it wrote the profile, so every build sees the UUID in the reserve,
// as taken, or in the device record: it never leaves the list in between.
//
// Pure: imports only node-uuids-body.ts (for the UUID rules and the answer
// window), so tests load it under Node's type stripping.

import { NODE_BODY_WINDOW_MS, normalizeUuid, type UuidPair } from "./node-uuids-body";

export const POOL_READY_KEY = "kovra:uuidpool:ready";
export const POOL_TAKEN_KEY = "kovra:uuidpool:taken";
export const POOL_RETIRED_KEY = "kovra:uuidpool:retired";

/**
 * Reserve size unless KOVRA_UUID_POOL_SIZE says otherwise; 0 turns the
 * reserve off. 10, the agents' refusal floor (REFUSE_FLOOR): a site that
 * suddenly stops listing the reserve (a rollback of this code) drops at most
 * 10 live users at once, which the agents still accept. Above 10, set it to 0
 * and let the reserve drain (a few minutes) before such a rollback.
 */
export const POOL_SIZE_DEFAULT = 10;
export const POOL_SIZE_MAX = 100;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * A reserve UUID is handed out only this long after it was added: the list
 * cache (60 s) plus the agents' poll (120 s) plus a pass, with room for a
 * failed poll or two.
 */
export const POOL_MIN_AGE_MS = 10 * MINUTE_MS;
/** A reserve UUID older than this is rotated out. */
export const POOL_MAX_AGE_MS = 7 * 24 * HOUR_MS;
/** At most this many reserve UUIDs are retired per list build. */
export const POOL_ROTATE_PER_BUILD = 2;
/** Reserve lines are dated this far ahead (from the start of the current hour). */
export const POOL_LINE_AHEAD_MS = 48 * HOUR_MS;
/** A taken UUID with no visible device record is kept alive this long. */
export const TAKEN_GRACE_MS = 10 * MINUTE_MS;
/** Marks are forgotten this long after their lines have left the answer. */
const FORGET_MARGIN_MS = HOUR_MS;

/**
 * The configured reserve size (KOVRA_UUID_POOL_SIZE): 0..POOL_SIZE_MAX; unset
 * or not a whole number gives the default. 0 = off: nothing is handed out,
 * nothing added, and what is left is retired a few per build.
 */
export function uuidPoolSize(raw: string | undefined): number {
  const text = (raw ?? "").trim();
  if (!/^[0-9]{1,6}$/.test(text)) return POOL_SIZE_DEFAULT;
  return Math.min(Number(text), POOL_SIZE_MAX);
}

/**
 * The date of a reserve line: 48 h after the start of the current hour. Not
 * `now + 48 h`, so the answer (and its ETag) changes once an hour, not on
 * every build, and the agents keep getting 304.
 */
export function poolLineUntil(now: number): number {
  return Math.floor(now / HOUR_MS) * HOUR_MS + POOL_LINE_AHEAD_MS;
}

// ── Taking a UUID ───────────────────────────────────────

/**
 * KEYS: ready, taken. ARGV: now, the latest added-at a UUID may have to be
 * handed out. The oldest ready UUID (the one surely on every node) moves to
 * `taken`. Reply {'ok', uuid} or {'none'}.
 */
export const TAKE_LUA = `
local got = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[2], 'LIMIT', 0, 1)
if #got == 0 then return {'none'} end
redis.call('ZREM', KEYS[1], got[1])
redis.call('ZADD', KEYS[2], ARGV[1], got[1])
return {'ok', got[1]}
`;

export function takeKeys(): string[] {
  return [POOL_READY_KEY, POOL_TAKEN_KEY];
}

export function takeArgs(now: number): string[] {
  return [String(Math.floor(now)), String(Math.floor(now - POOL_MIN_AGE_MS))];
}

/** The taken UUID, or null when no ready UUID was old enough. Throws on any other reply. */
export function parseTakeReply(reply: unknown): string | null {
  if (!Array.isArray(reply) || reply.length === 0) throw new Error("uuid pool: take reply is not a list");
  if (reply[0] === "none" && reply.length === 1) return null;
  if (reply[0] === "ok" && reply.length === 2) {
    const uuid = normalizeUuid(reply[1]);
    if (uuid !== null) return uuid;
  }
  throw new Error("uuid pool: unexpected take reply");
}

// ── Keeping the reserve (on every list build) ───────────

/**
 * KEYS: ready, taken, retired. ARGV: now, cap, rotate-at-or-before,
 * rotation budget, forget-taken-at-or-before, forget-retired-at-or-before,
 * then fresh UUIDs to add. One script, so the cap holds under concurrent
 * builds and the three sets are read at one instant:
 *   1. retire ready UUIDs added at or before the rotation date, oldest
 *      first, within the budget;
 *   2. if the reserve is over the cap (it was lowered), retire the newest
 *      (least likely to be on the nodes yet) with what is left of the budget;
 *   3. forget taken and retired marks whose lines have left the answer;
 *   4. add fresh UUIDs up to the cap;
 *   5. reply {'pool', added, retired, n, (uuid, score) x n} for ready, then
 *      taken, then retired, all as strings.
 */
export const MAINTAIN_LUA = `
local now, cap, budget = ARGV[1], tonumber(ARGV[2]), tonumber(ARGV[4])
local rotated = 0
local function retire(list)
  for i = 1, #list do
    redis.call('ZREM', KEYS[1], list[i])
    redis.call('ZADD', KEYS[3], now, list[i])
    rotated = rotated + 1
  end
end
if budget > 0 then
  retire(redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[3], 'LIMIT', 0, budget))
end
local over = redis.call('ZCARD', KEYS[1]) - cap
if over > 0 and rotated < budget then
  local n = math.min(over, budget - rotated)
  retire(redis.call('ZRANGE', KEYS[1], -n, -1))
end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[5])
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[6])
local added = 0
local need = cap - redis.call('ZCARD', KEYS[1])
for i = 7, #ARGV do
  if added >= need then break end
  added = added + redis.call('ZADD', KEYS[1], 'NX', now, ARGV[i])
end
local out = {'pool', tostring(added), tostring(rotated)}
for k = 1, 3 do
  local all = redis.call('ZRANGE', KEYS[k], 0, -1, 'WITHSCORES')
  out[#out + 1] = tostring(math.floor(#all / 2))
  for j = 1, #all do out[#out + 1] = all[j] end
end
return out
`;

export function maintainKeys(): string[] {
  return [POOL_READY_KEY, POOL_TAKEN_KEY, POOL_RETIRED_KEY];
}

export function maintainArgs(now: number, cap: number, fresh: readonly string[]): string[] {
  const t = Math.floor(now);
  return [
    String(t),
    String(cap),
    String(t - POOL_MAX_AGE_MS),
    String(POOL_ROTATE_PER_BUILD),
    String(t - TAKEN_GRACE_MS - NODE_BODY_WINDOW_MS - FORGET_MARGIN_MS),
    String(t - NODE_BODY_WINDOW_MS - FORGET_MARGIN_MS),
    ...fresh,
  ];
}

export interface PoolEntry {
  readonly uuid: string;
  /** ms: added (ready), taken (taken), retired (retired). */
  readonly at: number;
}

export interface PoolState {
  readonly ready: readonly PoolEntry[];
  readonly taken: readonly PoolEntry[];
  readonly retired: readonly PoolEntry[];
  /** UUIDs added by this build. */
  readonly added: number;
  /** UUIDs retired by this build. */
  readonly rotated: number;
  /** Members that were not a UUID or had no usable score; skipped. */
  readonly malformed: number;
}

/** Upstash parses numeric strings into numbers; accept both. */
function wholeNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isSafeInteger(n) ? n : null;
}

/** MAINTAIN_LUA's reply. Throws when its shape is not the script's. O(n). */
export function parseMaintainReply(reply: unknown): PoolState {
  if (!Array.isArray(reply) || reply[0] !== "pool") throw new Error("uuid pool: maintain reply is not the script's");
  const added = wholeNumber(reply[1]);
  const rotated = wholeNumber(reply[2]);
  if (added === null || added < 0 || rotated === null || rotated < 0) throw new Error("uuid pool: bad counters");
  let pos = 3;
  let malformed = 0;
  const section = (): PoolEntry[] => {
    const n = wholeNumber(reply[pos]);
    if (n === null || n < 0 || pos + 1 + 2 * n > reply.length) throw new Error("uuid pool: bad section length");
    pos += 1;
    const out: PoolEntry[] = [];
    for (let i = 0; i < n; i += 1, pos += 2) {
      const uuid = normalizeUuid(reply[pos]);
      const at = wholeNumber(reply[pos + 1]);
      if (uuid === null || at === null || at <= 0) {
        malformed += 1;
        continue;
      }
      out.push({ uuid, at });
    }
    return out;
  };
  const ready = section();
  const taken = section();
  const retired = section();
  if (pos !== reply.length) throw new Error("uuid pool: trailing data in the maintain reply");
  return { ready, taken, retired, added, rotated, malformed };
}

// ── What the reserve adds to the node answer ───────────

/**
 * The reserve's lines for the nodes. `known` holds every UUID of every
 * device record: such a UUID is never listed from here, whatever set it is
 * in, so its device's own date and slot decide (a paused device stays off
 * the nodes). O(n).
 *   ready                       → poolLineUntil(now)
 *   taken, within the grace     → poolLineUntil(now)
 *   taken, grace over           → taken-at + grace (past: removed by the clock)
 *   retired                     → retired-at (past: removed by the clock)
 */
export function reservePairs(state: PoolState, known: ReadonlySet<string>, now: number): UuidPair[] {
  const ahead = poolLineUntil(now);
  const out: UuidPair[] = [];
  for (const e of state.ready) if (!known.has(e.uuid)) out.push({ uuid: e.uuid, until: ahead });
  for (const e of state.taken) {
    if (known.has(e.uuid)) continue;
    out.push({ uuid: e.uuid, until: now - e.at < TAKEN_GRACE_MS ? ahead : e.at + TAKEN_GRACE_MS });
  }
  for (const e of state.retired) if (!known.has(e.uuid)) out.push({ uuid: e.uuid, until: e.at });
  return out;
}

/** Taken marks whose device record is now visible: the builder drops them. */
export function visibleTaken(state: PoolState, known: ReadonlySet<string>): string[] {
  return state.taken.filter((e) => known.has(e.uuid)).map((e) => e.uuid);
}

export interface PoolCounts {
  readonly ready: number;
  /** Ready and old enough to be handed out. */
  readonly mature: number;
  readonly taken: number;
  readonly retired: number;
  readonly added: number;
  readonly rotated: number;
  readonly malformed: number;
}

/** Numbers for the build log (never a UUID). */
export function poolCounts(state: PoolState, now: number): PoolCounts {
  return {
    ready: state.ready.length,
    mature: state.ready.filter((e) => e.at <= now - POOL_MIN_AGE_MS).length,
    taken: state.taken.length,
    retired: state.retired.length,
    added: state.added,
    rotated: state.rotated,
    malformed: state.malformed,
  };
}
