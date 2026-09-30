// src/app/tg/miniapp-fetch.ts
//
// Mini App sign-in and the Bearer session on every request of the cabinet.
//
// WHY A WRAPPER AROUND window.fetch. The cabinet is DashboardView plus a dozen
// components (LinkAccounts, QR, promo, wallet…), each calling fetch itself;
// on the site the `sid` cookie is enough. Inside web.telegram.org the cabinet
// is a cross-origin iframe whose cookies browsers do not keep, and inside the
// apps one webview may be shared by two Telegram accounts, so the session goes
// in `Authorization: Bearer` instead (lib/session.ts prefers it and never
// falls back to the cookie). The wrapper is installed on /tg only, while the
// shell is mounted, and touches only same-origin `/api/` requests.
//
// Rules for such a request:
//   • cookies are never sent (`credentials: "omit"`): a `sid` left by the
//     site or by another Telegram account must not answer for this page;
//   • with no token yet, sign in first; the request never goes out bare;
//   • a 401 exchanges initData for a new session ONCE and repeats the request
//     once; a second 401 is a real refusal: `onAuthLost` fires and the caller
//     gets the 401.
//
// Contract with POST /api/auth/telegram/miniapp:
//   { initData } → 200 { ok: true, token, userId, lang?, startParam? } | 4xx/5xx

export const MINIAPP_LOGIN_PATH = "/api/auth/telegram/miniapp";

/**
 * The token survives a reload of this window (sessionStorage lives exactly as
 * long as the Mini App window). It is stored with the Telegram user id it
 * belongs to and ignored for anyone else.
 */
export const TOKEN_STORAGE_KEY = "kovra_tg_sid";

const SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the last successful sign-in said besides the token. */
export interface MiniAppLoginInfo {
  readonly userId: string;
  /** The account's language (the bot's), or null. */
  readonly lang: string | null;
  readonly isNewUser: boolean;
}

/**
 * ok — signed in; refused — the server answered and said no (initData
 * expired, forged, rate limited, not configured); offline — no answer at all.
 */
export type LoginResult = "ok" | "refused" | "offline";

export interface MiniAppAuth {
  /** Current session token; null before the first sign-in or after reset(). */
  readonly token: string | null;
  /** Filled by a sign-in in this page view (not by a token restored from storage). */
  readonly info: MiniAppLoginInfo | null;
  /** Exchange initData for a session. Concurrent calls share one request. */
  login(): Promise<LoginResult>;
  /** Forget the token (before a retry after an error). */
  reset(): void;
}

interface StoredToken {
  uid: string;
  token: string;
}

function readStoredToken(uid: string | null): string | null {
  if (!uid) return null;
  try {
    const raw = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null) return null;
    const s = v as Partial<StoredToken>;
    return s.uid === uid && typeof s.token === "string" && SID_RE.test(s.token) ? s.token : null;
  } catch {
    return null;
  }
}

function writeStoredToken(uid: string | null, token: string | null): void {
  try {
    if (token && uid) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ uid, token } satisfies StoredToken));
    else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Without storage the token lives in memory until a reload; then a new sign-in.
  }
}

function parseLogin(v: unknown): { token: string; info: MiniAppLoginInfo } | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.ok !== true || typeof o.token !== "string" || !SID_RE.test(o.token) || typeof o.userId !== "string") return null;
  return {
    token: o.token,
    info: { userId: o.userId, lang: typeof o.lang === "string" ? o.lang : null, isNewUser: o.isNewUser === true },
  };
}

/**
 * @param getInitData  the signed initData of this window ("" outside Telegram)
 * @param telegramUserId  `initDataUnsafe.user.id` as a string, only to key the
 *                        stored token (the server trusts the signature, not this)
 */
export function createMiniAppAuth(getInitData: () => string, nativeFetch: typeof fetch, telegramUserId: string | null): MiniAppAuth {
  let token: string | null = readStoredToken(telegramUserId);
  let info: MiniAppLoginInfo | null = null;
  let inflight: Promise<LoginResult> | null = null;

  const doLogin = async (): Promise<LoginResult> => {
    const initData = getInitData();
    if (!initData) return "refused";
    let r: Response;
    try {
      r = await nativeFetch(MINIAPP_LOGIN_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
        credentials: "omit",
        cache: "no-store",
      });
    } catch {
      return "offline";
    }
    if (!r.ok) return "refused";
    let parsed: ReturnType<typeof parseLogin> = null;
    try {
      parsed = parseLogin(await r.json());
    } catch {
      parsed = null;
    }
    if (!parsed) return "refused";
    token = parsed.token;
    info = parsed.info;
    writeStoredToken(telegramUserId, token);
    return "ok";
  };

  return {
    get token() {
      return token;
    },
    get info() {
      return info;
    },
    login() {
      if (!inflight) {
        inflight = doLogin().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },
    reset() {
      token = null;
      writeStoredToken(telegramUserId, null);
    },
  };
}

function resolveUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(raw, window.location.href);
  } catch {
    return null;
  }
}

/** Our routes except the sign-in itself (its 401 must not loop into another sign-in). */
export function isOurApi(url: URL): boolean {
  return url.origin === window.location.origin && url.pathname.startsWith("/api/") && url.pathname !== MINIAPP_LOGIN_PATH;
}

function withSession(input: RequestInfo | URL, init: RequestInit | undefined, token: string | null): RequestInit {
  // Headers from init, else from the Request itself: init.headers REPLACES the
  // Request's headers instead of adding to them.
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (token) headers.set("Authorization", `Bearer ${token}`);
  else headers.delete("Authorization");
  return { ...init, headers, credentials: "omit" };
}

/** A stream body goes out once; such a request cannot be repeated. */
function isRetryable(init: RequestInit | undefined): boolean {
  return !(typeof ReadableStream !== "undefined" && init?.body instanceof ReadableStream);
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * The Mini App fetch: `native` with the session rules in the header comment.
 * `onAuthLost` fires when even a fresh sign-in did not make the server accept
 * the request (initData expired, the account gone): the shell shows its
 * "reopen" screen instead of sending the person to /login.
 */
export function createMiniAppFetch(auth: MiniAppAuth, native: typeof fetch, onAuthLost: () => void): typeof fetch {
  return async (input, init) => {
    const url = resolveUrl(input);
    if (!url || !isOurApi(url)) return native(input, init);

    if (!auth.token) {
      const r = await auth.login();
      // Like a network error of fetch itself: the caller shows "connection problem".
      if (r === "offline") throw new TypeError("Mini App sign-in failed: offline");
      if (r === "refused") {
        onAuthLost();
        return unauthorized();
      }
    }
    const retryInput: RequestInfo | URL = input instanceof Request ? input.clone() : input;
    const first = await native(input, withSession(input, init, auth.token));
    if (first.status !== 401 || !isRetryable(init)) return first;

    const r = await auth.login();
    if (r !== "ok") {
      if (r === "refused") onAuthLost();
      return first;
    }
    const second = await native(retryInput, withSession(retryInput, init, auth.token));
    if (second.status === 401) onAuthLost();
    return second;
  };
}

/**
 * Put the Mini App fetch in place of window.fetch. Returns the auth and the
 * uninstall (call it when the shell unmounts).
 */
export function installMiniAppFetch(
  getInitData: () => string,
  telegramUserId: string | null,
  onAuthLost: () => void,
): { auth: MiniAppAuth; uninstall: () => void } {
  const native: typeof fetch = window.fetch.bind(window);
  const auth = createMiniAppAuth(getInitData, native, telegramUserId);
  const wrapped = createMiniAppFetch(auth, native, onAuthLost);
  window.fetch = wrapped;
  return {
    auth,
    uninstall: () => {
      if (window.fetch === wrapped) window.fetch = native;
    },
  };
}
