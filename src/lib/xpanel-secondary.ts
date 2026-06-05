// src/lib/xpanel-secondary.ts
//
// Secondary 3X-UI panel client. Mirrors writes (addClient/deleteClient/
// updateClientExpiry) to a second server so subscribers can connect to
// any inbound listed in inbounds:registry.
//
// Reads ENV with _2 suffix:
//   XPANEL_URL_2, XPANEL_USER_2, XPANEL_PASS_2, XPANEL_INBOUND_ID_2
//
// All functions are no-ops when XPANEL_URL_2 is empty (graceful disable
// during local dev or when the secondary server is offline). A 5s timeout
// guards against the secondary hanging primary user-facing requests.

const URL2 = process.env.XPANEL_URL_2 || "";
const USER2 = process.env.XPANEL_USER_2 || "";
const PASS2 = process.env.XPANEL_PASS_2 || "";
const SECONDARY_INBOUND_ID = Number(process.env.XPANEL_INBOUND_ID_2 || "1");

const TIMEOUT_MS = 5_000;
const LIMIT_IP = 1;

export function isSecondaryEnabled(): boolean {
  return !!(URL2 && USER2 && PASS2);
}

export function getSecondaryInboundId(): number {
  return SECONDARY_INBOUND_ID;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function getSession2(): Promise<string> {
  const res = await fetchWithTimeout(`${URL2}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `username=${encodeURIComponent(USER2)}&password=${encodeURIComponent(PASS2)}`,
  });
  const cookie = res.headers.get("set-cookie")?.match(/(3x-ui=[^;]+)/)?.[1];
  if (!cookie) throw new Error("secondary 3X-UI login failed");
  return cookie;
}

async function apiCall2(fullPath: string, body?: object) {
  const cookie = await getSession2();
  const res = await fetchWithTimeout(`${URL2}${fullPath}`, {
    method: "POST",
    headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!text) throw new Error(`secondary empty response at ${fullPath}`);
  const data = JSON.parse(text);
  if (!data.success) throw new Error(`secondary API error: ${text.slice(0, 200)}`);
  return data;
}

export async function addClient2(email: string, uuid: string, expiryTime = 0) {
  if (!isSecondaryEnabled()) return null;
  return apiCall2("/panel/api/inbounds/addClient", {
    id: SECONDARY_INBOUND_ID,
    settings: JSON.stringify({
      clients: [{ id: uuid, email, enable: true, flow: "", totalGB: 0, expiryTime, limitIp: LIMIT_IP }],
    }),
  });
}

export async function deleteClient2(uuid: string) {
  if (!isSecondaryEnabled()) return null;
  return apiCall2(`/panel/api/inbounds/${SECONDARY_INBOUND_ID}/delClient/${uuid}`, {});
}

export async function updateClientExpiry2(uuid: string, email: string, expiryTime: number) {
  if (!isSecondaryEnabled()) return null;
  return apiCall2(`/panel/api/inbounds/updateClient/${uuid}`, {
    id: SECONDARY_INBOUND_ID,
    settings: JSON.stringify({
      clients: [{ id: uuid, email, enable: true, flow: "", totalGB: 0, expiryTime, limitIp: LIMIT_IP }],
    }),
  });
}
