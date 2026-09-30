// src/lib/uuid-pool.ts
//
// The reserve of device UUIDs that the PRO nodes load in advance, so a new
// device works there at once instead of after the nodes' next poll. The
// design, the Redis script and why every step is ordered as it is:
// lib/uuid-pool-body.ts.
//
//   takeDeviceUuid()      /api/vpn/create: the UUID for a new device. From
//                         the reserve when one is ready and every node has
//                         confirmed it holds it (instant: true), otherwise a
//                         fresh randomUUID() exactly as before (instant:
//                         false). Never throws: the reserve never blocks a
//                         device.
//   releaseTakenMark()    /api/vpn/create, AFTER the device record is
//                         written: the UUID moves from `taken` to `spent`.
//   currentUuidPool()     the node-uuids list build: this instance's view of
//                         the reserve, refreshed (refilled, rotated, read) by
//                         every build (builds are at most one per list cache,
//                         POOL_REFRESH_MS).
//   noteNodeConfirmed()   the node-uuids endpoint, on a 304: the node holds
//                         the list built from that view.
//
// Logs carry counts and outcomes only, never a UUID (safe-error-text.ts cuts
// the Upstash command out of error messages).

import { randomUUID } from "node:crypto";
import { redis } from "./redis";
import { safeErrorText } from "./safe-error-text";
import {
  MAINTAIN_LUA,
  POOL_READY_KEY,
  POOL_REFRESH_MS,
  POOL_SEEN_KEY,
  POOL_SPENT_KEY,
  POOL_TAKEN_KEY,
  TAKE_LUA,
  maintainArgs,
  parseMaintainReply,
  parsePoolSets,
  parseTakeReply,
  poolCounts,
  poolKeys,
  takeArgs,
  takeKeys,
  takeLimit,
  uuidPoolSize,
  type PoolState,
} from "./uuid-pool-body";

/** A node's confirmation is written at most this often per instance. */
export const SEEN_WRITE_EVERY_MS = 5 * 60_000;

export interface DeviceUuid {
  readonly uuid: string;
  /**
   * True when the UUID came from the reserve: every PRO node already has it,
   * so the device works in every country at once. False for a fresh UUID:
   * the PRO nodes take it within their next poll (the "3 minutes" notice).
   */
  readonly instant: boolean;
}

/** This instance's view of the reserve: the sets as read at `at`. */
export interface PoolView {
  readonly at: number;
  readonly state: PoolState;
}

type TakeOutcome = "pool" | "empty" | "disabled" | "nodes-silent" | "error";

function logTake(outcome: TakeOutcome, extra: Record<string, number | string> = {}): void {
  const line = JSON.stringify({ evt: "uuidpool.take", outcome, ...extra });
  if (outcome === "error") console.error(line);
  else console.log(line);
}

function logFailure(evt: string, err: unknown, extra: Record<string, number> = {}): void {
  console.error(JSON.stringify({ evt, ...extra, error: safeErrorText(err, { max: 200 }) }));
}

/** The configured reserve size (KOVRA_UUID_POOL_SIZE, default 5, 0 = off). */
export function configuredPoolSize(): number {
  return uuidPoolSize(process.env.KOVRA_UUID_POOL_SIZE);
}

/** Drop nodes silent for a week (or junk fields) from the seen hash. Best effort. */
async function forgetNodes(fields: readonly string[]): Promise<void> {
  try {
    await redis.hdel(POOL_SEEN_KEY, ...fields);
  } catch (err) {
    logFailure("uuidpool.seen_forget_failed", err, { count: fields.length });
  }
}

/**
 * The UUID for a new device. One atomic script moves the oldest eligible
 * ready UUID to `taken`, so two concurrent creations never get the same one.
 * Eligible = old enough and confirmed by every node heard from lately
 * (takeLimit in uuid-pool-body.ts). Nothing eligible, a Redis failure or an
 * odd reply gives a fresh random UUID, as before the reserve existed. A UUID
 * taken whose device is then not created (the request fails later) leaves the
 * nodes by the clock after TAKEN_GRACE_MS.
 */
export async function takeDeviceUuid(now: number = Date.now()): Promise<DeviceUuid> {
  if (configuredPoolSize() === 0) {
    logTake("disabled");
    return { uuid: randomUUID(), instant: false };
  }
  try {
    const seen: unknown = await redis.hgetall(POOL_SEEN_KEY);
    const limit = takeLimit(now, seen);
    if (limit.forget.length > 0) await forgetNodes(limit.forget);
    if (limit.latest === null) {
      logTake("nodes-silent", { stale: limit.stale });
    } else {
      const reply: unknown = await redis.eval(TAKE_LUA, takeKeys(), takeArgs(now, limit.latest));
      const uuid = parseTakeReply(reply);
      if (uuid !== null) {
        logTake("pool", { nodes: limit.fresh });
        return { uuid, instant: true };
      }
      logTake("empty", { nodes: limit.fresh });
    }
  } catch (err) {
    logTake("error", { error: safeErrorText(err, { max: 200 }) });
  }
  return { uuid: randomUUID(), instant: false };
}

/**
 * The device record of a taken UUID is written: the UUID moves from `taken`
 * to `spent` in one MULTI. From now on the record decides whether the nodes
 * list it; once the record is gone (the device deleted) the UUID is listed
 * with a past date for a day, so the nodes remove it by the clock and never
 * count it as dropped. Never throws: if this fails, the `taken` mark does the
 * same once TAKEN_GRACE_MS has passed.
 */
export async function releaseTakenMark(uuid: string, now: number = Date.now()): Promise<void> {
  try {
    await redis
      .multi()
      .zadd(POOL_SPENT_KEY, { score: Math.floor(now), member: uuid })
      .zrem(POOL_TAKEN_KEY, uuid)
      .exec();
  } catch (err) {
    logFailure("uuidpool.release_failed", err);
  }
}

/**
 * One script: rotate out what is too old (a few per call, never below half
 * the reserve mature), top the reserve up to the configured size, forget
 * stale marks, and read all three sets. Throws when Redis fails or answers
 * something else. O(size of the three sets).
 */
async function maintainUuidPool(now: number): Promise<PoolState> {
  const cap = configuredPoolSize();
  const fresh = Array.from({ length: cap }, () => randomUUID());
  const reply: unknown = await redis.eval(MAINTAIN_LUA, poolKeys(), maintainArgs(now, cap, fresh));
  return parseMaintainReply(reply);
}

/**
 * The three sets with plain ZRANGEs, one after the other in the order a UUID
 * moves (ready, taken, spent): a UUID that moves between two reads is caught
 * by the later one, so it is never missed. No script, no transaction: the
 * fallback depends on nothing the main path does. Throws on failure.
 */
async function readUuidPool(): Promise<PoolState> {
  const replies: unknown[] = [];
  for (const key of [POOL_READY_KEY, POOL_TAKEN_KEY, POOL_SPENT_KEY]) {
    replies.push(await redis.zrange(key, 0, -1, { withScores: true }));
  }
  return parsePoolSets(replies);
}

let view: PoolView | null = null;
let lastLogged = "";

/** A line when the view changed, never on every build. */
function logView(source: "maintain" | "read", state: PoolState, now: number): void {
  const counts = poolCounts(state, now);
  const signature = JSON.stringify([source, counts.ready, counts.mature, counts.taken, counts.spent, counts.malformed]);
  if (signature === lastLogged && counts.added === 0 && counts.rotated === 0) return;
  lastLogged = signature;
  console.log(JSON.stringify({ evt: "uuidpool.view", source, ...counts }));
}

/**
 * This instance's view of the reserve for a list build. Younger than
 * POOL_REFRESH_MS (the list cache, so in practice only when a caller builds
 * twice within it): reused. Otherwise refreshed with MAINTAIN_LUA; if the
 * script fails, the sets are read with plain commands; if that fails too,
 * the last view is kept, whatever its age: a UUID only moves forward, so an
 * old view never drops one. It may still say "ready" for a pool device
 * deleted since, so once it is older than POOL_VIEW_STALE_MS its lines stop
 * moving ahead (reservePairs `viewAt`) and run out on the nodes within
 * POOL_LINE_AHEAD_MS. Throws only when there is no view at all: the list
 * build then fails (503) and the nodes keep what they have.
 */
export async function currentUuidPool(now: number): Promise<PoolView> {
  if (view && now - view.at >= 0 && now - view.at < POOL_REFRESH_MS) return view;
  let state: PoolState | null = null;
  let source: "maintain" | "read" = "maintain";
  try {
    state = await maintainUuidPool(now);
  } catch (err) {
    logFailure("uuidpool.maintain_failed", err);
  }
  if (state === null) {
    source = "read";
    try {
      state = await readUuidPool();
    } catch (err) {
      logFailure("uuidpool.read_failed", err);
    }
  }
  if (state === null) {
    if (view) {
      console.error(JSON.stringify({ evt: "uuidpool.stale_view", ageMs: now - view.at }));
      return view;
    }
    throw new Error("uuid pool: the reserve cannot be read");
  }
  view = { at: now, state };
  logView(source, state, now);
  return view;
}

const seenWrites = new Map<string, number>();

/**
 * `node` answered 304 to a list built from the view read at `poolAt`: it
 * holds every reserve UUID added by then. Written at most every
 * SEEN_WRITE_EVERY_MS per node and instance; best effort, never throws.
 */
export async function noteNodeConfirmed(node: string, poolAt: number, now: number = Date.now()): Promise<void> {
  if (configuredPoolSize() === 0) return;
  const last = seenWrites.get(node);
  if (last !== undefined && now - last >= 0 && now - last < SEEN_WRITE_EVERY_MS) return;
  seenWrites.set(node, now);
  try {
    await redis.hset(POOL_SEEN_KEY, { [node]: Math.floor(poolAt) });
  } catch (err) {
    logFailure("uuidpool.seen_write_failed", err);
  }
}

/** Tests only: forget this instance's view, write throttle and log state. */
export function resetUuidPoolInstance(): void {
  view = null;
  lastLogged = "";
  seenWrites.clear();
}
