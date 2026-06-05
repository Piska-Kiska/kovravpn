// src/lib/xray-subscription.ts
/**
 * Multi-profile Xray subscription generator.
 *
 * For each user UUID, builds:
 *   1. An "Auto" profile — balancer + observatory across all enabled
 *      servers, leastPing strategy. Single best-latency outbound at a time.
 *   2. One per-server profile pinning a specific outbound (so a user can
 *      manually force VDsina or Aeza when needed).
 *
 * Every profile carries the same RU split-tunneling rules:
 *   - geoip:private, geosite:category-ru, geoip:ru → direct
 *   - everything else → proxy/balancer
 *
 * When only one server is enabled, returns just its single profile (no
 * balancer is meaningful with a single backend). When none enabled,
 * returns empty array — caller should fall back to legacy vless format.
 */
import { getEnabledInbounds, getEnabledInboundsForUser, type InboundEntry } from "./inbounds";
import { resolveInbound, type ConnectionParams } from "./inbound-resolver";

interface VlessUser {
  id: string;
  encryption: string;
  flow?: string;
}

interface VlessOutbound {
  tag: string;
  protocol: "vless";
  settings: {
    vnext: Array<{ address: string; port: number; users: VlessUser[] }>;
  };
  streamSettings: {
    network: "tcp";
    security: "reality";
    realitySettings: {
      serverName: string;
      fingerprint: string;
      publicKey: string;
      shortId: string;
      spiderX: string;
    };
  };
}

export interface XrayConfig {
  remarks: string;
  log: { loglevel: string };
  dns: { servers: Array<unknown>; queryStrategy: string };
  inbounds: Array<unknown>;
  outbounds: Array<unknown>;
  observatory?: {
    subjectSelector: string[];
    probeUrl: string;
    probeInterval: string;
  };
  routing: {
    domainStrategy: string;
    balancers?: Array<{
      tag: string;
      selector: string[];
      strategy: { type: string };
    }>;
    rules: Array<unknown>;
  };
}

const SOCKS_INBOUND = {
  tag: "socks-in",
  port: 10808,
  listen: "127.0.0.1",
  protocol: "socks",
  settings: { udp: true, auth: "noauth" },
  sniffing: { enabled: true, destOverride: ["http", "tls"] },
};

const HTTP_INBOUND = {
  tag: "http-in",
  port: 10809,
  listen: "127.0.0.1",
  protocol: "http",
};

const DNS_CONFIG = {
  servers: [
    { address: "1.1.1.1", domains: ["geosite:geolocation-!cn"] },
    { address: "77.88.8.8", domains: ["geosite:category-ru", "geosite:cn"] },
    "77.88.8.8",
  ],
  queryStrategy: "UseIPv4",
};

const SPLIT_RULES_PREFIX = [
  { type: "field", ip: ["geoip:private"], outboundTag: "direct" },
  { type: "field", domain: ["geosite:category-ru"], outboundTag: "direct" },
  { type: "field", ip: ["geoip:ru"], outboundTag: "direct" },
];

function buildHysteria2Uri(uuid: string, entry: InboundEntry): string {
  const host = entry.address;
  const port = entry.port ?? 443;
  const sni = entry.hy2Sni ?? "www.bing.com";
  const label = makeRemarks(entry);
  const params: Record<string, string> = { sni };
  // Modern Xray cores removed allowInsecure; pin the self-signed cert by SHA256.
  // Fall back to insecure only if no pin is configured (legacy cores).
  if (entry.hy2Pin) params.pinSHA256 = entry.hy2Pin;
  else params.insecure = entry.hy2Insecure === false ? "0" : "1";
  const q = new URLSearchParams(params);
  return `hy2://${encodeURIComponent(uuid)}@${host}:${port}/?${q.toString()}#${encodeURIComponent(label)}`;
}

function buildVlessOutbound(
  uuid: string,
  tag: string,
  p: ConnectionParams
): VlessOutbound {
  const user: VlessUser = { id: uuid, encryption: p.encryption };
  if (p.flow) user.flow = p.flow;
  return {
    tag,
    protocol: "vless",
    settings: {
      vnext: [{ address: p.address, port: p.port, users: [user] }],
    },
    streamSettings: {
      network: "tcp",
      security: "reality",
      realitySettings: {
        serverName: p.serverName,
        fingerprint: p.fingerprint,
        publicKey: p.publicKey,
        shortId: p.shortId,
        spiderX: p.spiderX,
      },
    },
  };
}

function makeRemarks(entry: InboundEntry): string {
  const flag = entry.flag ? `${entry.flag} ` : "";
  return `${flag}${entry.label}`.trim();
}

function buildSingleConfig(
  uuid: string,
  entry: InboundEntry,
  params: ConnectionParams
): XrayConfig {
  return {
    remarks: makeRemarks(entry),
    log: { loglevel: "warning" },
    dns: DNS_CONFIG,
    inbounds: [SOCKS_INBOUND, HTTP_INBOUND],
    outbounds: [
      buildVlessOutbound(uuid, "proxy", params),
      { tag: "direct", protocol: "freedom", settings: {} },
      { tag: "block", protocol: "blackhole", settings: {} },
    ],
    routing: {
      domainStrategy: "IPIfNonMatch",
      rules: [
        ...SPLIT_RULES_PREFIX,
        { type: "field", port: "0-65535", outboundTag: "proxy" },
      ],
    },
  };
}

function buildBalancerConfig(
  uuid: string,
  resolved: Array<{ entry: InboundEntry; params: ConnectionParams }>
): XrayConfig {
  const outbounds: Array<VlessOutbound | Record<string, unknown>> = [];
  const tags: string[] = [];

  for (const { entry, params } of resolved) {
    const tag = `proxy-${entry.key}`;
    tags.push(tag);
    outbounds.push(buildVlessOutbound(uuid, tag, params));
  }
  outbounds.push({ tag: "direct", protocol: "freedom", settings: {} });
  outbounds.push({ tag: "block", protocol: "blackhole", settings: {} });

  return {
    remarks: "🌐 Автовыбор",
    log: { loglevel: "warning" },
    dns: DNS_CONFIG,
    inbounds: [SOCKS_INBOUND, HTTP_INBOUND],
    outbounds,
    observatory: {
      subjectSelector: ["proxy"],
      probeUrl: "https://www.google.com/generate_204",
      probeInterval: "15s",
    },
    routing: {
      domainStrategy: "IPIfNonMatch",
      balancers: [
        {
          tag: "vpn-balancer",
          selector: tags,
          strategy: { type: "leastPing" },
        },
      ],
      rules: [
        ...SPLIT_RULES_PREFIX,
        { type: "field", port: "0-65535", balancerTag: "vpn-balancer" },
      ],
    },
  };
}

/**
 * Build all profiles for one UUID. Order in returned array:
 *   [0] balancer (only if 2+ servers enabled)
 *   [1..N] per-server, sorted by priority
 */
export async function buildAllProfilesForUuid(
  uuid: string,
  userId?: string
): Promise<Array<XrayConfig | string>> {
  const enabled = await getEnabledInboundsForUser(userId);
  if (enabled.length === 0) return [];

  // Split by protocol: hysteria2 entries become hy2:// URI strings
  // (separate sing-box engine, not part of xray balancer / JSON configs).
  const hy2Entries = enabled.filter((e) => e.protocol === "hysteria2");
  const vlessEntries = enabled.filter((e) => e.protocol !== "hysteria2");

  const resolved: Array<{ entry: InboundEntry; params: ConnectionParams }> = [];
  for (const entry of vlessEntries) {
    const params = await resolveInbound(uuid, entry);
    if (params) resolved.push({ entry, params });
  }

  const profiles: Array<XrayConfig | string> = [];

  // Hysteria2 profiles first (primary, listed at top)
  for (const entry of hy2Entries) {
    if (!entry.address) continue;
    profiles.push(buildHysteria2Uri(uuid, entry));
  }

  // Balancer only across vless servers (xray-core engine)
  if (resolved.length >= 2) {
    profiles.push(buildBalancerConfig(uuid, resolved));
  }
  for (const r of resolved) {
    profiles.push(buildSingleConfig(uuid, r.entry, r.params));
  }

  if (profiles.length === 0) return [];
  return profiles;
}

/** Backward-compat single-profile entry point (still used by callers
 *  that need exactly one config; returns the first profile). */
export async function buildXrayConfigForUuid(
  uuid: string
): Promise<XrayConfig | null> {
  const profiles = await buildAllProfilesForUuid(uuid);
  const firstObj = profiles.find((p) => typeof p !== "string");
  return (firstObj as XrayConfig | undefined) ?? null;
}
