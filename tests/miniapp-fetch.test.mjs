// tests/miniapp-fetch.test.mjs — run: npm test
//
// The Mini App's Bearer fetch (src/app/tg/miniapp-fetch.ts), which replaces
// window.fetch on /tg while the cabinet runs inside Telegram.
//
// The rules it must not weaken (lib/session.ts): one Telegram webview can
// switch between two accounts, so a stale session never falls back to a
// cookie. Here: cookies are never sent, a request never goes out bare, a 401
// is retried exactly once with a fresh session, and a refusal reaches the
// shell (onAuthLost) instead of a redirect to /login. A fake `fetch` stands in
// for the network.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";

const ORIGIN = "https://kovra.test";
const FRESH = "11111111-1111-4111-8111-111111111111";
const STALE = "22222222-2222-4222-8222-222222222222";
const UID = "100000001";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

globalThis.window = {
  location: { href: `${ORIGIN}/tg?lang=en`, origin: ORIGIN },
  sessionStorage: memoryStorage(),
};

const { createMiniAppAuth, createMiniAppFetch, installMiniAppFetch, MINIAPP_LOGIN_PATH, TOKEN_STORAGE_KEY } = await import(
  "../src/app/tg/miniapp-fetch.ts"
);

function storeToken(token, uid = UID) {
  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ uid, token }));
}

/**
 * A fake network. The sign-in answers `login` ("ok" -> FRESH, "refused" ->
 * 401, "offline" -> throws); API calls answer from a queue of statuses (the
 * last one repeats).
 */
function network({ login = "ok", apiStatuses = [200], loginBody } = {}) {
  const calls = [];
  const queue = [...apiStatuses];
  const native = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    calls.push({ url, credentials: init.credentials, authorization: headers.get("authorization"), body: init.body });
    if (url === MINIAPP_LOGIN_PATH) {
      if (login === "offline") throw new TypeError("Failed to fetch");
      if (login === "refused") return new Response(JSON.stringify({ ok: false, error: "expired" }), { status: 401 });
      return new Response(JSON.stringify(loginBody ?? { ok: true, token: FRESH, userId: "tg_1", lang: "de", isNewUser: true }), { status: 200 });
    }
    const status = queue.length > 1 ? queue.shift() : queue[0];
    return new Response("{}", { status });
  };
  return { calls, native };
}

function setup(net, { initData = "signed-init-data", uid = UID } = {}) {
  let lost = 0;
  const auth = createMiniAppAuth(() => initData, net.native, uid);
  const f = createMiniAppFetch(auth, net.native, () => {
    lost += 1;
  });
  return { auth, f, lost: () => lost };
}

const apiCalls = (calls) => calls.filter((c) => c.url !== MINIAPP_LOGIN_PATH);

beforeEach(() => {
  globalThis.window.sessionStorage = memoryStorage();
});

describe("Mini App sign-in", () => {
  test("a successful sign-in stores the token with the Telegram id and keeps the account language", async () => {
    const net = network();
    const { auth } = setup(net);
    assert.equal(await auth.login(), "ok");
    assert.equal(auth.token, FRESH);
    assert.deepEqual(auth.info, { userId: "tg_1", lang: "de", isNewUser: true });
    assert.deepEqual(JSON.parse(window.sessionStorage.getItem(TOKEN_STORAGE_KEY)), { uid: UID, token: FRESH });
    const login = net.calls[0];
    assert.equal(login.credentials, "omit");
    assert.deepEqual(JSON.parse(login.body), { initData: "signed-init-data" });
  });

  test("a stored token of another Telegram account is ignored", async () => {
    storeToken(STALE, "999");
    const { auth } = setup(network());
    assert.equal(auth.token, null);
  });

  test("a malformed stored token is ignored", async () => {
    storeToken("not-a-uuid");
    const { auth } = setup(network());
    assert.equal(auth.token, null);
  });

  test("concurrent sign-ins share one request", async () => {
    const net = network();
    const { auth } = setup(net);
    const [a, b] = await Promise.all([auth.login(), auth.login()]);
    assert.deepEqual([a, b], ["ok", "ok"]);
    assert.equal(net.calls.length, 1);
  });

  test("refused, offline, no initData and a junk answer are told apart", async () => {
    assert.equal(await setup(network({ login: "refused" })).auth.login(), "refused");
    assert.equal(await setup(network({ login: "offline" })).auth.login(), "offline");
    const none = network();
    assert.equal(await setup(none, { initData: "" }).auth.login(), "refused");
    assert.equal(none.calls.length, 0, "no request without initData");
    assert.equal(await setup(network({ loginBody: { ok: true, token: "x", userId: "tg_1" } })).auth.login(), "refused");
  });

  test("reset forgets the token everywhere", async () => {
    storeToken(STALE);
    const { auth } = setup(network());
    assert.equal(auth.token, STALE);
    auth.reset();
    assert.equal(auth.token, null);
    assert.equal(window.sessionStorage.getItem(TOKEN_STORAGE_KEY), null);
  });
});

describe("Mini App fetch", () => {
  test("a stored token goes as Bearer and cookies are omitted", async () => {
    storeToken(STALE);
    const net = network();
    const { f } = setup(net);
    const res = await f("/api/account", { method: "POST", body: "{}" });
    assert.equal(res.status, 200);
    assert.deepEqual(
      net.calls.map((c) => [c.url, c.credentials, c.authorization]),
      [["/api/account", "omit", `Bearer ${STALE}`]],
    );
  });

  test("without a token it signs in first, never sends the request bare", async () => {
    const net = network();
    const { f } = setup(net);
    await f("/api/auth/me");
    assert.equal(net.calls[0].url, MINIAPP_LOGIN_PATH);
    assert.deepEqual([net.calls[1].url, net.calls[1].authorization], ["/api/auth/me", `Bearer ${FRESH}`]);
  });

  test("a 401 signs in once and repeats once with the new token", async () => {
    storeToken(STALE);
    const net = network({ apiStatuses: [401, 200] });
    const { f, lost } = setup(net);
    const res = await f("/api/wallet/purchase", { method: "POST", body: JSON.stringify({ requestId: "abcdefgh" }) });
    assert.equal(res.status, 200);
    assert.deepEqual(
      net.calls.map((c) => [c.url, c.authorization]),
      [
        ["/api/wallet/purchase", `Bearer ${STALE}`],
        [MINIAPP_LOGIN_PATH, null],
        ["/api/wallet/purchase", `Bearer ${FRESH}`],
      ],
    );
    // The same body goes again: the purchase request id makes it safe.
    assert.equal(net.calls[2].body, net.calls[0].body);
    assert.equal(lost(), 0);
  });

  test("a second 401 is returned and the shell is told, no third attempt", async () => {
    storeToken(STALE);
    const net = network({ apiStatuses: [401] });
    const { f, lost } = setup(net);
    const res = await f("/api/account");
    assert.equal(res.status, 401);
    assert.equal(apiCalls(net.calls).length, 2);
    assert.equal(lost(), 1);
  });

  test("a refused re-sign-in returns the original 401 and tells the shell", async () => {
    storeToken(STALE);
    const net = network({ login: "refused", apiStatuses: [401] });
    const { f, lost } = setup(net);
    const res = await f("/api/account");
    assert.equal(res.status, 401);
    assert.equal(apiCalls(net.calls).length, 1);
    assert.equal(lost(), 1);
  });

  test("an offline re-sign-in returns the 401 without calling it a lost session", async () => {
    storeToken(STALE);
    const net = network({ login: "offline", apiStatuses: [401] });
    const { f, lost } = setup(net);
    assert.equal((await f("/api/account")).status, 401);
    assert.equal(lost(), 0);
  });

  test("no token and the sign-in refused: a 401 answer, the shell is told, nothing sent", async () => {
    const net = network({ login: "refused" });
    const { f, lost } = setup(net);
    const res = await f("/api/account");
    assert.equal(res.status, 401);
    assert.equal(apiCalls(net.calls).length, 0);
    assert.equal(lost(), 1);
  });

  test("no token and offline: throws like a network error", async () => {
    const net = network({ login: "offline" });
    const { f, lost } = setup(net);
    await assert.rejects(() => f("/api/account"), TypeError);
    assert.equal(lost(), 0);
  });

  test("other origins, non-API paths and the sign-in route itself pass through untouched", async () => {
    storeToken(STALE);
    const net = network();
    const { f } = setup(net);
    await f("https://evil.example/api/account");
    await f(`${ORIGIN}/guides/happ`);
    await f(MINIAPP_LOGIN_PATH, { method: "POST", body: "{}" });
    assert.deepEqual(
      net.calls.map((c) => [c.authorization, c.credentials]),
      [
        [null, undefined],
        [null, undefined],
        [null, undefined],
      ],
    );
  });

  test("a caller's own Authorization header is replaced by the session", async () => {
    storeToken(STALE);
    const net = network();
    const { f } = setup(net);
    await f("/api/account", { headers: { Authorization: "Bearer someone-else", "X-Test": "1" } });
    assert.equal(net.calls[0].authorization, `Bearer ${STALE}`);
  });

  test("a stream body is not repeated after a 401", async () => {
    storeToken(STALE);
    const net = network({ apiStatuses: [401, 200] });
    const { f } = setup(net);
    const body = new ReadableStream({ start: (c) => c.close() });
    const res = await f("/api/account", { method: "POST", body, duplex: "half" });
    assert.equal(res.status, 401);
    assert.equal(apiCalls(net.calls).length, 1);
  });

  test("install replaces window.fetch and uninstall restores it", async () => {
    const original = async () => new Response("{}", { status: 200 });
    window.fetch = original;
    const { uninstall } = installMiniAppFetch(() => "init", UID, () => {});
    assert.notEqual(window.fetch, original);
    uninstall();
    assert.equal(typeof window.fetch, "function");
    assert.equal(window.fetch.name, "bound original");
  });
});
