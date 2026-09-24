// src/lib/node-uuids.ts
//
// Reads what GET /api/internal/node-uuids answers from: every user's profiles
// and subscriptions. The pure part (which lines, which date) is
// node-uuids-body.ts.
//
// ── Cost ────────────────────────────────────────────────
// There is no index of profiles, so a rebuild walks them: SCAN `profiles:*`,
// then one MGET for the profiles and one for the subscriptions, i.e. about
// four commands for today's ~20 users (O(users) in data). Six nodes asking
// every 120 s would be ~4 300 rebuilds a day, so the pairs are kept in memory
// for REBUILD_EVERY_MS per serverless instance: a new purchase reaches the
// nodes within a minute plus the node's poll step.

import { redis } from "./redis";
import { accessPairs, type UserAccessRecord, type UuidPair } from "./node-uuids-body";

/** How long one instance reuses the pairs it read. */
export const REBUILD_EVERY_MS = 60_000;

const SCAN_COUNT = 500;
const MGET_CHUNK = 200;
/** A runaway SCAN (millions of keys) must not keep a node request busy. */
const MAX_USERS = 50_000;

let cached: { at: number; pairs: UuidPair[]; malformed: number } | null = null;

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

/**
 * Every profile UUID with its access date, from Redis or from this instance's
 * copy younger than REBUILD_EVERY_MS. Throws when Redis cannot be read: the
 * endpoint then answers 503 and the node keeps what it has.
 */
export async function readNodeUuidPairs(now: number = Date.now()): Promise<{ pairs: UuidPair[]; malformed: number }> {
  if (cached && now - cached.at >= 0 && now - cached.at < REBUILD_EVERY_MS) {
    return { pairs: cached.pairs, malformed: cached.malformed };
  }
  const ids = await profileUserIds();
  const [profiles, subs] = await Promise.all([
    mgetChunked(ids.map((id) => `profiles:${id}`)),
    mgetChunked(ids.map((id) => `subs:${id}`)),
  ]);
  const users: UserAccessRecord[] = ids.map((_, i) => ({
    profiles: parseStored(profiles[i]),
    subs: parseStored(subs[i]),
  }));
  const { pairs, malformed } = accessPairs(users);
  cached = { at: now, pairs, malformed };
  return { pairs, malformed };
}
