// src/lib/xpanel.ts
// 3X-UI panel API client.
//
// Policy notes:
// - Every client is created/updated with limitIp: 1 so one subscription
//   cannot be used from multiple IPs simultaneously (prevents sharing).
// - VLESS URLs are rebuilt on every /api/sub/[token] request using the
//   current inbound config, so changes on the panel side (encryption,
//   publicKey, shortId, serverName, port) are picked up automatically
//   without needing to resync stored URLs in Redis.

const PANEL_URL = process.env.XPANEL_URL || "";
const PANEL_USER = process.env.XPANEL_USER || "";
const PANEL_PASS = process.env.XPANEL_PASS || "";

// The public hostname (or IP) clients connect to for VLESS. Must match the
// cert/SNI config on the server. Configurable via env so we never hard-code
// an IP that may change on provider migrations.
const VPN_HOST = process.env.VPN_SERVER_HOST || "panel.proxysvpn.com";

const LIMIT_IP = 1;

// In-memory TTL cache for the active inbound config. Shared between /sub and
// /vpn/create handlers on warm serverless instances. Also dedupes concurrent
// fetches so a burst of sub requests doesn't hammer the panel.
interface Inbound {
  id: number;
  port: number;
  remark: string;
  protocol: string;
  settings: string;
  streamSettings: string;
}
const INBOUND_TTL_MS = 10_000;
let inboundCache: { at: number; data: Inbound } | null = null;
let inboundFetchInflight: Promise<Inbound> | null = null;

async function getSession(): Promise<string> {
  const res = await fetch(`${PANEL_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `username=${encodeURIComponent(PANEL_USER)}&password=${encodeURIComponent(PANEL_PASS)}`,
  });
  const cookie = res.headers.get("set-cookie")?.match(/(3x-ui=[^;]+)/)?.[1];
  if (!cookie) throw new Error("3X-UI login failed");
  return cookie;
}

async function apiCall(fullPath: string, body?: object) {
  const cookie = await getSession();
  const res = await fetch(`${PANEL_URL}${fullPath}`, {
    method: "POST",
    headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!text) throw new Error(`Empty response at ${fullPath}`);
  const data = JSON.parse(text);
  if (!data.success) throw new Error(`API error: ${text.slice(0, 200)}`);
  return data;
}

export async function listInbounds() {
  return apiCall("/xui/api/inbounds/list");
}

/**
 * Return the first inbound, cached for INBOUND_TTL_MS. Concurrent callers
 * share a single inflight fetch.
 */
export async function getActiveInbound(): Promise<Inbound> {
  const now = Date.now();
  if (inboundCache && now - inboundCache.at < INBOUND_TTL_MS) {
    return inboundCache.data;
  }
  if (inboundFetchInflight) return inboundFetchInflight;

  inboundFetchInflight = (async () => {
    try {
      const res = await listInbounds();
      const inbound = res.obj?.[0] as Inbound | undefined;
      if (!inbound) throw new Error("No inbound configured");
      inboundCache = { at: Date.now(), data: inbound };
      return inbound;
    } finally {
      inboundFetchInflight = null;
    }
  })();
  return inboundFetchInflight;
}

export async function addClient(inboundId: number, email: string, uuid: string, expiryTime = 0) {
  // expiryTime: 0 = unlimited, >0 = timestamp ms
  const result = await apiCall("/panel/api/inbounds/addClient", {
    id: inboundId,
    settings: JSON.stringify({
      clients: [{ id: uuid, email, enable: true, flow: "", totalGB: 0, expiryTime, limitIp: LIMIT_IP }],
    }),
  });
  // The inbound client-count changed; invalidate cache so next read reflects it.
  inboundCache = null;
  return result;
}

export async function deleteClient(inboundId: number, uuid: string) {
  const result = await apiCall(`/panel/api/inbounds/${inboundId}/delClient/${uuid}`, {});
  inboundCache = null;
  return result;
}

export async function updateClientExpiry(inboundId: number, uuid: string, email: string, expiryTime: number) {
  // Also enforces limitIp: 1 — this is our only touch-point for existing
  // clients, so legacy profiles (created without limitIp) gradually pick up
  // the new limit whenever their expiry is synced after a create/delete.
  return apiCall(`/panel/api/inbounds/updateClient/${uuid}`, {
    id: inboundId,
    settings: JSON.stringify({
      clients: [{ id: uuid, email, enable: true, flow: "", totalGB: 0, expiryTime, limitIp: LIMIT_IP }],
    }),
  });
}

export function buildVlessUrl(uuid: string, addr: string, port: number, sni: string, pbk: string, sid: string, spx: string, fp: string, encryption: string, tag: string, flow: string = "") {
  const enc = encryption && encryption !== "none" ? `&encryption=${encryption}` : "";
  const flowParam = flow && flow.trim() ? `&flow=${flow}` : "";
  return `vless://${uuid}@${addr}:${port}/?type=tcp${enc}&security=reality${flowParam}&pbk=${pbk}&fp=${fp}&sni=${sni}&sid=${sid}&spx=${encodeURIComponent(spx)}#${encodeURIComponent(tag)}`;
}

/**
 * High-level helper: build a VLESS URL for a client UUID using the
 * CURRENT inbound config (fetched fresh / cached). This is what the
 * /api/sub/[token] handler should use so clients always get a working
 * URL even after the panel admin rotates keys, changes SNI/port, or
 * switches the encryption scheme (e.g. none → mlkem768x25519plus).
 */
export async function buildVlessForClient(uuid: string, tag: string = "proxysvpn.com"): Promise<string> {
  const inbound = await getActiveInbound();
  const stream = JSON.parse(inbound.streamSettings);
  const proto = JSON.parse(inbound.settings || "{}");
  const rs = stream.realitySettings || {};
  const rss = rs.settings || {};

  return buildVlessUrl(
    uuid,
    VPN_HOST,
    inbound.port,
    rs.serverNames?.[0] || "www.intel.com",
    rss.publicKey || "",
    rs.shortIds?.[0] || "",
    rss.spiderX || "/",
    rss.fingerprint || "chrome",
    proto.encryption || "none",
    tag
  );
}
