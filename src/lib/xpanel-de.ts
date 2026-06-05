// src/lib/xpanel-de.ts
// Standalone 3X-UI client for the secondary DE panel (Aeza Germany).
//
// Why a separate module instead of extending xpanel.ts:
// - xpanel.ts is bound to a single panel via module-level XPANEL_* env and is
//   on the hot path for /sub and /vpn/create. We keep it untouched to avoid
//   regressions on the main NL panel.
// - This module is best-effort: failures to mirror a UUID to DE must never
//   break the primary create flow. All public calls swallow errors and log.
//
// Env contract (set in Vercel):
//   XPANEL2_URL        full panel base incl. secret path, no trailing slash
//                      e.g. http://PANEL_HOST:PORT/SECRET_PATH
//   XPANEL2_USER       panel username
//   XPANEL2_PASS       panel password
//   XPANEL2_INBOUND_ID numeric inbound id on DE panel (default 1)

const DE_URL = process.env.XPANEL2_URL || "";
const DE_USER = process.env.XPANEL2_USER || "";
const DE_PASS = process.env.XPANEL2_PASS || "";
const DE_INBOUND_ID = Number(process.env.XPANEL2_INBOUND_ID || "1");

const LIMIT_IP = 1;

// Session cookie cache. 3X-UI sessions live ~1h; we refresh on 401/parse fail.
let sessionCookie: string | null = null;
let sessionAt = 0;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min, conservative

function configured(): boolean {
  return Boolean(DE_URL && DE_USER && DE_PASS);
}

async function login(): Promise<string> {
  const res = await fetch(`${DE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `username=${encodeURIComponent(DE_USER)}&password=${encodeURIComponent(DE_PASS)}`,
  });
  const cookie = res.headers.get("set-cookie")?.match(/(3x-ui=[^;]+)/)?.[1];
  if (!cookie) throw new Error("DE panel login failed");
  return cookie;
}

async function getSession(force = false): Promise<string> {
  const now = Date.now();
  if (!force && sessionCookie && now - sessionAt < SESSION_TTL_MS) {
    return sessionCookie;
  }
  sessionCookie = await login();
  sessionAt = Date.now();
  return sessionCookie;
}

async function apiCall(fullPath: string, body: object, retry = true): Promise<any> {
  const cookie = await getSession();
  const res = await fetch(`${DE_URL}${fullPath}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // Session expired -> 3X-UI redirects to login (HTML) or returns empty.
  if (!text || text.trimStart().startsWith("<")) {
    if (retry) {
      await getSession(true);
      return apiCall(fullPath, body, false);
    }
    throw new Error(`DE panel: bad response at ${fullPath}`);
  }
  const data = JSON.parse(text);
  if (!data.success) throw new Error(`DE API error: ${text.slice(0, 200)}`);
  return data;
}

/**
 * Add (mirror) a client UUID to the DE inbound. Idempotent-ish: if the client
 * already exists, 3X-UI returns success:false which we treat as non-fatal.
 *
 * Best-effort: returns true on success, false on any failure (never throws).
 */
export async function addClientToDE(
  email: string,
  uuid: string,
  expiryTime = 0,
): Promise<boolean> {
  if (!configured()) return false;
  try {
    await apiCall("/panel/api/inbounds/addClient", {
      id: DE_INBOUND_ID,
      settings: JSON.stringify({
        clients: [
          { id: uuid, email, enable: true, flow: "xtls-rprx-vision", totalGB: 0, expiryTime, limitIp: LIMIT_IP },
        ],
      }),
    });
    return true;
  } catch (err) {
    // Duplicate client or transient panel error -> log, don't break create flow.
    console.error(`[xpanel-de] addClientToDE failed for ${email}/${uuid}:`, (err as Error).message);
    return false;
  }
}

export function isDEConfigured(): boolean {
  return configured();
}
