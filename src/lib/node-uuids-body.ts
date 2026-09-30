// src/lib/node-uuids-body.ts
//
// The answer of GET /api/internal/node-uuids, without I/O: which devices may
// use a Kovra location that has no 3X-UI panel, their dates, the fingerprint,
// and when the answer must be a refusal instead.
//
// ── Who reads it ────────────────────────────────────────
// A node without a panel: its own xray for Kovra and an agent that pulls this
// every 120 s and applies it through xray's API, without restarts.
//
// ── Which devices, which date ───────────────────────────
// What the panels get from balance.ts syncAllExpiry (device-capacity.ts):
// while a user has running slots, each device holding one is listed with the
// end of that slot (newest devices first), and a device beyond the slots is
// PAUSED and not listed at all, so the agent drops it (KM-03). With no running
// slot, every device is listed with the date of the user's furthest
// subscription, which has passed: the node removes it by its own clock. A
// user without any subscription has no date to give and is left out.
//
// ── Shape ───────────────────────────────────────────────
// Plain text, one device per line: `<uuid> <date ms>`, sorted by UUID, ending
// with a newline. Lines stay for a day after their date, so the node sees an
// expiry as an expiry and not as "the site dropped this device".
//
// ── The reserve ─────────────────────────────────────────
// The answer also carries the reserve of device UUIDs (lib/uuid-pool-body.ts):
// UUIDs no one holds yet, listed in advance so a new device that takes one
// works on the PRO nodes at once. They are not devices: they never count as
// live, and a UUID that is in a device record is kept alive only by that
// record (without a device line the reserve dates it in the past, so the node
// removes it by the clock instead of seeing it dropped).
//
// ── Refusals ────────────────────────────────────────────
// Never an empty 200: an obedient node would take it for "let nobody in".
// Fewer live devices than the minimum (default 1) is a refusal (503) too, and
// the node keeps the list it has, still removing users by their dates. The
// reserve does not count here: a read that lost every device must still be
// refused, not answered with the reserve alone.
//
// Imports only node:crypto and the pure device-capacity.ts, so tests load it
// under Node's type stripping (tests/node-uuids.test.mjs, through
// tests/support/load-ts.mjs for the extensionless import).

import { createHash } from "node:crypto";
import { deviceAccess, type CapacityProfile, type CapacitySub } from "./device-capacity";

/** Lines stay in the answer this long after their date. */
export const NODE_BODY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Fewest live devices an answer may carry, unless KOVRA_NODE_MIN_ACTIVE says otherwise. */
export const NODE_MIN_ACTIVE_DEFAULT = 1;

/** Node names: they become part of a Redis key and a log line. */
export const NODE_NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Last contact of a node's agent, written by the endpoint at most every 10 minutes. */
export const nodeBeatKey = (node: string): string => `nodebeat:${node}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Dates after this are a corrupt record, not a subscription (year 2100). */
const MAX_DATE_MS = 4_102_444_800_000;

/** The configured minimum (KOVRA_NODE_MIN_ACTIVE): a whole number of at least 1, else the default. */
export function nodeMinActive(raw: string | undefined): number {
  const text = (raw ?? "").trim();
  if (!/^[0-9]{1,7}$/.test(text)) return NODE_MIN_ACTIVE_DEFAULT;
  const value = Number(text);
  return value >= 1 ? value : NODE_MIN_ACTIVE_DEFAULT;
}

/** A lower-case UUID, or null when the value is not one. */
export function normalizeUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const uuid = value.trim().toLowerCase();
  return UUID_RE.test(uuid) ? uuid : null;
}

/**
 * The date the panels hold for every profile of a user: the furthest
 * `expiresAt` of any subscription, active or not (a lapsed one gives a past
 * date, which the node treats as "remove by the clock"). Null when the user
 * has no subscription with a usable date.
 */
export function accessUntil(subs: unknown): number | null {
  if (!Array.isArray(subs)) return null;
  let max = 0;
  for (const s of subs) {
    if (!s || typeof s !== "object") continue;
    const at = (s as { expiresAt?: unknown }).expiresAt;
    if (typeof at !== "number" || !Number.isFinite(at) || at <= 0 || at > MAX_DATE_MS) continue;
    if (at > max) max = Math.floor(at);
  }
  return max > 0 ? max : null;
}

/** One user's stored records, as read from Redis (`profiles:<id>`, `subs:<id>`). */
export interface UserAccessRecord {
  readonly profiles: unknown;
  readonly subs: unknown;
}

export interface UuidPair {
  readonly uuid: string;
  readonly until: number;
}

/** The subscriptions of a record that carry a usable date and slot count. */
function capacitySubs(subs: unknown): CapacitySub[] {
  if (!Array.isArray(subs)) return [];
  const out: CapacitySub[] = [];
  for (const s of subs) {
    if (!s || typeof s !== "object") continue;
    const { slots, expiresAt } = s as { slots?: unknown; expiresAt?: unknown };
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt) || expiresAt <= 0 || expiresAt > MAX_DATE_MS) continue;
    if (typeof slots !== "number" || !Number.isSafeInteger(slots) || slots <= 0) continue;
    out.push({ slots, expiresAt });
  }
  return out;
}

/**
 * Every device that may be listed, paired with its date (see the header):
 * the end of its slot, or, with no running slot, the user's furthest date.
 * Paused devices are left out. Malformed profiles are skipped and counted.
 * O(total profiles · log).
 */
export function accessPairs(users: readonly UserAccessRecord[], now: number = Date.now()): { pairs: UuidPair[]; malformed: number } {
  const pairs: UuidPair[] = [];
  let malformed = 0;
  for (const user of users) {
    const lastDate = accessUntil(user.subs);
    if (lastDate === null) continue;
    if (!Array.isArray(user.profiles)) {
      if (user.profiles !== null && user.profiles !== undefined) malformed += 1;
      continue;
    }
    const devices: CapacityProfile[] = [];
    for (const p of user.profiles) {
      const uuid = p && typeof p === "object" ? normalizeUuid((p as { uuid?: unknown }).uuid) : null;
      if (uuid === null) {
        malformed += 1;
        continue;
      }
      const createdAt = (p as { createdAt?: unknown }).createdAt;
      devices.push({ uuid, createdAt: typeof createdAt === "number" ? createdAt : 0 });
    }
    for (const a of deviceAccess(devices, capacitySubs(user.subs), now)) {
      if (a.state === "active") pairs.push({ uuid: a.uuid, until: a.until });
      // No running slot: the last date has passed. (A date still ahead here
      // means a subscription without a usable slot count: list nothing.)
      else if (a.state === "expired" && lastDate <= now) pairs.push({ uuid: a.uuid, until: lastDate });
    }
  }
  return { pairs, malformed };
}

/**
 * Every well-formed device UUID in the records, whatever its user's plan:
 * the reserve never lists one of these ahead (see reservePairs). O(total
 * profiles).
 */
export function profileUuids(users: readonly UserAccessRecord[]): Set<string> {
  const out = new Set<string>();
  for (const user of users) {
    if (!Array.isArray(user.profiles)) continue;
    for (const p of user.profiles) {
      const uuid = p && typeof p === "object" ? normalizeUuid((p as { uuid?: unknown }).uuid) : null;
      if (uuid !== null) out.add(uuid);
    }
  }
  return out;
}

export type NodeUuidsBody =
  | { ok: true; body: string; etag: string; live: number; total: number; reserve: number }
  | { ok: false; reason: "too-few-live"; live: number; total: number; min: number };

/** Usable pairs within the window into `into`, a UUID keeping its latest date. */
function mergePairs(into: Map<string, number>, pairs: readonly UuidPair[], now: number, skip?: ReadonlyMap<string, number>): void {
  for (const p of pairs) {
    const uuid = normalizeUuid(p.uuid);
    if (uuid === null || skip?.has(uuid)) continue;
    if (!Number.isFinite(p.until) || p.until <= now - NODE_BODY_WINDOW_MS) continue;
    into.set(uuid, Math.max(into.get(uuid) ?? 0, Math.floor(p.until)));
  }
}

/**
 * Build the answer from the device pairs and the reserve's lines. Pairs
 * older than the window are left out; a UUID listed twice keeps its latest
 * date; a reserve line for a UUID that has a device pair is dropped (the
 * device decides). `live` and `total` count devices only. O(n log n) for
 * the sort.
 */
export function buildNodeUuidsBody(
  pairs: readonly UuidPair[],
  now: number,
  minLive: number,
  reservePairs: readonly UuidPair[] = [],
): NodeUuidsBody {
  const byUuid = new Map<string, number>();
  mergePairs(byUuid, pairs, now);
  let live = 0;
  for (const until of byUuid.values()) if (until > now) live += 1;
  const total = byUuid.size;
  if (live < minLive) return { ok: false, reason: "too-few-live", live, total, min: minLive };

  const reserve = new Map<string, number>();
  mergePairs(reserve, reservePairs, now, byUuid);
  for (const [uuid, until] of reserve) byUuid.set(uuid, until);

  const lines = [...byUuid]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([uuid, until]) => `${uuid} ${until}`);
  const body = lines.join("\n") + "\n";
  const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
  return { ok: true, body, etag, live, total, reserve: reserve.size };
}
