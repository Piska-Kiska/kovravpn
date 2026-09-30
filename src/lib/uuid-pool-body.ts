// src/lib/uuid-pool-body.ts
//
// The reserve of device UUIDs, without I/O: the Redis script, the arguments
// and replies, which UUID a new device may take, and the lines the reserve
// adds to GET /api/internal/node-uuids. The I/O is lib/uuid-pool.ts.
//
// ── Why ─────────────────────────────────────────────────
// Germany, Britain and the USA are 3X-UI panels: /api/vpn/create writes the
// new device there and it works at once. The PRO nodes (pl, ru, fi, se, kz,
// tr) have no panel: an agent pulls the node-uuids list every 120 s, and the
// site caches that list up to 60 s per instance, so a device with a fresh
// UUID reached them only after up to ~3 minutes. Polling faster is not an
// option (Vercel's DDoS mitigation blocked node polling before).
//
// So the site keeps a small reserve of random UUIDs that no one holds yet and
// lists them for the nodes in advance. A new device takes one that every node
// has confirmed it holds: the device works there at once. Nobody knows a
// reserve UUID (never shown, never in a subscription), so while unassigned
// it opens the door for no one.
//
// ── The agents' guard ───────────────────────────────────
// An agent refuses a list that DROPS (stops listing) more than max(10, 25 %)
// of its live users at once, and keeps its old list until the lines in it
// expire by the clock. A line whose date has passed is an expiry, not a
// drop. So what the reserve put on a node leaves with a PAST date first, and
// the line itself goes only a day later (the node answer's window). What can
// still disappear at once:
//   * the reserve lines themselves, if the site stops listing them (a
//     rollback of this code): at most the reserve size, POOL_SIZE_DEFAULT = 5,
//     which leaves room for 5 ordinary drops in the same poll.
// Create/delete churn on reserve UUIDs is not a drop: a pool device deleted
// in its first day is listed with a past date (the `spent` set below). And
// should an agent refuse anyway, its reserve lines are dated at most
// POOL_LINE_AHEAD_MS (6 h) ahead: they expire on the node by then, and with
// them the reason to refuse.
//
// ── Three sorted sets (member = UUID, score = ms) and a hash ──
//   ready  the reserve; score = when it was added.
//   taken  handed to a device whose record may not be written yet; score =
//          when. Listed ahead while no record is visible, for TAKEN_GRACE_MS
//          (the creation is in flight); after that with a PAST date (the
//          creation failed). Once the record is visible the device decides:
//          its own line when it holds a running slot, otherwise (paused, see
//          lib/device-capacity.ts) a past date, so the reserve never keeps a
//          paused device on the nodes.
//   spent  out of the reserve for good: handed to a device whose record was
//          written (/api/vpn/create moves it here), or rotated out. Listed
//          with its score as a PAST date, unless the device's own line
//          exists; forgotten once that line has left the answer.
//   seen   hash, node name → the time of the reserve view in the list the
//          node last confirmed with a 304 (the agent keeps an ETag only after
//          it applied that list, so a 304 means "I hold exactly this").
//
// ── Who may take what ───────────────────────────────────
// takeLimit(): a ready UUID is handed out only if it was added at least
// POOL_MIN_AGE_MS ago (every list any instance serves has it by then) AND
// before the last confirmation of every node heard from within
// SEEN_HORIZON_MS. A node in backoff, paused after a 403 or refusing new
// lists stops confirming, so younger UUIDs wait for it. If every node known
// has been silent that long, nothing is handed out (instant: false). With no
// node known at all (an empty hash), the age alone decides.
//
// ── Atomicity and order ─────────────────────────────────
// TAKE_LUA moves one UUID from `ready` to `taken` in one script: no two
// devices get the same UUID, and the UUID is always in one set or the other.
// /api/vpn/create writes the device record, then moves the UUID from `taken`
// to `spent` in one MULTI. A UUID thus only moves forward (ready → taken →
// spent), and any view of the sets, however old, shows it at a stage at or
// before the real one, which is listed ahead or decided by the device records
// read after it. A stale view costs one thing: a pool device created and
// deleted within one view (POOL_REFRESH_MS) stays on the nodes until the
// next view.
//
// ── Cost ────────────────────────────────────────────────
// Each serverless instance refreshes its view at most every POOL_REFRESH_MS
// with MAINTAIN_LUA (rotate, forget, refill, read: one EVAL); list builds in
// between reuse it. If the script fails, the sets are read with plain ZRANGEs
// instead (in the order a UUID moves, so none is missed between two reads):
// the node list never depends on the script.
//
// Pure: imports only node-uuids-body.ts, so tests load it under Node's type
// stripping.

import { NODE_BODY_WINDOW_MS, NODE_NAME_RE, normalizeUuid, type UuidPair } from "./node-uuids-body";

export const POOL_READY_KEY = "kovra:uuidpool:ready";
export const POOL_TAKEN_KEY = "kovra:uuidpool:taken";
export const POOL_SPENT_KEY = "kovra:uuidpool:spent";
export const POOL_SEEN_KEY = "kovra:uuidpool:seen";

/**
 * Reserve size unless KOVRA_UUID_POOL_SIZE says otherwise; 0 turns the
 * reserve off. Half the agents' refusal floor (REFUSE_FLOOR = 10): a rollback
 * that stops listing the reserve drops at most 5 users, and 5 ordinary drops
 * in the same poll still pass. 5 ready UUIDs serve 5 new devices within
 * POOL_MIN_AGE_MS plus a refresh; later ones get a fresh UUID and the notice.
 */
export const POOL_SIZE_DEFAULT = 5;
/** Larger values are clamped. Above 5 the rollback margin shrinks (see the header). */
export const POOL_SIZE_MAX = 20;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * An instance refreshes its view of the reserve (and refills and rotates it)
 * at most this often. Must stay well under POOL_MIN_AGE_MS (see there).
 */
export const POOL_REFRESH_MS = 5 * MINUTE_MS;
/**
 * A ready UUID is handed out only this long after it was added: longer than
 * a view of the reserve (POOL_REFRESH_MS) plus the list cache (60 s), so
 * every list any instance serves by then carries it.
 */
export const POOL_MIN_AGE_MS = 10 * MINUTE_MS;
/** A ready UUID older than this is rotated out. */
export const POOL_MAX_AGE_MS = 7 * DAY_MS;
/** At most this many ready UUIDs are rotated out per refresh. */
export const POOL_ROTATE_PER_PASS = 2;
/** Reserve lines are dated this far after the start of the current hour. */
export const POOL_LINE_AHEAD_MS = 6 * HOUR_MS;
/** A taken UUID with no visible device record is kept ahead this long. */
export const TAKEN_GRACE_MS = 10 * MINUTE_MS;
/** Marks are forgotten this long after their past-dated lines have left the answer. */
const FORGET_MARGIN_MS = HOUR_MS;
/** A node that confirmed no list for this long is left out of takeLimit (it is down). */
export const SEEN_HORIZON_MS = 2 * HOUR_MS;
/** A node silent this long is forgotten from the seen hash. */
export const SEEN_FORGET_MS = 7 * DAY_MS;
/** Instances' clocks differ a little: a UUID must predate a confirmation by this much. */
export const SEEN_MARGIN_MS = 30_000;

/**
 * The configured reserve size (KOVRA_UUID_POOL_SIZE): 0..POOL_SIZE_MAX; unset
 * or not a whole number gives the default. 0 = off: nothing is handed out,
 * nothing added, and what is left is rotated out a few per refresh.
 */
export function uuidPoolSize(raw: string | undefined): number {
  const text = (raw ?? "").trim();
  if (!/^[0-9]{1,6}$/.test(text)) return POOL_SIZE_DEFAULT;
  return Math.min(Number(text), POOL_SIZE_MAX);
}

function hourStart(now: number): number {
  return Math.floor(now / HOUR_MS) * HOUR_MS;
}

/**
 * The date of a reserve line: POOL_LINE_AHEAD_MS after the start of the
 * current hour. Not `now + …`, so the answer (and its ETag) changes once an
 * hour, not on every build, and the agents keep getting 304.
 */
export function poolLineUntil(now: number): number {
  return hourStart(now) + POOL_LINE_AHEAD_MS;
}

/** Upstash parses numeric strings into numbers; accept both. */
function wholeNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isSafeInteger(n) ? n : null;
}

// ── Taking a UUID ───────────────────────────────────────

export interface TakeLimit {
  /** The latest added-at a UUID may have to be handed out; null = hand out nothing. */
  readonly latest: number | null;
  /** Nodes heard from within SEEN_HORIZON_MS. */
  readonly fresh: number;
  /** Nodes heard from before that, but within SEEN_FORGET_MS. */
  readonly stale: number;
  /** Fields of the seen hash to delete: silent for SEEN_FORGET_MS, or not a node. */
  readonly forget: string[];
}

/**
 * Which ready UUIDs a new device may take, from the seen hash (HGETALL:
 * null, or node → ms as a number or a string). See the header. O(nodes).
 */
export function takeLimit(now: number, seen: unknown): TakeLimit {
  let latest = now - POOL_MIN_AGE_MS;
  let fresh = 0;
  let stale = 0;
  const forget: string[] = [];
  if (seen !== null && typeof seen === "object" && !Array.isArray(seen)) {
    for (const [node, raw] of Object.entries(seen as Record<string, unknown>)) {
      const at = wholeNumber(raw);
      if (!NODE_NAME_RE.test(node) || at === null || at <= 0 || at <= now - SEEN_FORGET_MS) {
        forget.push(node);
        continue;
      }
      if (at < now - SEEN_HORIZON_MS) {
        stale += 1;
        continue;
      }
      fresh += 1;
      latest = Math.min(latest, Math.min(at, now) - SEEN_MARGIN_MS);
    }
  }
  return { latest: fresh === 0 && stale > 0 ? null : latest, fresh, stale, forget };
}

/**
 * KEYS: ready, taken. ARGV: now, the latest added-at a UUID may have to be
 * handed out. The oldest such ready UUID moves to `taken`. Reply {'ok', uuid}
 * or {'none'}.
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

export function takeArgs(now: number, latest: number): string[] {
  return [String(Math.floor(now)), String(Math.floor(latest))];
}

/** The taken UUID, or null when no ready UUID was eligible. Throws on any other reply. */
export function parseTakeReply(reply: unknown): string | null {
  if (!Array.isArray(reply) || reply.length === 0) throw new Error("uuid pool: take reply is not a list");
  if (reply[0] === "none" && reply.length === 1) return null;
  if (reply[0] === "ok" && reply.length === 2) {
    const uuid = normalizeUuid(reply[1]);
    if (uuid !== null) return uuid;
  }
  throw new Error("uuid pool: unexpected take reply");
}

// ── Keeping the reserve (one refresh per instance per POOL_REFRESH_MS) ──

/**
 * KEYS: ready, taken, spent. ARGV: now, cap, rotate-at-or-before, rotation
 * budget, forget-taken-at-or-before, forget-spent-at-or-before,
 * mature-at-or-before, mature UUIDs to keep, then fresh UUIDs to add. One
 * script, so the cap holds under concurrent refreshes and the three sets are
 * read at one instant:
 *   1. rotate ready UUIDs added at or before the rotation date out to
 *      `spent`, oldest first, within the budget, and only while at least
 *      `keep` mature ones stay (a reserve filled at once ages at once: it is
 *      renewed in steps, never emptied);
 *   2. if the reserve is over the cap (it was lowered), rotate out the newest
 *      (least likely to be on the nodes yet) with what is left of the budget;
 *   3. forget taken and spent marks whose lines have left the answer;
 *   4. add fresh UUIDs up to the cap;
 *   5. reply {'pool', added, rotated, n, (uuid, score) x n} for ready, then
 *      taken, then spent. Counts are strings; scores come as Redis prints them.
 * Keeps to what Lua 5.1 (Redis) and later versions share.
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
local room = math.min(budget, redis.call('ZCOUNT', KEYS[1], '-inf', ARGV[7]) - tonumber(ARGV[8]))
if room > 0 then
  retire(redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[3], 'LIMIT', 0, room))
end
local over = redis.call('ZCARD', KEYS[1]) - cap
if over > 0 and rotated < budget then
  retire(redis.call('ZRANGE', KEYS[1], -math.min(over, budget - rotated), -1))
end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[5])
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', ARGV[6])
local added = 0
local need = cap - redis.call('ZCARD', KEYS[1])
for i = 9, #ARGV do
  if added >= need then break end
  added = added + redis.call('ZADD', KEYS[1], 'NX', now, ARGV[i])
end
local out = {'pool', string.format('%d', added), string.format('%d', rotated)}
for k = 1, 3 do
  local all = redis.call('ZRANGE', KEYS[k], 0, -1, 'WITHSCORES')
  out[#out + 1] = string.format('%d', #all / 2)
  for j = 1, #all do out[#out + 1] = all[j] end
end
return out
`;

export function poolKeys(): string[] {
  return [POOL_READY_KEY, POOL_TAKEN_KEY, POOL_SPENT_KEY];
}

/** Mature ready UUIDs rotation never goes below: half the cap, rounded up. */
export function keepMature(cap: number): number {
  return Math.ceil(Math.max(0, cap) / 2);
}

export function maintainArgs(now: number, cap: number, fresh: readonly string[]): string[] {
  const t = Math.floor(now);
  return [
    String(t),
    String(cap),
    String(t - POOL_MAX_AGE_MS),
    String(POOL_ROTATE_PER_PASS),
    String(t - TAKEN_GRACE_MS - NODE_BODY_WINDOW_MS - FORGET_MARGIN_MS),
    String(t - NODE_BODY_WINDOW_MS - FORGET_MARGIN_MS),
    String(t - POOL_MIN_AGE_MS),
    String(keepMature(cap)),
    ...fresh,
  ];
}

export interface PoolEntry {
  readonly uuid: string;
  /** ms: added (ready), taken (taken), spent (spent). */
  readonly at: number;
}

export interface PoolState {
  readonly ready: readonly PoolEntry[];
  readonly taken: readonly PoolEntry[];
  readonly spent: readonly PoolEntry[];
  /** UUIDs added by this refresh. */
  readonly added: number;
  /** UUIDs rotated out by this refresh. */
  readonly rotated: number;
  /** Members that were not a UUID or had no usable score; skipped. */
  readonly malformed: number;
}

/** `n` [member, score] pairs of a flat list from position `from`. O(n). */
function readEntries(list: readonly unknown[], from: number, n: number): { entries: PoolEntry[]; malformed: number } {
  const entries: PoolEntry[] = [];
  let malformed = 0;
  for (let i = 0; i < n; i += 1) {
    const uuid = normalizeUuid(list[from + 2 * i]);
    const at = wholeNumber(list[from + 2 * i + 1]);
    if (uuid === null || at === null || at <= 0) malformed += 1;
    else entries.push({ uuid, at });
  }
  return { entries, malformed };
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
    const got = readEntries(reply, pos + 1, n);
    pos += 1 + 2 * n;
    malformed += got.malformed;
    return got.entries;
  };
  const ready = section();
  const taken = section();
  const spent = section();
  if (pos !== reply.length) throw new Error("uuid pool: trailing data in the maintain reply");
  return { ready, taken, spent, added, rotated, malformed };
}

/**
 * Three ZRANGE … WITHSCORES replies (ready, taken, spent), read in that
 * order: the plain read used when MAINTAIN_LUA fails. Throws when a reply is
 * not a flat list of pairs. O(n).
 */
export function parsePoolSets(replies: unknown): PoolState {
  if (!Array.isArray(replies) || replies.length !== 3) throw new Error("uuid pool: expected three set replies");
  let malformed = 0;
  const sets = replies.map((reply: unknown): PoolEntry[] => {
    if (!Array.isArray(reply) || reply.length % 2 !== 0) throw new Error("uuid pool: a set reply is not member/score pairs");
    const got = readEntries(reply, 0, reply.length / 2);
    malformed += got.malformed;
    return got.entries;
  });
  return { ready: sets[0], taken: sets[1], spent: sets[2], added: 0, rotated: 0, malformed };
}

// ── What the reserve adds to the node answer ───────────

/**
 * The reserve's lines for the nodes. `known` holds every UUID of every
 * device record. A reserve line never keeps a known UUID alive: it gets a
 * past date, and when the device holds a running slot its own line replaces
 * this one (buildNodeUuidsBody drops a reserve line that has a device pair).
 * O(n).
 *   ready, unknown                → poolLineUntil(now)
 *   ready, known (a stale view)   → the start of the current hour (past)
 *   taken, known                  → taken-at (past)
 *   taken, unknown, within grace  → poolLineUntil(now)
 *   taken, unknown, grace over    → taken-at + grace (past)
 *   spent                         → spent-at (past); a spent mark wins over
 *                                   a taken one for the same UUID
 */
export function reservePairs(state: PoolState, known: ReadonlySet<string>, now: number): UuidPair[] {
  const ahead = poolLineUntil(now);
  const past = (at: number): number => Math.min(at, now);
  const spent = new Set(state.spent.map((e) => e.uuid));
  const out: UuidPair[] = [];
  for (const e of state.ready) out.push({ uuid: e.uuid, until: known.has(e.uuid) ? hourStart(now) : ahead });
  for (const e of state.taken) {
    if (spent.has(e.uuid)) continue;
    let until: number;
    if (known.has(e.uuid)) until = past(e.at);
    else if (now - e.at < TAKEN_GRACE_MS) until = ahead;
    else until = e.at + TAKEN_GRACE_MS;
    out.push({ uuid: e.uuid, until });
  }
  for (const e of state.spent) out.push({ uuid: e.uuid, until: past(e.at) });
  return out;
}

export interface PoolCounts {
  readonly ready: number;
  /** Ready and past POOL_MIN_AGE_MS (the nodes' confirmations may still hold them back). */
  readonly mature: number;
  readonly taken: number;
  readonly spent: number;
  readonly added: number;
  readonly rotated: number;
  readonly malformed: number;
}

/** Numbers for the logs (never a UUID). */
export function poolCounts(state: PoolState, now: number): PoolCounts {
  return {
    ready: state.ready.length,
    mature: state.ready.filter((e) => e.at <= now - POOL_MIN_AGE_MS).length,
    taken: state.taken.length,
    spent: state.spent.length,
    added: state.added,
    rotated: state.rotated,
    malformed: state.malformed,
  };
}
