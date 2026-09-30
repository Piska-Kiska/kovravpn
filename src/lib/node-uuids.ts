// src/lib/node-uuids.ts
//
// Reads what GET /api/internal/node-uuids and POST /api/hy2/auth answer from:
// every user's profiles and subscriptions and, for the nodes only, the
// reserve of device UUIDs. The pure part (which lines, which date) is
// node-uuids-body.ts and uuid-pool-body.ts.
//
//   readDevicePairs()    POST /api/hy2/auth: the devices alone. The reserve is
//                        never read here: a reserve UUID belongs to no device,
//                        so it must never let anyone into Hysteria2.
//   readNodeUuidPairs()  GET /api/internal/node-uuids: the devices and the
//                        reserve's lines, kept apart in the result.
//
// ── Cost ────────────────────────────────────────────────
// There is no index of profiles, so reading the devices walks them: SCAN
// `profiles:*`, then one MGET for the profiles and one for the subscriptions,
// i.e. about four commands for today's ~20 users (O(users) in data). Six
// nodes asking every 120 s would be ~4 300 rebuilds a day, so each result is
// kept in memory for REBUILD_EVERY_MS per serverless instance: a new purchase
// reaches the nodes within a minute plus the node's poll step. A node build
// adds one script for the reserve: each build refreshes its view of it
// (lib/uuid-pool.ts currentUuidPool), so at most one EVAL a minute per
// instance.
//
// Hysteria2 asks on every connect, and connects come in bursts (a phone that
// wakes up opens several at once), so callers that find the copy stale at the
// same moment share ONE rebuild instead of each walking the keyspace; node
// builds are shared the same way. A node build also leaves its device read
// for Hysteria2, so an instance serving both walks the profiles at most twice
// per REBUILD_EVERY_MS.
//
// ── The reserve ─────────────────────────────────────────
// A device with a fresh UUID reaches the PRO nodes within a minute plus the
// node's poll step. A device that took a reserve UUID (lib/uuid-pool.ts) is
// already there: every build lists the reserve. The view of the reserve is
// taken BEFORE the profiles are read, and a UUID only moves forward in it
// (ready → taken → spent), so a UUID taken for a device is always listed
// ahead or decided by the device record: it never leaves the list in between.
// So a node build always reads the profiles itself, after it has the view: it
// never takes a device read that may have started before.

import { redis } from "./redis";
import { accessPairs, profileUuids, type UserAccessRecord, type UuidPair } from "./node-uuids-body";
import { poolCounts, reservePairs, type PoolCounts } from "./uuid-pool-body";
import { currentUuidPool } from "./uuid-pool";

/** How long one instance reuses the pairs it read. */
export const REBUILD_EVERY_MS = 60_000;

const SCAN_COUNT = 500;
const MGET_CHUNK = 200;
/** A runaway SCAN (millions of keys) must not keep a node request busy. */
const MAX_USERS = 50_000;

/** The devices alone: what Hysteria2 decides from. */
export interface DevicePairsRead {
  /** Devices and their dates (node-uuids-body.ts accessPairs); never a reserve UUID. */
  readonly pairs: UuidPair[];
  readonly malformed: number;
  /** When these pairs were read from Redis (a copy keeps the time of its rebuild). */
  readonly at: number;
}

/** What a node build answers from: the devices, and the reserve's lines apart from them. */
export interface NodeUuidRead extends DevicePairsRead {
  /** The reserve's lines (uuid-pool-body.ts reservePairs); never counted as live. */
  readonly reserve: UuidPair[];
  readonly pool: PoolCounts;
  /** When the view of the reserve these lines come from was read (for noteNodeConfirmed). */
  readonly poolAt: number;
}

let devices: DevicePairsRead | null = null;
/** The device read in progress, shared by every caller that arrives meanwhile. */
let devicesInflight: Promise<DevicePairsRead> | null = null;
let nodeRead: NodeUuidRead | null = null;
/** The node build in progress, shared by every caller that arrives meanwhile. */
let nodeInflight: Promise<NodeUuidRead> | null = null;

/** Upstash returns stored JSON already parsed, or the raw string if it is not JSON. */
function parseStored(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

async function mgetChunked(keys: readonly string[]): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let i = 0; i < keys.length; i += MGET_CHUNK) {
    const part = keys.slice(i, i + MGET_CHUNK);
    const values = await redis.mget<unknown[]>(...part);
    if (!Array.isArray(values) || values.length !== part.length) {
      throw new Error("MGET answered a different number of values");
    }
    out.push(...values);
  }
  return out;
}

async function profileUserIds(): Promise<string[]> {
  const ids = new Set<string>();
  let cursor: string | number = 0;
  do {
    const [next, keys] = (await redis.scan(cursor, { match: "profiles:*", count: SCAN_COUNT })) as [
      string | number,
      string[],
    ];
    for (const key of keys) {
      const id = key.slice("profiles:".length);
      if (id) ids.add(id);
    }
    if (ids.size > MAX_USERS) throw new Error(`more than ${MAX_USERS} profile keys`);
    cursor = next;
  } while (Number(cursor) !== 0);
  return [...ids].sort();
}

function isYoung(at: number, now: number): boolean {
  return now - at >= 0 && now - at < REBUILD_EVERY_MS;
}

/** Takes a device read as this instance's copy unless the copy is newer. */
function keepDevices(read: DevicePairsRead): void {
  if (devices === null || read.at >= devices.at) devices = read;
}

/** One walk of the profiles: the device pairs and the records they came from. Throws on any Redis failure. */
async function scanDevices(now: number): Promise<{ read: DevicePairsRead; users: UserAccessRecord[] }> {
  const ids = await profileUserIds();
  const [profiles, subs] = await Promise.all([
    mgetChunked(ids.map((id) => `profiles:${id}`)),
    mgetChunked(ids.map((id) => `subs:${id}`)),
  ]);
  const users: UserAccessRecord[] = ids.map((_, i) => ({
    profiles: parseStored(profiles[i]),
    subs: parseStored(subs[i]),
  }));
  const { pairs, malformed } = accessPairs(users, now);
  return { read: { pairs, malformed, at: now }, users };
}

async function rebuildDevices(now: number): Promise<DevicePairsRead> {
  const { read } = await scanDevices(now);
  keepDevices(read);
  return read;
}

async function rebuildNodeRead(now: number): Promise<NodeUuidRead> {
  // The view of the reserve first (see the header), then a device read of this build's own.
  const pool = await currentUuidPool(now);
  const { read, users } = await scanDevices(now);
  keepDevices(read);
  const reserve = reservePairs(pool.state, profileUuids(users), now, pool.at);
  const built: NodeUuidRead = { ...read, reserve, pool: poolCounts(pool.state, now), poolAt: pool.at };
  nodeRead = built;
  return built;
}

/**
 * Every profile UUID with its access date, and nothing else: from Redis or
 * from this instance's copy younger than REBUILD_EVERY_MS. `force` skips the
 * copy (Hysteria2 asking about a UUID its copy does not know: maybe a device
 * created since, lib/hy2-access.ts). Concurrent callers share one rebuild,
 * forced or not: one in flight has just started. Never reads the reserve.
 * Throws when Redis cannot be read.
 */
export async function readDevicePairs(
  now: number = Date.now(),
  opts: { readonly force?: boolean } = {},
): Promise<DevicePairsRead> {
  if (!opts.force && devices && isYoung(devices.at, now)) return devices;
  if (devicesInflight) return devicesInflight;
  const run = rebuildDevices(now);
  devicesInflight = run;
  try {
    return await run;
  } finally {
    if (devicesInflight === run) devicesInflight = null;
  }
}

/**
 * Every profile UUID with its access date, and the reserve's lines, from
 * Redis or from this instance's copy younger than REBUILD_EVERY_MS.
 * Concurrent callers share one build. Throws when Redis cannot be read (or
 * there is no view of the reserve at all): the endpoint then answers 503 and
 * the node keeps what it has.
 */
export async function readNodeUuidPairs(now: number = Date.now()): Promise<NodeUuidRead> {
  if (nodeRead && isYoung(nodeRead.at, now)) return nodeRead;
  if (nodeInflight) return nodeInflight;
  const run = rebuildNodeRead(now);
  nodeInflight = run;
  try {
    return await run;
  } finally {
    if (nodeInflight === run) nodeInflight = null;
  }
}

/** Tests only: forget this instance's copies of the pairs (not the reserve view). */
export function resetNodeUuidCache(): void {
  devices = null;
  devicesInflight = null;
  nodeRead = null;
  nodeInflight = null;
}
