// tests/admin-key.test.mjs — run: npm test
//
// KM-14 / KS-7: the promo minting API, the promo list/delete and
// account/setup authenticated with the Telegram bot token (account/setup with
// `!==`, open to anyone when the token was unset), and the internal key fell
// back to the bot token. The bot token travels in every api.telegram.org URL,
// so it is no secret to build an admin API on. Now the admin routes take
// X-Admin-Key = ADMIN_API_KEY (constant time, 503 while unset) and the
// internal key is INTERNAL_API_KEY only.
//
// Keys and ids are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

const BOT_TOKEN = ["444444444", "KOVRA-admin-key-test"].join(":");
const ADMIN_KEY = ["kovra", "admin", "key", "for", "tests"].join("-");
process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
delete process.env.INTERNAL_API_KEY; // read at module load by auth.ts and indexnow
delete process.env.ADMIN_API_KEY;
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { checkAdminKey } = await import("../src/lib/admin-key.ts");
const { POST: promoCreate } = await import("../src/app/api/promo/create/route.ts");
const { GET: promoList, DELETE: promoDelete } = await import("../src/app/api/promo/list/route.ts");
const { POST: accountSetup } = await import("../src/app/api/account/setup/route.ts");
const { GET: broadcastGet } = await import("../src/app/api/admin/broadcast/route.ts");
const { POST: indexnowPing } = await import("../src/app/api/indexnow/ping/route.ts");
const { authenticateRequest } = await import("../src/lib/auth.ts");

const TG = "tg_100000001";

function req(url, { method = "POST", headers = {}, body } = {}) {
  return new NextRequest(`https://kovra.test${url}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  mem.reset();
  delete process.env.ADMIN_API_KEY;
});

describe("checkAdminKey", () => {
  test("fails closed when ADMIN_API_KEY is unset or empty", () => {
    assert.equal(checkAdminKey(ADMIN_KEY, {}), "disabled");
    assert.equal(checkAdminKey("", { ADMIN_API_KEY: "" }), "disabled");
    assert.equal(checkAdminKey(undefined, {}), "disabled");
  });

  test("only the exact key passes", () => {
    const env = { ADMIN_API_KEY: ADMIN_KEY };
    assert.equal(checkAdminKey(ADMIN_KEY, env), "ok");
    for (const bad of [null, undefined, "", `${ADMIN_KEY} `, ADMIN_KEY.slice(0, -1), BOT_TOKEN]) {
      assert.equal(checkAdminKey(bad, env), "forbidden", String(bad));
    }
  });
});

describe("admin routes with ADMIN_API_KEY unset: 503 and nothing written", () => {
  test("promo create / list / delete and account setup", async () => {
    const withBotToken = { "x-admin-key": BOT_TOKEN, "x-internal-key": BOT_TOKEN };
    assert.equal((await promoCreate(req("/api/promo/create", { headers: withBotToken, body: { amount: 5 } }))).status, 503);
    assert.equal((await promoList(req("/api/promo/list", { method: "GET", headers: withBotToken }))).status, 503);
    assert.equal((await promoDelete(req("/api/promo/list", { method: "DELETE", headers: withBotToken, body: { code: "X" } }))).status, 503);
    const setup = await accountSetup(
      req("/api/account/setup", { body: { userId: TG, plan: "max", days: 365, adminKey: undefined } }),
    );
    assert.equal(setup.status, 503, "no longer open when a key is unset");
    assert.equal(mem.store.size, 0);
  });
});

describe("admin routes with ADMIN_API_KEY set", () => {
  beforeEach(() => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
  });

  test("the bot token is refused everywhere it used to be accepted", async () => {
    const h = { "x-internal-key": BOT_TOKEN };
    assert.equal((await promoCreate(req("/api/promo/create", { headers: h, body: { code: "BOT5", amount: 5 } }))).status, 403);
    assert.equal((await promoList(req("/api/promo/list", { method: "GET", headers: h }))).status, 403);
    const setup = await accountSetup(req("/api/account/setup", { body: { userId: TG, plan: "max", adminKey: BOT_TOKEN } }));
    assert.equal(setup.status, 401);
    assert.equal(mem.store.get("promo:BOT5"), undefined);
    assert.equal(mem.store.get(`account:${TG}`), undefined);
  });

  test("the admin key works: promo created, listed and deleted", async () => {
    const h = { "x-admin-key": ADMIN_KEY };
    const created = await promoCreate(req("/api/promo/create", { headers: h, body: { code: "GIFT5", amount: 5 } }));
    assert.equal(created.status, 200);
    const listed = await (await promoList(req("/api/promo/list", { method: "GET", headers: h }))).json();
    assert.deepEqual(listed.promos.map((p) => p.code), ["GIFT5"]);
    assert.equal((await promoDelete(req("/api/promo/list", { method: "DELETE", headers: h, body: { code: "GIFT5" } }))).status, 200);
    assert.equal((await promoDelete(req("/api/promo/list", { method: "DELETE", headers: h, body: {} }))).status, 400);
  });

  test("account setup validates its input", async () => {
    const h = { "x-admin-key": ADMIN_KEY };
    const call = async (body) => accountSetup(req("/api/account/setup", { headers: h, body }));
    for (const bad of [
      {},
      { userId: "someone" },
      { userId: TG, plan: "platinum" },
      { userId: TG, days: 0 },
      { userId: TG, days: 1.5 },
      { userId: TG, extraProfiles: 1000 },
    ]) {
      assert.equal((await call(bad)).status, 400, JSON.stringify(bad));
    }
    assert.equal(mem.store.size, 0);
    const ok = await call({ userId: TG, plan: "base", days: 30 });
    assert.equal(ok.status, 200);
    const account = JSON.parse(mem.store.get(`account:${TG}`));
    assert.equal(account.plan, "base");
    assert.equal(account.maxProfiles, 3);
    assert.equal(Math.round((account.paidUntil - Date.now()) / 86_400_000), 30);
  });

  test("broadcast takes the same key", async () => {
    assert.equal((await broadcastGet(req("/api/admin/broadcast", { method: "GET", headers: { "x-admin-key": BOT_TOKEN } }))).status, 401);
    assert.equal((await broadcastGet(req("/api/admin/broadcast", { method: "GET" }))).status, 401);
  });
});

describe("the internal key never falls back to the bot token", () => {
  test("X-Internal-Key = bot token does not authenticate as a user", async () => {
    const r = await authenticateRequest(
      req("/api/vpn/create", { headers: { "x-internal-key": BOT_TOKEN }, body: { userId: TG } }),
      { userId: TG },
    );
    assert.equal(r.userId, null);
  });

  test("indexnow ping refuses the bot token", async () => {
    const res = await indexnowPing(req("/api/indexnow/ping", { headers: { "x-internal-key": BOT_TOKEN } }));
    assert.equal(res.status, 401);
  });
});
