// src/lib/inbounds.ts
/**
 * Inbound registry for multi-inbound/multi-server subscriptions.
 *
 * Each entry has a `source`:
 *   - `panel` (default): connection params fetched live from 3X-UI panel
 *     this Vercel instance has API creds for. Field `inboundId` is required.
 *   - `static`: connection params stored inline in the registry. Used for
 *     servers Vercel cannot reach (separate 3X-UI panels, e.g. Aeza HEL
 *     behind SSH-tunnel). Fields `address`, `port`, `publicKey`, etc. required.
 *
 * Stored in Redis under `inbounds:registry`. Cached in-memory 30s. Falls
 * back to DEFAULT_REGISTRY when Redis empty/malformed.
 *
 * To add a new server:
 *   1. If panel-managed: add client UUIDs into the inbound on the panel,
 *      append entry with source=panel, inboundId.
 *   2. If external: append entry with source=static and connection params
 *      (sync UUIDs via SSH/sqlite once per user).
 *   3. Subscriptions pick it up after 30s cache window.
 */
import { redis } from "./redis";

export interface InboundEntry {
  /** Stable key, used as outbound tag suffix in xray config */
  key: string;
  /** Human-readable name for subscription remarks ("VDsina", "Aeza") */
  label: string;
  /** Optional emoji flag prepended in remarks (e.g. "🇳🇱") */
  flag?: string;
  /** false → omitted from subscription */
  enabled: boolean;
  /** Lower = listed first */
  priority: number;
  /** Where to read connection params from. Default 'panel' for back compat. */
  source?: "panel" | "static";
  /** Required when source='panel' */
  inboundId?: number;
  /** Required when source='static' */
  address?: string;
  port?: number;
  serverName?: string;
  publicKey?: string;
  shortId?: string;
  spiderX?: string;
  fingerprint?: string;
  encryption?: string;
  flow?: string;
  /** Protocol type. Default "vless" for back-compat. */
  protocol?: "vless" | "hysteria2";
  /** Hysteria2: server SNI for TLS (default www.bing.com) */
  hy2Sni?: string;
  /** Hysteria2: skip cert verify (self-signed). DEPRECATED: new Xray cores
   * removed allowInsecure. Use hy2Pin instead. Kept for back-compat only. */
  hy2Insecure?: boolean;
  /** Hysteria2: SHA256 fingerprint of the self-signed server cert, hex without
   * colons (uppercase). Emitted as pinSHA256= in the hy2 URI so modern Xray
   * cores can verify a self-signed cert without the removed allowInsecure flag. */
  hy2Pin?: string;
}

const REGISTRY_KEY = "inbounds:registry";
const CACHE_TTL_MS = 30_000;

const DEFAULT_REGISTRY: InboundEntry[] = [
  {
    key: "main",
    label: "ProxysVPN",
    enabled: true,
    priority: 0,
    source: "panel",
    inboundId: 1,
  },
];

let cache: { at: number; data: InboundEntry[] } | null = null;

function isInboundEntry(x: unknown): x is InboundEntry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (
    typeof o.key !== "string" ||
    o.key.length === 0 ||
    typeof o.label !== "string" ||
    typeof o.enabled !== "boolean" ||
    typeof o.priority !== "number"
  )
    return false;

  const source = o.source ?? "panel";
  if (source !== "panel" && source !== "static") return false;

  if (source === "panel") {
    if (typeof o.inboundId !== "number" || !Number.isInteger(o.inboundId)) {
      return false;
    }
  } else {
    // static — minimum viable connection params
    if (typeof o.address !== "string" || o.address.length === 0) return false;
    if (typeof o.port !== "number" || !Number.isInteger(o.port)) return false;
    // hysteria2 uses address+port only; vless/reality needs publicKey
    if (o.protocol !== "hysteria2") {
      if (typeof o.publicKey !== "string" || o.publicKey.length === 0)
        return false;
    }
  }
  return true;
}

function parseRegistry(raw: unknown): InboundEntry[] | null {
  let arr: unknown;
  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return null;
    }
  } else {
    arr = raw;
  }
  if (!Array.isArray(arr)) return null;

  const valid = arr.filter(isInboundEntry);
  if (valid.length !== arr.length) {
    console.warn(
      `[inbounds] dropped ${arr.length - valid.length} malformed entries`
    );
  }

  const seen = new Set<string>();
  const deduped: InboundEntry[] = [];
  for (const e of valid) {
    if (seen.has(e.key)) {
      console.warn(`[inbounds] duplicate key '${e.key}' — keeping first`);
      continue;
    }
    seen.add(e.key);
    deduped.push(e);
  }
  return deduped.length > 0 ? deduped : null;
}

export async function getInboundRegistry(): Promise<InboundEntry[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  let entries: InboundEntry[] | null = null;
  try {
    const raw = await redis.get(REGISTRY_KEY);
    entries = parseRegistry(raw);
  } catch (err) {
    console.error("[inbounds] redis read failed, using default", err);
  }

  const data = entries ?? DEFAULT_REGISTRY;
  cache = { at: Date.now(), data };
  return data;
}

export async function getEnabledInbounds(): Promise<InboundEntry[]> {
  const all = await getInboundRegistry();
  return all.filter((e) => e.enabled).sort((a, b) => a.priority - b.priority);
}

export async function getInboundByKey(
  key: string
): Promise<InboundEntry | null> {
  const all = await getInboundRegistry();
  return all.find((e) => e.key === key) ?? null;
}

export async function setInboundRegistry(
  entries: InboundEntry[]
): Promise<void> {
  for (const e of entries) {
    if (!isInboundEntry(e)) {
      throw new Error(`Invalid InboundEntry: ${JSON.stringify(e)}`);
    }
  }
  const keys = new Set(entries.map((e) => e.key));
  if (keys.size !== entries.length) {
    throw new Error("Duplicate keys in registry");
  }
  await redis.set(REGISTRY_KEY, JSON.stringify(entries));
  cache = null;
}

export function invalidateInboundCache(): void {
  cache = null;
}

/**
 * Per-user inbound override. If `inbounds:registry:user:{userId}` exists,
 * use it instead of the global registry. Enables staged rollout: test a new
 * server on one account before flipping it on globally. Falls back to the
 * global registry when no personal registry is set.
 */
export async function getEnabledInboundsForUser(
  userId?: string
): Promise<InboundEntry[]> {
  if (userId) {
    try {
      const raw = await redis.get(`inbounds:registry:user:${userId}`);
      const personal = parseRegistry(raw);
      if (personal) {
        return personal
          .filter((e) => e.enabled)
          .sort((a, b) => a.priority - b.priority);
      }
    } catch (err) {
      console.error("[inbounds] per-user registry read failed", err);
    }
  }
  return getEnabledInbounds();
}
