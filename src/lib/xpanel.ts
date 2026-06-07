// src/lib/xpanel.ts
// 3X-UI panel API client (v3.2.8 / Xray 26.x).
//
// Auth: static API token via `Authorization: Bearer <token>`. v3.2.x added
// CSRF middleware that blocks bare POST /login (HTTP 403); Bearer callers
// skip CSRF entirely, so we never do a cookie/login round-trip.
//
// Client API moved under /panel/api/clients/... in v3.x:
//   add    -> POST /panel/api/clients/add        body { client:{...}, inboundIds:[n] }
//   delete -> POST /panel/api/clients/del/{email}
//   update -> POST /panel/api/clients/update/{email}  body { client:{...}, inboundIds:[n] }
// Inbound list still answers on /xui/api/inbounds/list (kept).
//
// Policy:
// - Every client gets limitIp: 1 so one subscription can't be shared across
//   multiple simultaneous IPs.
// - VLESS URLs are rebuilt per /api/sub request from live inbound config, so
//   panel-side key/SNI/port rotations are picked up without resyncing Redis.
//
// Client identity: we key clients by email (stable, derived from profile),
// and store the VLESS UUID in the `id` field. del/update address the client
// by email in the path.

import { randomBytes } from "crypto";

const PANEL_URL = process.env.XPANEL_URL || "";
const PANEL_TOKEN = process.env.XPANEL_TOKEN || "";

// Public hostname/IP clients connect to for VLESS. Must match the inbound's
// reachable address. Configurable so a provider migration is an env change.
const VPN_HOST = process.env.VPN_SERVER_HOST || "panel.proxysvpn.com";

const LIMIT_IP = 1;

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

function authHeaders(json: boolean): Record<string, string> {
  return {
    Authorization: `Bearer ${PANEL_TOKEN}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

/** GET helper (Bearer). Used for list-type endpoints. */
async function apiGet(fullPath: string) {
  const res = await fetch(`${PANEL_URL}${fullPath}`, {
    method: "GET",
    headers: authHeaders(false),
  });
  const text = await res.text();
  if (!text) throw new Error(`Empty response at ${fullPath}`);
  const data = JSON.parse(text);
  if (!data.success) throw new Error(`API error: ${text.slice(0, 200)}`);
  return data;
}

/** POST helper (Bearer). body optional. */
async function apiPost(fullPath: string, body?: object) {
  const res = await fetch(`${PANEL_URL}${fullPath}`, {
    method: "POST",
    headers: authHeaders(Boolean(body)),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!text) throw new Error(`Empty response at ${fullPath}`);
  const data = JSON.parse(text);
  if (!data.success) throw new Error(`API error: ${text.slice(0, 200)}`);
  return data;
}

export async function listInbounds() {
  return apiGet("/xui/api/inbounds/list");
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

/**
 * Build the client object for clients/add and clients/update. The email
 * doubles as the client key; subId drives the panel sub-link. tgId MUST be a
 * number (Go int64) — sending a string returns "cannot unmarshal".
 */
function buildClientPayload(
  uuid: string,
  email: string,
  expiryTime: number,
  subId: string
) {
  return {
    id: uuid,
    email,
    enable: true,
    flow: "xtls-rprx-vision",
    limitIp: LIMIT_IP,
    totalGB: 0,
    expiryTime,
    subId,
    reset: 0,
    tgId: 0,
    comment: "",
  };
}

/**
 * Add a client to an inbound. v3.2.8 shape:
 *   { client: {...}, inboundIds: [inboundId] }
 * expiryTime: 0 = unlimited, >0 = unix ms.
 * Returns the generated subId so callers can persist it if needed.
 */
export async function addClient(
  inboundId: number,
  email: string,
  uuid: string,
  expiryTime = 0
): Promise<{ subId: string }> {
  const subId = randomBytes(8).toString("hex");
  await apiPost("/panel/api/clients/add", {
    client: buildClientPayload(uuid, email, expiryTime, subId),
    inboundIds: [inboundId],
  });
  inboundCache = null;
  return { subId };
}

/** Resolve a client's email from its VLESS UUID via clients/list. */
async function emailForUuid(uuid: string): Promise<string | null> {
  const res = await apiGet("/panel/api/clients/list");
  const list = (res.obj ?? []) as Array<{ uuid?: string; email?: string }>;
  const hit = list.find((c) => c.uuid === uuid);
  return hit?.email ?? null;
}

/**
 * Delete a client. v3.2.8 deletes by email (del/{email}); del by UUID fails.
 * Callers pass a UUID, so we resolve uuid->email first. Idempotent: if the
 * UUID isn't found (already gone), treat as success.
 */
export async function deleteClient(_inboundId: number, uuid: string) {
  const email = await emailForUuid(uuid);
  if (!email) {
    inboundCache = null;
    return { success: true, msg: "client not found (already deleted)" };
  }
  const result = await apiPost(
    `/panel/api/clients/del/${encodeURIComponent(email)}`
  );
  inboundCache = null;
  return result;
}

/**
 * Update a client's expiry (and re-assert limitIp: 1). v3.2.8 addresses the
 * client by email in the path; body carries the full client object.
 * subId is required by the panel to locate the sub-link record; callers pass
 * the stored subId. If unknown, generate a fresh one (panel re-links it).
 */
export async function updateClientExpiry(
  inboundId: number,
  uuid: string,
  email: string,
  expiryTime: number,
  subId?: string
) {
  const sid = subId && subId.length > 0 ? subId : randomBytes(8).toString("hex");
  const result = await apiPost(
    `/panel/api/clients/update/${encodeURIComponent(email)}`,
    {
      email,
      client: buildClientPayload(uuid, email, expiryTime, sid),
      inboundIds: [inboundId],
    }
  );
  inboundCache = null;
  return result;
}

export function buildVlessUrl(
  uuid: string,
  addr: string,
  port: number,
  sni: string,
  pbk: string,
  sid: string,
  spx: string,
  fp: string,
  encryption: string,
  tag: string,
  flow: string = ""
) {
  const enc =
    encryption && encryption !== "none" ? `&encryption=${encryption}` : "";
  const flowParam = flow && flow.trim() ? `&flow=${flow}` : "";
  return `vless://${uuid}@${addr}:${port}/?type=tcp${enc}&security=reality${flowParam}&pbk=${pbk}&fp=${fp}&sni=${sni}&sid=${sid}&spx=${encodeURIComponent(
    spx
  )}#${encodeURIComponent(tag)}`;
}

/**
 * High-level helper: build a VLESS URL for a UUID from the CURRENT primary
 * inbound config. Fallback path used when the inbound registry is empty.
 */
export async function buildVlessForClient(
  uuid: string,
  tag: string = "Kovra"
): Promise<string> {
  const inbound = await getActiveInbound();
  const stream: any = typeof (inbound.streamSettings as unknown) === "string" ? JSON.parse(inbound.streamSettings || "{}") : (inbound.streamSettings || {});
  const proto: any = typeof (inbound.settings as unknown) === "string" ? JSON.parse(inbound.settings || "{}") : (inbound.settings || {});
  const rs = stream.realitySettings || {};
  const rss = rs.settings || {};

  return buildVlessUrl(
    uuid,
    VPN_HOST,
    inbound.port,
    rs.serverNames?.[0] || "www.samsung.com",
    rss.publicKey || "",
    rs.shortIds?.[0] || "",
    rss.spiderX || "/",
    rss.fingerprint || "chrome",
    proto.encryption || "none",
    tag
  );
}
