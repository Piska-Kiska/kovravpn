// tests/panel-sub-id.test.mjs — run: npm test
//
// A 3X-UI panel serves every client's config at /sub/<subId> on its
// subscription port without a login, and Kovra set subId to the client
// e-mail `vpn_<userId>_<Date.now()>`: a Telegram id and a creation time,
// both guessable. New devices now get a random subId (lib/panel-sub-id.ts),
// stored on the profile and written back unchanged by the expiry sync;
// devices created before keep theirs; the API never sends it to the browser.
//
// Runs against an in-memory Redis and a stubbed panel. Ids, keys, hosts and
// addresses are made up (documentation ranges).

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const KEY = ["internal", "subid", "test", "key"].join("-");
process.env.INTERNAL_API_KEY = KEY;
process.env.KOVRA_STATIC_PANELS = JSON.stringify([
  { key: "t1", url: "https://panel.example.test/base", inboundId: 2, token: ["panel", "token"].join("-") },
]);

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { newPanelSubId, panelSubIdOf, withoutPanelSubId, PANEL_SUB_ID_RE } = await import("../src/lib/panel-sub-id.ts");
const { POST: createDevice } = await import("../src/app/api/vpn/create/route.ts");
const { POST: accountPost } = await import("../src/app/api/account/route.ts");
const { syncAllExpiry } = await import("../src/lib/balance.ts");
const { createSession } = await import("../src/lib/session.ts");

const USER = "tg_100000009";
const DAY = 86_400_000;

describe("the subId itself", () => {
  test("random, 24 hex characters, never repeated", () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i += 1) {
      const id = newPanelSubId();
      assert.match(id, PANEL_SUB_ID_RE);
      seen.add(id);
    }
    assert.equal(seen.size, 2000);
  });

  test("a device's own subId, or the e-mail for devices from before", () => {
    const own = newPanelSubId();
    assert.equal(panelSubIdOf({ panelSubId: own, clientEmail: "vpn_tg_1_1" }), own);
    assert.equal(panelSubIdOf({ clientEmail: "vpn_tg_1_1" }), "vpn_tg_1_1", "existing clients are not rewritten");
    for (const junk of ["", "ABC", "x".repeat(24), 42, null]) {
      assert.equal(panelSubIdOf({ panelSubId: junk, clientEmail: "vpn_tg_1_1" }), "vpn_tg_1_1", String(junk));
    }
  });

  test("withoutPanelSubId drops only that field and leaves the profile alone", () => {
    const p = { uuid: "u", clientEmail: "e", panelSubId: newPanelSubId() };
    assert.deepEqual(withoutPanelSubId(p), { uuid: "u", clientEmail: "e" });
    assert.ok(p.panelSubId, "the stored profile keeps it");
  });
});

describe("a new device", () => {
  let panelCalls;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    mem.reset();
    panelCalls = [];
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      if (!u.startsWith("https://panel.example.test/")) throw new Error(`unexpected fetch in test: ${u}`);
      panelCalls.push({ path: u.slice("https://panel.example.test/base".length), body: JSON.parse(init.body) });
      return Response.json({ success: true });
    };
    mem.store.set(
      "inbounds:registry",
      JSON.stringify([
        {
          key: "t1", label: "Test", enabled: true, priority: 0, source: "static", address: "203.0.113.10", port: 443,
          serverName: "example.com", publicKey: "pk", shortId: "ab", spiderX: "/", fingerprint: "firefox", encryption: "none", flow: "xtls-rprx-vision",
        },
      ]),
    );
    mem.store.set(`subs:${USER}`, JSON.stringify([{ id: "p", kind: "plan3", slots: 3, startedAt: 1, expiresAt: Date.now() + 30 * DAY }]));
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  async function create() {
    const res = await createDevice(
      new NextRequest("https://kovra.test/api/vpn/create", {
        method: "POST",
        headers: { "content-type": "application/json", "x-internal-key": KEY },
        body: JSON.stringify({ userId: USER, deviceType: "android" }),
      }),
    );
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    return res.json();
  }

  test("gets a random subId on the panel, stored on its profile, unrelated to the user or the time", async () => {
    await create();
    const add = panelCalls.find((c) => c.path === "/panel/api/clients/add");
    assert.ok(add, "the client was added to the panel");
    const { subId, email } = add.body.client;
    const [profile] = JSON.parse(mem.store.get(`profiles:${USER}`));
    assert.match(profile.panelSubId, PANEL_SUB_ID_RE);
    assert.equal(subId, `kovra_${profile.panelSubId}`);
    assert.ok(!subId.includes(USER.slice(3)), "no Telegram id in the subId");
    assert.notEqual(subId, email);
    assert.ok(email.includes(USER), "the e-mail keeps its old shape: the panels key clients by it");
  });

  test("two devices never share a subId", async () => {
    await create();
    await create();
    const ids = JSON.parse(mem.store.get(`profiles:${USER}`)).map((p) => p.panelSubId);
    assert.equal(new Set(ids).size, 2);
  });

  test("the expiry sync writes the same subId back, and the e-mail one for older devices", async () => {
    await create();
    const [fresh] = JSON.parse(mem.store.get(`profiles:${USER}`));
    const old = { uuid: "0a1b2c3d-0000-4000-8000-0000000000aa", clientEmail: `vpn_${USER}_1`, vlessUrl: "", createdAt: 1 };
    mem.store.set(`profiles:${USER}`, JSON.stringify([old, fresh]));
    const specs = [];
    await syncAllExpiry(USER, {
      updateClient: async (spec) => {
        specs.push(spec);
        return [{ key: "t1", ok: true, status: 200 }];
      },
    });
    assert.deepEqual(
      specs.map((s) => s.subId),
      [old.clientEmail, fresh.panelSubId],
    );
  });

  test("/api/account never sends the subId to the browser", async () => {
    await create();
    const sid = await createSession(USER);
    const res = await accountPost(
      new NextRequest("https://kovra.test/api/account", { method: "POST", headers: { authorization: `Bearer ${sid}` } }),
    );
    const body = await res.json();
    assert.equal(body.profiles.length, 1);
    assert.equal("panelSubId" in body.profiles[0], false);
    assert.equal(JSON.stringify(body).includes(JSON.parse(mem.store.get(`profiles:${USER}`))[0].panelSubId), false);
  });
});
