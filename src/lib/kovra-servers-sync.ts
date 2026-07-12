// lib/kovra-servers-sync.ts
// Realtime UUID-синк в Kovra-инбаунды (id=2) на общих Proxys-панелях.
// Два поколения панелей (контракты сверены live-тестами DE/UK + исходник v3.4.2):
//  modern (Bearer):  add    POST /panel/api/clients/add {client:{...},inboundIds:[id]}
//                    del    POST /panel/api/clients/del/:email
//                    update POST /panel/api/clients/update/:email?inboundIds=id (bare Client)
//  legacy (cookie):  add    POST /panel/api/inbounds/addClient {id,settings:"{clients:[...]}"}
//                    del    POST /panel/api/inbounds/:id/delClient/:uuid
//                    update POST /panel/api/inbounds/updateClient/:uuid {id,settings}
// Тип панели: token => modern, username+password => legacy.
// Рестарт Xray НЕ дёргаем (моргает Proxys-клиентов той же панели).
// Fail-soft: не бросает, возвращает per-panel результаты. Node runtime only.

import { setTimeout as sleep } from "node:timers/promises";

export interface StaticPanel {
  key: string;       // "de" | "uk" | "ams"
  url: string;       // публичный base с web-путём, без хвостового /
  inboundId: number; // Kovra-инбаунд (сейчас 2)
  token?: string;    // modern: Bearer API token
  username?: string; // legacy: cookie login
  password?: string;
}

export interface KovraClientSpec {
  uuid: string;
  email: string;         // будет префикснут kovra_
  subId: string;         // будет префикснут kovra_
  expiryTimeMs?: number; // 0 = never
  totalBytes?: number;   // поле totalGB, в БАЙТАХ; 0 = unlimited
  tgId?: number;
  flow?: string;
}

export interface PanelSyncResult {
  key: string;
  ok: boolean;
  status: number;
  error?: string;
}

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;
const KOVRA_PREFIX = "kovra_";
const COOKIE_TTL_MS = 10 * 60_000;
const FLOW_DEFAULT = "xtls-rprx-vision";

type OpResult = { ok: boolean; status: number; error?: string; retryable: boolean };
type RawReply = { status: number; json: any; setCookies: string[] };

let cachedPanels: StaticPanel[] | null = null;
const cookieJar = new Map<string, { cookie: string; exp: number }>();

export function getStaticPanels(): StaticPanel[] {
  if (cachedPanels) return cachedPanels;
  const raw = process.env.KOVRA_STATIC_PANELS?.trim();
  if (!raw) return (cachedPanels = []);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error("not an array");
    cachedPanels = parsed
      .map((p) => p as Partial<StaticPanel>)
      .filter((p): p is StaticPanel => {
        const base =
          typeof p.key === "string" &&
          typeof p.url === "string" &&
          Number.isInteger(p.inboundId);
        const modern = typeof p.token === "string" && p.token.length > 0;
        const legacy =
          typeof p.username === "string" && typeof p.password === "string";
        if (!(base && (modern || legacy))) {
          console.error("[kovra-sync] skip invalid panel entry:", p?.key);
          return false;
        }
        return true;
      })
      .map((p) => ({ ...p, url: p.url.replace(/\/+$/, "") }));
  } catch (err) {
    console.error("[kovra-sync] invalid KOVRA_STATIC_PANELS:", (err as Error).message);
    cachedPanels = [];
  }
  return cachedPanels;
}

function isModern(p: StaticPanel): boolean {
  return typeof p.token === "string" && p.token.length > 0;
}

function ensurePrefix(v: string): string {
  return v.startsWith(KOVRA_PREFIX) ? v : KOVRA_PREFIX + v;
}

async function rawFetch(
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<RawReply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* не JSON (HTML логин-страницы и т.п.) */
    }
    const anyHeaders = res.headers as any;
    const setCookies: string[] =
      typeof anyHeaders.getSetCookie === "function"
        ? anyHeaders.getSetCookie()
        : res.headers.get("set-cookie")
          ? [res.headers.get("set-cookie") as string]
          : [];
    return { status: res.status, json, setCookies };
  } finally {
    clearTimeout(timer);
  }
}

async function legacyLogin(panel: StaticPanel, force = false): Promise<string> {
  const hit = cookieJar.get(panel.key);
  if (!force && hit && hit.exp > Date.now()) return hit.cookie;
  const form = new URLSearchParams({
    username: panel.username ?? "",
    password: panel.password ?? "",
  });
  const r = await rawFetch(`${panel.url}/login`, {
    "Content-Type": "application/x-www-form-urlencoded",
  }, form.toString());
  const cookie = r.setCookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  if (r.status !== 200 || r.json?.success !== true || !cookie) {
    cookieJar.delete(panel.key);
    throw new Error(`legacy login failed: http=${r.status} msg=${r.json?.msg ?? "?"}`);
  }
  cookieJar.set(panel.key, { cookie, exp: Date.now() + COOKIE_TTL_MS });
  return cookie;
}

/** Запрос к панели с авторизацией по её типу. Legacy: один авто-релогин. */
async function panelRequest(
  panel: StaticPanel,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (isModern(panel)) {
    const r = await rawFetch(`${panel.url}${path}`, {
      Authorization: `Bearer ${panel.token}`,
      "Content-Type": "application/json",
    }, payload);
    return { status: r.status, json: r.json };
  }
  let cookie = await legacyLogin(panel);
  const headers = () => ({
    Cookie: cookie,
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  });
  let r = await rawFetch(`${panel.url}${path}`, headers(), payload);
  const authExpired = r.status === 401 || (r.status === 200 && r.json === null);
  if (authExpired) {
    cookie = await legacyLogin(panel, true);
    r = await rawFetch(`${panel.url}${path}`, headers(), payload);
  }
  return { status: r.status, json: r.json };
}

function isRetryable(status: number): boolean {
  return status === 0 || status === 429 || status >= 500;
}

async function withRetry(panel: StaticPanel, op: () => Promise<OpResult>): Promise<PanelSyncResult> {
  let last: OpResult = { ok: false, status: 0, error: "no attempt", retryable: false };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      last = await op();
    } catch (err) {
      last = { ok: false, status: 0, error: (err as Error).message, retryable: true };
    }
    if (last.ok || !last.retryable) break;
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BASE_DELAY_MS * attempt);
  }
  return { key: panel.key, ok: last.ok, status: last.status, error: last.ok ? undefined : last.error };
}

function classify(status: number, json: any, okPatterns: RegExp): OpResult {
  if (status >= 200 && status < 300 && json?.success !== false) {
    return { ok: true, status, retryable: false };
  }
  const msg = String(json?.msg ?? `http ${status}`);
  if (okPatterns.test(msg)) return { ok: true, status, retryable: false };
  return { ok: false, status, error: msg, retryable: isRetryable(status) };
}

function modernClient(spec: KovraClientSpec, email: string) {
  return {
    id: spec.uuid,
    email,
    subId: ensurePrefix(spec.subId),
    flow: spec.flow ?? FLOW_DEFAULT,
    enable: true,
    limitIp: 0,
    totalGB: spec.totalBytes ?? 0,
    expiryTime: spec.expiryTimeMs ?? 0,
    tgId: spec.tgId ?? 0,
    comment: "",
    reset: 0,
  };
}

function legacySettings(spec: KovraClientSpec, email: string): string {
  return JSON.stringify({
    clients: [{
      id: spec.uuid,
      flow: spec.flow ?? FLOW_DEFAULT,
      email,
      limitIp: 0,
      totalGB: spec.totalBytes ?? 0,
      expiryTime: spec.expiryTimeMs ?? 0,
      enable: true,
      subId: ensurePrefix(spec.subId),
      reset: 0,
    }],
  });
}

function logFailures(op: string, ident: string, results: PanelSyncResult[]) {
  for (const r of results) {
    if (!r.ok) {
      console.error(`[kovra-sync] ${op} FAIL panel=${r.key} ${ident} status=${r.status} err=${r.error}`);
    }
  }
}

const DUP_OK = /already in use|duplicate/i;
const GONE_OK = /not.*found|no.*client|record not found/i;

/** Добавляет клиента во все панели. Best-effort, идемпотентно, не бросает. */
export async function addClientToStaticPanels(spec: KovraClientSpec): Promise<PanelSyncResult[]> {
  const panels = getStaticPanels();
  if (panels.length === 0) return [];
  const email = ensurePrefix(spec.email);
  const results = await Promise.all(
    panels.map((panel) =>
      withRetry(panel, async () => {
        const { status, json } = isModern(panel)
          ? await panelRequest(panel, "/panel/api/clients/add", {
              client: modernClient(spec, email),
              inboundIds: [panel.inboundId],
            })
          : await panelRequest(panel, "/panel/api/inbounds/addClient", {
              id: panel.inboundId,
              settings: legacySettings(spec, email),
            });
        return classify(status, json, DUP_OK);
      }),
    ),
  );
  logFailures("add", `email=${email}`, results);
  return results;
}

/** Удаляет клиента со всех панелей (legacy - по uuid, modern - по email). Идемпотентно. */
export async function removeClientFromStaticPanels(uuid: string, rawEmail: string): Promise<PanelSyncResult[]> {
  const panels = getStaticPanels();
  if (panels.length === 0) return [];
  const email = ensurePrefix(rawEmail);
  const enc = encodeURIComponent(email);
  const results = await Promise.all(
    panels.map((panel) =>
      withRetry(panel, async () => {
        const { status, json } = isModern(panel)
          ? await panelRequest(panel, `/panel/api/clients/del/${enc}`)
          : await panelRequest(panel, `/panel/api/inbounds/${panel.inboundId}/delClient/${uuid}`);
        return classify(status, json, GONE_OK);
      }),
    ),
  );
  logFailures("del", `email=${email} uuid=${uuid}`, results);
  return results;
}

/** Обновляет expiry/quota/enable на всех панелях (продление без пересоздания). */
export async function updateClientOnStaticPanels(spec: KovraClientSpec): Promise<PanelSyncResult[]> {
  const panels = getStaticPanels();
  if (panels.length === 0) return [];
  const email = ensurePrefix(spec.email);
  const enc = encodeURIComponent(email);
  const results = await Promise.all(
    panels.map((panel) =>
      withRetry(panel, async () => {
        const { status, json } = isModern(panel)
          ? await panelRequest(
              panel,
              `/panel/api/clients/update/${enc}?inboundIds=${panel.inboundId}`,
              modernClient(spec, email),
            )
          : await panelRequest(panel, `/panel/api/inbounds/updateClient/${spec.uuid}`, {
              id: panel.inboundId,
              settings: legacySettings(spec, email),
            });
        return classify(status, json, GONE_OK);
      }),
    ),
  );
  logFailures("update", `email=${email}`, results);
  return results;
}
