// tests/miniapp-server.test.mjs — run: npm test
//
// Server pieces the Mini App cabinet uses, against an in-memory Redis:
//   • POST /api/account/lang — the cabinet tells the account (and so the bot)
//     which language the person switched to;
//   • paymentReturnFor — a payment started in the Mini App returns to it
//     (https://t.me/<bot>?startapp=paid), anything else keeps the site's
//     addresses.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { createSession, COOKIE_NAME } = await import("../src/lib/session.ts");
const { POST: langPost } = await import("../src/app/api/account/lang/route.ts");
const { paymentReturnFor, miniAppPaymentReturn } = await import("../src/lib/bot-link.ts");

const USER = "tg_100000001";

function req({ body, bearer, cookie } = {}) {
  const headers = { "content-type": "application/json" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (cookie) headers.cookie = `${COOKIE_NAME}=${cookie}`;
  return new NextRequest("https://kovra.test/api/account/lang", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(opts) {
  const res = await langPost(req(opts));
  return { status: res.status, body: await res.json(), headers: res.headers };
}

const userRecord = () => {
  const raw = mem.store.get(`user:${USER}`);
  return raw === undefined ? undefined : JSON.parse(raw);
};

let sid;
beforeEach(async () => {
  mem.reset();
  sid = await createSession(USER, true);
});

describe("POST /api/account/lang", () => {
  test("Bearer session: stores the language on the account, keeps the rest of the record", async () => {
    mem.store.set(`user:${USER}`, JSON.stringify({ authMethod: "telegram", createdAt: 1, tgUsername: "tester", lang: "en" }));
    const r = await call({ body: { lang: "de" }, bearer: sid });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, lang: "de" });
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(userRecord(), { authMethod: "telegram", createdAt: 1, tgUsername: "tester", lang: "de" });
  });

  test("the cookie session works too (same route for the site)", async () => {
    const r = await call({ body: { lang: "fr" }, cookie: sid });
    assert.equal(r.status, 200);
    assert.equal(userRecord().lang, "fr");
  });

  test("no session or a junk Bearer next to a valid cookie: 401, nothing written", async () => {
    assert.equal((await call({ body: { lang: "ru" } })).status, 401);
    assert.equal((await call({ body: { lang: "ru" }, bearer: "junk", cookie: sid })).status, 401);
    assert.equal(userRecord(), undefined);
  });

  test("only the bot's languages, exactly", async () => {
    for (const lang of ["it", "DE", "de-AT", "", null, 5, ["en"], { en: 1 }]) {
      const r = await call({ body: { lang }, bearer: sid });
      assert.equal(r.status, 400, JSON.stringify(lang));
      assert.equal(r.body.error, "invalid_lang");
    }
    assert.equal(userRecord(), undefined);
  });

  test("bad bodies: 400", async () => {
    assert.equal((await call({ body: "{nope", bearer: sid })).body.error, "invalid_request");
    assert.equal((await call({ body: "[]", bearer: sid })).body.error, "invalid_request");
    assert.equal((await call({ body: "null", bearer: sid })).body.error, "invalid_request");
  });

  test("rate limited per account", async () => {
    for (let i = 0; i < 10; i++) assert.equal((await call({ body: { lang: "es" }, bearer: sid })).status, 200);
    const r = await call({ body: { lang: "es" }, bearer: sid });
    assert.equal(r.status, 429);
    assert.ok(Number(r.headers.get("retry-after")) > 0);
  });

  test("a Redis failure is a 500, not a half-written record", async () => {
    mem.failNext("set", { key: `user:${USER}` });
    const r = await call({ body: { lang: "ru" }, bearer: sid });
    assert.equal(r.status, 500);
    assert.equal(userRecord(), undefined);
  });
});

describe("payment return addresses", () => {
  const env = { TELEGRAM_BOT_USERNAME: "KovraVPN_bot" };

  test("returnTo miniapp: back into the Mini App", () => {
    assert.deepEqual(paymentReturnFor({ returnTo: "miniapp", kind: "plan3" }, env), {
      success: "https://t.me/KovraVPN_bot?startapp=paid",
      fail: "https://t.me/KovraVPN_bot?startapp",
    });
    assert.deepEqual(miniAppPaymentReturn(env), paymentReturnFor({ returnTo: "miniapp" }, env));
  });

  test("anything else keeps the caller's own (site) addresses", () => {
    for (const body of [{}, { returnTo: "web" }, { returnTo: "MINIAPP" }, { returnTo: ["miniapp"] }, null, undefined, "miniapp", 1]) {
      assert.equal(paymentReturnFor(body, env), undefined, JSON.stringify(body));
    }
  });

  test("a malformed bot username never reaches the URL", () => {
    assert.equal(paymentReturnFor({ returnTo: "miniapp" }, { TELEGRAM_BOT_USERNAME: "evil.example/x" }).success, "https://t.me/KovraVPN_bot?startapp=paid");
  });
});
