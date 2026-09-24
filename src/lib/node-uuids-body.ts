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
// Exactly what the panels get from balance.ts syncAllExpiry: EVERY profile of
// a user, with the date of the user's furthest subscription (plan, device
// add-on or referral). A panel disables the client when that date passes; the
// node does the same by its own clock. A user without any subscription has no
// date to give and is left out.
//
// ── Shape ───────────────────────────────────────────────
// Plain text, one device per line: `<uuid> <date ms>`, sorted by UUID, ending
// with a newline. Lines stay for a day after their date, so the node sees an
// expiry as an expiry and not as "the site dropped this device".
//
// ── Refusals ────────────────────────────────────────────
// Never an empty 200: an obedient node would take it for "let nobody in".
// Fewer live devices than the minimum (default 1) is a refusal (503) too, and
// the node keeps the list it has, still removing users by their dates.
//
// Imports only node:crypto, so tests load it under plain Node type stripping
// (tests/node-uuids.test.mjs).

import { createHash } from "node:crypto";

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

/**
 * Every profile UUID of every user with a subscription date, paired with that
 * date. Malformed profiles are skipped and counted. O(total profiles).
 */
export function accessPairs(users: readonly UserAccessRecord[]): { pairs: UuidPair[]; malformed: number } {
  const pairs: UuidPair[] = [];
  let malformed = 0;
  for (const user of users) {
    const until = accessUntil(user.subs);
    if (until === null) continue;
    if (!Array.isArray(user.profiles)) {
      if (user.profiles !== null && user.profiles !== undefined) malformed += 1;
      continue;
    }
    for (const p of user.profiles) {
      const uuid = p && typeof p === "object" ? normalizeUuid((p as { uuid?: unknown }).uuid) : null;
      if (uuid === null) {
        malformed += 1;
        continue;
      }
      pairs.push({ uuid, until });
    }
  }
  return { pairs, malformed };
}

export type NodeUuidsBody =
  | { ok: true; body: string; etag: string; live: number; total: number }
  | { ok: false; reason: "too-few-live"; live: number; total: number; min: number };

/**
 * Build the answer from the pairs. Pairs older than the window are left out;
 * a UUID listed twice keeps its latest date. O(n log n) for the sort.
 */
export function buildNodeUuidsBody(pairs: readonly UuidPair[], now: number, minLive: number): NodeUuidsBody {
  const byUuid = new Map<string, number>();
  for (const p of pairs) {
    const uuid = normalizeUuid(p.uuid);
    if (uuid === null || !Number.isFinite(p.until) || p.until <= now - NODE_BODY_WINDOW_MS) continue;
    byUuid.set(uuid, Math.max(byUuid.get(uuid) ?? 0, Math.floor(p.until)));
  }
  let live = 0;
  for (const until of byUuid.values()) if (until > now) live += 1;
  const total = byUuid.size;
  if (live < minLive) return { ok: false, reason: "too-few-live", live, total, min: minLive };

  const lines = [...byUuid]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([uuid, until]) => `${uuid} ${until}`);
  const body = lines.join("\n") + "\n";
  const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
  return { ok: true, body, etag, live, total };
}
