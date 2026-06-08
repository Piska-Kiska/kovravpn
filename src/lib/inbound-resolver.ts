// src/lib/inbound-resolver.ts
/**
 * Resolves connection parameters for an inbound entry from either:
 *   - the 3X-UI panel this Vercel instance has API creds for (source=panel)
 *   - static config embedded in the registry (source=static), used for
 *     external servers Vercel cannot reach (private 3X-UI panels)
 *
 * Returns a unified ConnectionParams shape so callers (vless URL builder,
 * xray JSON generator) don't branch on source themselves.
 *
 * Caches panel.listInbounds() for 10s — a single subscription request that
 * resolves multiple panel-sourced inbounds shares one round-trip.
 */
import { listInbounds } from "./xpanel";
import { sanitizeField } from "./xpanel-multi";
import type { InboundEntry } from "./inbounds";

const VPN_HOST = process.env.VPN_HOST ?? "panel.proxysvpn.com";

export interface ConnectionParams {
  address: string;
  port: number;
  serverName: string;
  publicKey: string;
  shortId: string;
  spiderX: string;
  fingerprint: string;
  encryption: string;
  flow: string;
}

interface PanelInbound {
  id: number;
  port: number;
  streamSettings: string;
  settings?: string;
}

interface PanelClient {
  id?: unknown;
  flow?: unknown;
}

let cache: { at: number; data: PanelInbound[] } | null = null;
const CACHE_TTL_MS = 10_000;

async function fetchPanelInbounds(): Promise<PanelInbound[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  const res = await listInbounds();
  const result = (res?.obj ?? []) as PanelInbound[];
  cache = { at: Date.now(), data: result };
  return result;
}

export function invalidateResolverCache(): void {
  cache = null;
}

async function resolveFromPanel(
  uuid: string,
  entry: InboundEntry
): Promise<ConnectionParams | null> {
  if (typeof entry.inboundId !== "number") {
    console.warn(
      `[resolver] entry key=${entry.key} missing inboundId for source=panel`
    );
    return null;
  }

  const all = await fetchPanelInbounds();
  const inbound = all.find((i) => i.id === entry.inboundId);
  if (!inbound) {
    console.warn(
      `[resolver] panel inbound id=${entry.inboundId} key=${entry.key} missing`
    );
    return null;
  }

  let stream: Record<string, unknown>;
  let proto: Record<string, unknown>;
  try {
    stream =
      typeof (inbound.streamSettings as unknown) === "string"
        ? JSON.parse(inbound.streamSettings || "{}")
        : ((inbound.streamSettings as unknown as Record<string, unknown>) ?? {});
    proto =
      typeof (inbound.settings as unknown) === "string"
        ? JSON.parse(inbound.settings ?? "{}")
        : ((inbound.settings as unknown as Record<string, unknown>) ?? {});
  } catch (err) {
    console.error(
      `[resolver] malformed JSON for inbound ${entry.inboundId}`,
      err instanceof Error ? err.message : err
    );
    return null;
  }

  const rs = (stream.realitySettings ?? {}) as Record<string, unknown>;
  const rss = (rs.settings ?? {}) as Record<string, unknown>;

  const clients: PanelClient[] = Array.isArray(proto.clients)
    ? (proto.clients as PanelClient[])
    : [];
  const client = clients.find((c) => c && c.id === uuid);
  const flow =
    client && typeof client.flow === "string"
      ? sanitizeField(client.flow)
      : "";

  return {
    address: VPN_HOST,
    port: inbound.port,
    serverName:
      Array.isArray(rs.serverNames) && rs.serverNames.length > 0
        ? sanitizeField(rs.serverNames[0])
        : "www.intel.com",
    publicKey: sanitizeField(rss.publicKey),
    shortId:
      Array.isArray(rs.shortIds) && rs.shortIds.length > 0
        ? sanitizeField(rs.shortIds[0])
        : "",
    spiderX: sanitizeField(rss.spiderX) || "/",
    fingerprint: sanitizeField(rss.fingerprint) || "chrome",
    encryption: sanitizeField(proto.encryption) || "none",
    flow,
  };
}

function resolveFromStatic(entry: InboundEntry): ConnectionParams | null {
  if (!entry.address || !entry.port || !entry.publicKey) {
    console.warn(
      `[resolver] static entry key=${entry.key} missing required fields`
    );
    return null;
  }
  return {
    address: entry.address,
    port: entry.port,
    serverName: entry.serverName ?? "www.intel.com",
    publicKey: entry.publicKey,
    shortId: entry.shortId ?? "",
    spiderX: entry.spiderX ?? "/",
    fingerprint: entry.fingerprint ?? "chrome",
    encryption: entry.encryption ?? "none",
    flow: entry.flow ?? "",
  };
}

export async function resolveInbound(
  uuid: string,
  entry: InboundEntry
): Promise<ConnectionParams | null> {
  const source = entry.source ?? "panel";
  if (source === "static") return resolveFromStatic(entry);
  return resolveFromPanel(uuid, entry);
}
