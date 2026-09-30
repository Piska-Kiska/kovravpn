// tests/miniapp-auth.test.mjs — run: npm test
//
// Mini App sign-in end to end against an in-memory Redis:
//   • lib/telegram-login.ts — find/create the account, referral rules;
//   • lib/session.ts        — Bearer wins and never falls back to the cookie;
//   • POST /api/auth/telegram/miniapp — Bearer token in the body, no cookie,
//     401 for anything not signed by our bot, rate limits.
//
// Tokens and ids are made up; tokens are assembled from parts so that no
// literal looks like a bot token to secret scanners.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const TOKEN = ["111111111", "KOVRA-test-token"].join(":");
const OTHER = ["222222222", "OTHER-test-token"].join(":");
process.env.TELEGRAM_BOT_TOKEN = TOKEN;

const { NextRequest } = await import("next/server");
const { loginWithTelegram, isTelegramId } = await import("../src/lib/telegram-login.ts");
const { createSession, getSessionFromRequest, sessionIdFromRequest, COOKIE_NAME } = await import("../src/lib/session.ts");
const { POST: miniappPost } = await import("../src/app/api/auth/telegram/miniapp/route.ts");
const { POST: logoutPost } = await import("../src/app/api/auth/logout/route.ts");

const TG_ID = 100000001;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function signedInitData(overrides = {}, token = TOKEN) {
  const fields = {
    user: JSON.stringify({ id: TG_ID, first_name: "Test", username: "Tester", language_code: "es" }),
    auth_date: String(Math.floor(Date.now() / 1000) - 10),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    ...overrides,
  };
  const dcs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  const params = new URLSearchParams(fields);
  params.set("hash", hash);
  return params.toString();
}

function miniappRequest(body, ip = "203.0.113.7") {
  return new NextRequest("https://kovra.test/api/auth/telegram/miniapp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function reqWith({ authorization, cookie } = {}) {
  const headers = {};
  if (authorization !== undefined) headers.authorization = authorization;
  if (cookie !== undefined) headers.cookie = `${COOKIE_NAME}=${cookie}`;
  return new NextRequest("https://kovra.test/api/account", { method: "POST", headers });
}

const json = (key) => {
  const raw = mem.store.get(key);
  return raw === undefined ? undefined : JSON.parse(raw);
};

beforeEach(() => mem.reset());

describe("loginWithTelegram", () => {
  test("first login creates the user record and the account", async () => {
    const r = await loginWithTelegram({ telegramId: TG_ID });
    assert.deepEqual(r, { userId: `tg_${TG_ID}`, isNewUser: true });
    assert.equal(json(`user:tg_${TG_ID}`).telegramId, TG_ID);
    assert.equal(json(`user:tg_${TG_ID}`).authMethod, "telegram");
    assert.equal(json(`account:tg_${TG_ID}`).plan, "active");
  });

  test("second login is not new and does not overwrite records", async () => {
    await loginWithTelegram({ telegramId: TG_ID });
    const acc = { ...json(`account:tg_${TG_ID}`), paidUntil: 123 };
    mem.store.set(`account:tg_${TG_ID}`, JSON.stringify(acc));
    mem.store.set(`user:tg_${TG_ID}`, JSON.stringify({ authMethod: "telegram", lang: "de", createdAt: 1 }));
    const r = await loginWithTelegram({ telegramId: String(TG_ID) });
    assert.deepEqual(r, { userId: `tg_${TG_ID}`, isNewUser: false });
    assert.equal(json(`account:tg_${TG_ID}`).paidUntil, 123);
    assert.equal(json(`user:tg_${TG_ID}`).lang, "de");
  });

  test("a linked Telegram resolves to the primary (e-mail) account", async () => {
    mem.store.set(`alias:tg_${TG_ID}`, "em_primary");
    mem.store.set("account:em_primary", JSON.stringify({ plan: "active", createdAt: 1 }));
    const r = await loginWithTelegram({ telegramId: TG_ID });
    assert.deepEqual(r, { userId: "em_primary", isNewUser: false });
    assert.equal(mem.store.has(`account:tg_${TG_ID}`), false);
  });

  test("a new account takes the code's ref first, then the bot's pending_ref", async () => {
    mem.store.set("ref_lookup:abc123", "tg_referrer");
    mem.store.set(`pending_ref:${TG_ID}`, "zzz999");
    await loginWithTelegram({ telegramId: TG_ID, ref: "abc123" });
    assert.equal(mem.store.get(`ref_by:tg_${TG_ID}`), "tg_referrer");
    // pending_ref untouched: the code's ref won.
    assert.equal(mem.store.get(`pending_ref:${TG_ID}`), "zzz999");
  });

  test("pending_ref from the bot is used and consumed when the code has none", async () => {
    mem.store.set("ref_lookup:abc123", "tg_referrer");
    mem.store.set(`pending_ref:${TG_ID}`, "abc123");
    await loginWithTelegram({ telegramId: TG_ID });
    assert.equal(mem.store.get(`ref_by:tg_${TG_ID}`), "tg_referrer");
    assert.equal(mem.store.has(`pending_ref:${TG_ID}`), false);
  });

  test("no referral for an existing account, for oneself, or for a junk code", async () => {
    mem.store.set("ref_lookup:abc123", "tg_referrer");
    mem.store.set(`account:tg_${TG_ID}`, JSON.stringify({ plan: "active", createdAt: 1 }));
    await loginWithTelegram({ telegramId: TG_ID, ref: "abc123" });
    assert.equal(mem.store.has(`ref_by:tg_${TG_ID}`), false);

    mem.reset();
    mem.store.set("ref_lookup:self01", `tg_${TG_ID}`);
    await loginWithTelegram({ telegramId: TG_ID, ref: "self01" });
    assert.equal(mem.store.has(`ref_by:tg_${TG_ID}`), false);

    mem.reset();
    await loginWithTelegram({ telegramId: TG_ID, ref: "../../etc passwd" });
    assert.equal(mem.store.has(`ref_by:tg_${TG_ID}`), false);
  });

  test("an invalid telegram id is refused before any write", async () => {
    for (const bad of [0, -1, 1.5, "abc", "", "01", null, undefined]) {
      await assert.rejects(loginWithTelegram({ telegramId: bad }), /invalid telegramId/);
      assert.equal(isTelegramId(bad), false);
    }
    assert.equal(mem.store.size, 0);
  });
});

describe("session lookup: Bearer and cookie", () => {
  test("cookie only: works as before", async () => {
    const sid = await createSession("tg_1");
    const s = await getSessionFromRequest(reqWith({ cookie: sid }));
    assert.equal(s.userId, "tg_1");
    assert.deepEqual(sessionIdFromRequest(reqWith({ cookie: sid })), { sid, source: "cookie" });
  });

  test("Bearer only: works", async () => {
    const sid = await createSession("tg_2", true);
    const s = await getSessionFromRequest(reqWith({ authorization: `Bearer ${sid}` }));
    assert.equal(s.userId, "tg_2");
    assert.equal((await getSessionFromRequest(reqWith({ authorization: `bearer   ${sid}  ` }))).userId, "tg_2");
  });

  test("Bearer and cookie of different users: the Bearer wins", async () => {
    const cookieSid = await createSession("tg_cookie");
    const bearerSid = await createSession("tg_bearer", true);
    const s = await getSessionFromRequest(reqWith({ authorization: `Bearer ${bearerSid}`, cookie: cookieSid }));
    assert.equal(s.userId, "tg_bearer");
  });

  test("an expired or unknown Bearer never falls back to a valid cookie", async () => {
    const cookieSid = await createSession("tg_cookie");
    const gone = "00000000-0000-4000-8000-000000000000";
    assert.equal(await getSessionFromRequest(reqWith({ authorization: `Bearer ${gone}`, cookie: cookieSid })), null);
  });

  test("a malformed or empty Bearer never falls back to a valid cookie", async () => {
    const cookieSid = await createSession("tg_cookie");
    for (const authorization of ["Bearer", "Bearer ", "Bearer not-a-sid", `Bearer ${cookieSid}x`, "bearer\tjunk"]) {
      assert.equal(
        await getSessionFromRequest(reqWith({ authorization, cookie: cookieSid })),
        null,
        authorization,
      );
      assert.equal(sessionIdFromRequest(reqWith({ authorization, cookie: cookieSid })).source, "bearer");
    }
  });

  test("another Authorization scheme is not a Bearer: the cookie still counts", async () => {
    const cookieSid = await createSession("tg_cookie");
    const s = await getSessionFromRequest(reqWith({ authorization: "Basic dXNlcjpwYXNz", cookie: cookieSid }));
    assert.equal(s.userId, "tg_cookie");
  });

  test("no credentials: null", async () => {
    assert.equal(await getSessionFromRequest(reqWith()), null);
    assert.deepEqual(sessionIdFromRequest(reqWith()), { sid: null, source: "none" });
  });

  test("logout with a Bearer ends that session only and leaves the cookie alone", async () => {
    const cookieSid = await createSession("tg_cookie");
    const bearerSid = await createSession("tg_bearer", true);
    const res = await logoutPost(reqWith({ authorization: `Bearer ${bearerSid}`, cookie: cookieSid }));
    assert.equal(res.status, 200);
    assert.equal(mem.store.has(`session:${bearerSid}`), false);
    assert.equal(mem.store.has(`session:${cookieSid}`), true);
    assert.equal(res.headers.get("set-cookie"), null);
  });

  test("logout with the cookie ends it and clears the cookie", async () => {
    const cookieSid = await createSession("tg_cookie");
    const res = await logoutPost(reqWith({ cookie: cookieSid }));
    assert.equal(mem.store.has(`session:${cookieSid}`), false);
    assert.match(res.headers.get("set-cookie") ?? "", /sid=;/);
  });
});

describe("POST /api/auth/telegram/miniapp", () => {
  test("valid initData: 200, Bearer token in the body, no cookie, account created", async () => {
    const res = await miniappPost(miniappRequest({ initData: signedInitData({ start_param: "paid" }) }));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("set-cookie"), null);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.tokenType, "Bearer");
    assert.match(body.token, UUID_RE);
    assert.equal(body.userId, `tg_${TG_ID}`);
    assert.equal(body.isNewUser, true);
    assert.equal(body.startParam, "paid");
    assert.equal(body.languageCode, "es");

    const session = json(`session:${body.token}`);
    assert.equal(session.userId, `tg_${TG_ID}`);
    assert.equal(session.remember, true);
    assert.equal(json(`account:tg_${TG_ID}`).plan, "active");
    // Identity and first-contact language were written, one after the other.
    const user = json(`user:tg_${TG_ID}`);
    assert.equal(user.tgUsername, "tester");
    assert.equal(user.lang, "es");
    assert.equal(mem.store.get(`username:tester`), `tg_${TG_ID}`);

    // The token works as a Bearer.
    const s = await getSessionFromRequest(reqWith({ authorization: `Bearer ${body.token}` }));
    assert.equal(s.userId, `tg_${TG_ID}`);
  });

  test("a stored language is not overwritten by Telegram's", async () => {
    mem.store.set(`user:tg_${TG_ID}`, JSON.stringify({ authMethod: "telegram", createdAt: 1, lang: "fr" }));
    const res = await miniappPost(miniappRequest({ initData: signedInitData() }));
    assert.equal(res.status, 200);
    assert.equal(json(`user:tg_${TG_ID}`).lang, "fr");
  });

  test("forged, stale or other-bot initData: 401 and nothing written but rate counters", async () => {
    const cases = [
      [signedInitData({}, OTHER), "bad_hash"],
      [signedInitData().replace(String(TG_ID), "100000002"), "bad_hash"],
      [signedInitData({ auth_date: String(Math.floor(Date.now() / 1000) - 7200) }), "expired"],
    ];
    for (const [initData, reason] of cases) {
      const res = await miniappPost(miniappRequest({ initData }));
      assert.equal(res.status, 401, reason);
      assert.deepEqual(await res.json(), { ok: false, error: reason });
      assert.equal(res.headers.get("set-cookie"), null);
    }
    const written = [...mem.store.keys()].filter((k) => !k.startsWith("rl:"));
    assert.deepEqual(written, []);
  });

  test("bad bodies: 400", async () => {
    assert.equal((await miniappPost(miniappRequest("{not json"))).status, 400);
    assert.equal((await miniappPost(miniappRequest({}))).status, 400);
    assert.equal((await miniappPost(miniappRequest({ initData: 42 }))).status, 400);
    assert.equal((await miniappPost(miniappRequest({ initData: "x".repeat(5000) }))).status, 400);
  });

  test("no bot token configured: 500, nothing accepted", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "";
    try {
      const res = await miniappPost(miniappRequest({ initData: signedInitData() }));
      assert.equal(res.status, 500);
    } finally {
      process.env.TELEGRAM_BOT_TOKEN = TOKEN;
    }
  });

  test("rate limit per Telegram account across addresses", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await miniappPost(miniappRequest({ initData: signedInitData() }, `198.51.100.${i}`));
      assert.equal(res.status, 200, `call ${i}`);
    }
    const res = await miniappPost(miniappRequest({ initData: signedInitData() }, "198.51.100.200"));
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get("retry-after")) > 0);
  });

  test("rate limit per address, before any parsing", async () => {
    for (let i = 0; i < 20; i++) await miniappPost(miniappRequest({}));
    const res = await miniappPost(miniappRequest({ initData: signedInitData() }));
    assert.equal(res.status, 429);
  });

  test("Redis failure: 500 without a token", async () => {
    mem.failNext("set", { key: /^session:/ });
    const res = await miniappPost(miniappRequest({ initData: signedInitData() }));
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.token, undefined);
  });
});
