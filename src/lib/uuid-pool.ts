// src/lib/uuid-pool.ts
//
// The reserve of device UUIDs that the PRO nodes load in advance, so a new
// device works there at once instead of after the nodes' next poll. The
// design, the Redis scripts and why every step is ordered as it is:
// lib/uuid-pool-body.ts.
//
//   takeDeviceUuid()   /api/vpn/create: the UUID for a new device. From the
//                      reserve when one is ready (instant: true), otherwise a
//                      fresh randomUUID() exactly as before (instant: false).
//                      Never throws: the reserve never blocks a device.
//   releaseTakenMark() /api/vpn/create, AFTER the device record is written.
//   maintainUuidPool() the node-uuids list build: refill, rotate, read.
//   forgetTakenMarks() the node-uuids list build, for marks it saw in records.
//
// Logs carry counts and outcomes only, never a UUID.

import { randomUUID } from "node:crypto";
import { redis } from "./redis";
import {
  MAINTAIN_LUA,
  POOL_TAKEN_KEY,
  TAKE_LUA,
  maintainArgs,
  maintainKeys,
  parseMaintainReply,
  parseTakeReply,
  takeArgs,
  takeKeys,
  uuidPoolSize,
  type PoolState,
} from "./uuid-pool-body";

export interface DeviceUuid {
  readonly uuid: string;
  /**
   * True when the UUID came from the reserve: every PRO node already has it,
   * so the device works in every country at once. False for a fresh UUID:
   * the PRO nodes take it within their next poll (the "3 minutes" notice).
   */
  readonly instant: boolean;
}

type TakeOutcome = "pool" | "empty" | "disabled" | "error";

function logTake(outcome: TakeOutcome, error?: string): void {
  const line = JSON.stringify({ evt: "uuidpool.take", outcome, ...(error ? { error } : {}) });
  if (outcome === "error") console.error(line);
  else console.log(line);
}

function errorText(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200);
}

/** The configured reserve size (KOVRA_UUID_POOL_SIZE, default 10, 0 = off). */
export function configuredPoolSize(): number {
  return uuidPoolSize(process.env.KOVRA_UUID_POOL_SIZE);
}

/**
 * The UUID for a new device. One atomic script moves the oldest ready UUID to
 * `taken`, so two concurrent creations never get the same one. An empty (or
 * too young) reserve, a Redis failure or an odd reply gives a fresh random
 * UUID, as before the reserve existed. A UUID taken whose device is then not
 * created (the request fails later) is retired by the list build.
 */
export async function takeDeviceUuid(now: number = Date.now()): Promise<DeviceUuid> {
  if (configuredPoolSize() === 0) {
    logTake("disabled");
    return { uuid: randomUUID(), instant: false };
  }
  try {
    const reply: unknown = await redis.eval(TAKE_LUA, takeKeys(), takeArgs(now));
    const uuid = parseTakeReply(reply);
    if (uuid !== null) {
      logTake("pool");
      return { uuid, instant: true };
    }
    logTake("empty");
  } catch (err) {
    logTake("error", errorText(err));
  }
  return { uuid: randomUUID(), instant: false };
}

/**
 * The device record of a taken UUID is written: from now on the record
 * decides whether the nodes list it (paused and deleted devices are not).
 * Best effort: if this fails, the next list build drops the mark when it
 * sees the record.
 */
export async function releaseTakenMark(uuid: string): Promise<void> {
  try {
    await redis.zrem(POOL_TAKEN_KEY, uuid);
  } catch (err) {
    console.error(JSON.stringify({ evt: "uuidpool.release_failed", error: errorText(err) }));
  }
}

/** Drop taken marks whose device records a list build has seen. Best effort. */
export async function forgetTakenMarks(uuids: readonly string[]): Promise<void> {
  if (uuids.length === 0) return;
  try {
    await redis.zrem(POOL_TAKEN_KEY, ...uuids);
  } catch (err) {
    console.error(JSON.stringify({ evt: "uuidpool.forget_failed", count: uuids.length, error: errorText(err) }));
  }
}

/**
 * One script: retire what is too old (a few per call), top the reserve up to
 * the configured size, forget stale marks, and read all three sets. Throws
 * when Redis fails or answers something else: the list build then fails as a
 * whole (503) and the nodes keep the list they have, because a list without
 * the reserve would drop every reserve UUID from them at once.
 * O(size of the three sets).
 */
export async function maintainUuidPool(now: number): Promise<PoolState> {
  const cap = configuredPoolSize();
  const fresh = Array.from({ length: cap }, () => randomUUID());
  const reply: unknown = await redis.eval(MAINTAIN_LUA, maintainKeys(), maintainArgs(now, cap, fresh));
  return parseMaintainReply(reply);
}
