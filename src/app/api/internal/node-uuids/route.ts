// src/app/api/internal/node-uuids/route.ts
//
// GET /api/internal/node-uuids?node=<name>: which Kovra devices may use a
// location that has no 3X-UI panel right now. Such a location runs its own
// xray for Kovra (own port, own REALITY keys) and an agent that pulls this
// list every 120 s and applies it through xray's API, without restarts.
//
//   200 text/plain, `<uuid> <date ms>` per line, ETag = hash of the body
//   304 the node's If-None-Match matches: nothing to do
//   400 no or malformed `node`
//   401 wrong token
//   429 more than RATE_PER_MIN requests a minute for one node name
//   503 KOVRA_NODE_TOKEN unset, Redis unreadable, or fewer live devices than
//       KOVRA_NODE_MIN_ACTIVE (default 1) — never an empty list: the node
//       keeps what it has and still removes users by their dates
//
// Which devices and dates: lib/node-uuids-body.ts (the same dates
// balance.ts syncAllExpiry writes into the panels).
//
// The answer is working VPN credentials for every paying device, so the token
// is its own (KOVRA_NODE_TOKEN), compared in constant time. The rate limit is
// kept in memory per instance: the endpoint is closed by the token, and a
// Redis counter would cost two commands on every poll.
//
// Logs carry numbers only: never a UUID, never the node's address.

import { NextRequest, NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import { checkNodeToken } from "@/lib/node-token-auth";
import { readNodeUuidPairs } from "@/lib/node-uuids";
import { NODE_NAME_RE, buildNodeUuidsBody, nodeBeatKey, nodeMinActive } from "@/lib/node-uuids-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Per node name; the agent needs one every 2 minutes, a hand-run FORCE=1 a few more. */
const RATE_PER_MIN = 30;
const RATE_WINDOW_MS = 60_000;

/** 30 days, so a silent node is visible for a month. */
const BEAT_TTL_SEC = 30 * 24 * 60 * 60;
const BEAT_EVERY_MS = 10 * 60_000;

const recent = new Map<string, number[]>();
const lastBeat = new Map<string, number>();

function allow(node: string, now: number): { ok: boolean; retryAfter: number } {
  const kept = (recent.get(node) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (kept.length >= RATE_PER_MIN) {
    recent.set(node, kept);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - kept[0])) / 1000)) };
  }
  kept.push(now);
  recent.set(node, kept);
  return { ok: true, retryAfter: 0 };
}

function beat(node: string, live: number, total: number, now: number): void {
  if (now - (lastBeat.get(node) ?? 0) < BEAT_EVERY_MS) return;
  lastBeat.set(node, now);
  redis
    .set(nodeBeatKey(node), JSON.stringify({ at: now, live, total }), { ex: BEAT_TTL_SEC })
    .catch(() => {
      /* the mark is optional */
    });
}

function fail(
  status: number,
  error: string,
  extra: Record<string, number> = {},
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function GET(req: NextRequest) {
  const auth = checkNodeToken(req.headers.get("authorization"), process.env.KOVRA_NODE_TOKEN);
  if (auth === "unconfigured") {
    console.error("[node-uuids] KOVRA_NODE_TOKEN is not set: endpoint closed");
    return fail(503, "not configured");
  }
  if (auth === "unauthorized") return fail(401, "Unauthorized");

  const node = req.nextUrl.searchParams.get("node") ?? "";
  if (!NODE_NAME_RE.test(node)) return fail(400, "node must match " + NODE_NAME_RE.source);

  const now = Date.now();
  const limit = allow(node, now);
  if (!limit.ok) return fail(429, "Too many requests", {}, { "Retry-After": String(limit.retryAfter) });

  let read: Awaited<ReturnType<typeof readNodeUuidPairs>>;
  try {
    read = await readNodeUuidPairs(now);
  } catch (err) {
    console.error("[node-uuids] storage unreadable:", err instanceof Error ? err.message : err);
    return fail(503, "storage unreadable");
  }
  if (read.malformed > 0) console.error(`[node-uuids] ${read.malformed} malformed profile record(s) skipped`);

  const built = buildNodeUuidsBody(read.pairs, now, nodeMinActive(process.env.KOVRA_NODE_MIN_ACTIVE));
  if (!built.ok) {
    console.warn(`[node-uuids] ${node}: ${built.live} live device(s) of ${built.total}, minimum ${built.min}: refusing`);
    return fail(503, "too few live devices", { live: built.live, total: built.total, min: built.min });
  }
  beat(node, built.live, built.total, now);

  const headers = {
    "Cache-Control": "no-store",
    ETag: built.etag,
    // The node compares its clock with ours before it removes anyone by date.
    "X-Now-Ms": String(now),
    "X-Node-Live": String(built.live),
  };
  if (req.headers.get("if-none-match") === built.etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(built.body, {
    status: 200,
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
  });
}
