// tests/vpn-create-pool.test.mjs — run: npm test
//
// POST /api/vpn/create end to end, on the in-memory Redis and a fake 3X-UI
// panel: the new device's UUID comes from the reserve the PRO nodes preload
// (src/lib/uuid-pool.ts) and is the same everywhere (panel, device record,
// subscription token); the answer says `instant`. An empty reserve, a
// reserve the nodes have not confirmed or a failing take falls back to a
// fresh UUID and still creates the device. Hosts, keys and ids are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const INTERNAL = ["kovra", "internal", "create", "test"].join("-");
process.env.INTERNAL_API_KEY = INTERNAL; // read at module load by auth.ts
process.env.KOVRA_STATIC_PANELS = JSON.stringify([
  { key: "de", url: "https://panel.kovra.test/base", inboundId: 2, token: ["panel", "token", "test"].join("-") },
]);
delete process.env.KOVRA_UUID_POOL_SIZE;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");
const { registerUuidPoolScripts } = await import("./support/uuid-pool-twin.mjs");
const poolBody = await import("../src/lib/uuid-pool-body.ts");
const { POOL_READY_KEY: READY, POOL_TAKEN_KEY: TAKEN, POOL_SPENT_KEY: SPENT, POOL_SEEN_KEY: SEEN, POOL_MIN_AGE_MS } = poolBody;

const { NextRequest } = await import("next/server");
const { POST: create } = await import("../src/app/api/vpn/create/route.ts");

const USER = "tg_100000002";
const DAY = 86_400_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ANY_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const u = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const REGISTRY = [
  {
    key: "de",
    label: "Germany",
    enabled: true,
    priority: 0,
    source: "static",
    address: "de.kovra.test",
    port: 8443,
    serverName: "cover.kovra.test",
    publicKey: "TESTPUBLICKEYTESTPUBLICKEYTESTPUBLICKEY0000",
    shortId: "ab",
  },
];

/** Panel add requests seen: { uuid, email }. */
let panelAdds = [];
let panelAnswer = { status: 200, json: { success: true } };
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  registerUuidPoolScripts(mem, poolBody);
  mem.store.set("inbounds:registry", JSON.stringify(REGISTRY));
  mem.store.set(`subs:${USER}`, JSON.stringify([{ id: "p1", kind: "plan3", slots: 3, createdAt: 1, expiresAt: Date.now() + 30 * DAY }]));
  panelAdds = [];
  panelAnswer = { status: 200, json: { success: true } };
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href === "https://panel.kovra.test/base/panel/api/clients/add") {
      const body = JSON.parse(String(init.body));
      panelAdds.push({ uuid: body.client.id, email: body.client.email });
      return Response.json(panelAnswer.json, { status: panelAnswer.status });
    }
    if (href.startsWith("https://panel.kovra.test/base/panel/api/clients/update/")) return Response.json({ success: true });
    throw new Error(`unexpected fetch in test: ${href}`);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function post(userId = USER) {
  const res = await create(
    new NextRequest("https://kovra.test/api/vpn/create", {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": INTERNAL },
      body: JSON.stringify({ userId, deviceType: "iphone" }),
    }),
  );
  return { status: res.status, body: await res.json() };
}

const profiles = () => JSON.parse(mem.store.get(`profiles:${USER}`) ?? "[]");
const zset = (key) => mem.zsets.get(key) ?? new Map();

describe("POST /api/vpn/create takes the device UUID from the reserve", () => {
  test("a ready reserve UUID becomes the device's UUID everywhere, and the answer says instant", async () => {
    const P = u(0xa1);
    mem.zsets.set(READY, new Map([[P, Date.now() - POOL_MIN_AGE_MS - 60_000]]));
    const { status, body } = await post();
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.instant, true);
    const [dev] = profiles();
    assert.equal(dev.uuid, P, "the device record");
    assert.deepEqual(panelAdds.map((a) => a.uuid), [P], "the panel");
    assert.ok(body.vlessUrl.startsWith(`vless://${P}@`), "the link");
    assert.deepEqual(JSON.parse(mem.store.get(`sub_prof:${body.subToken}`)), { userId: USER, uuid: P }, "the subscription");
    assert.equal(mem.store.has(`hy2:${P}`), false, "no hy2: key: Hysteria2 decides from the device record (lib/hy2-access.ts)");
    assert.equal(zset(READY).size, 0);
    assert.equal(zset(TAKEN).size, 0, "the record exists: no longer in flight");
    assert.ok(zset(SPENT).has(P), "spent: a later deletion leaves the nodes by the clock");
  });

  test("an empty reserve: a fresh UUID, the device is created, not instant", async () => {
    const { status, body } = await post();
    assert.equal(status, 200);
    assert.equal(body.instant, false);
    const [dev] = profiles();
    assert.match(dev.uuid, UUID_V4);
    assert.deepEqual(panelAdds.map((a) => a.uuid), [dev.uuid]);
  });

  test("a reserve UUID too young for the nodes is not used", async () => {
    mem.zsets.set(READY, new Map([[u(0xa2), Date.now()]]));
    const { body } = await post();
    assert.equal(body.instant, false);
    assert.notEqual(profiles()[0].uuid, u(0xa2));
    assert.ok(zset(READY).has(u(0xa2)));
  });

  test("a reserve UUID a polling node has not confirmed yet is not used", async () => {
    const now = Date.now();
    mem.zsets.set(READY, new Map([[u(0xa6), now - 30 * 60_000]]));
    await mem.redis.hset(SEEN, { pl: now - 60 * 60_000 });
    const { status, body } = await post();
    assert.equal(status, 200);
    assert.equal(body.instant, false, "the screens show the notice");
    assert.notEqual(profiles()[0].uuid, u(0xa6));
    assert.ok(zset(READY).has(u(0xa6)));
  });

  test("Redis failing on the take never blocks the device", async () => {
    mem.zsets.set(READY, new Map([[u(0xa3), Date.now() - DAY]]));
    mem.failNext("eval");
    const { status, body } = await post();
    assert.equal(status, 200);
    assert.equal(body.instant, false);
    assert.match(profiles()[0].uuid, UUID_V4);
  });

  test("a refused request (no free slot) does not use up the reserve", async () => {
    mem.store.set(`subs:${USER}`, JSON.stringify([]));
    mem.zsets.set(READY, new Map([[u(0xa4), Date.now() - DAY]]));
    const { status } = await post();
    assert.equal(status, 403);
    assert.ok(zset(READY).has(u(0xa4)));
    assert.equal(zset(TAKEN).size, 0);
  });

  test("the panels refusing after the take: 503, and the UUID stays taken, never handed out again", async () => {
    const P = u(0xa5);
    mem.zsets.set(READY, new Map([[P, Date.now() - DAY]]));
    panelAnswer = { status: 400, json: { success: false, msg: "rejected" } };
    const { status } = await post();
    assert.equal(status, 503);
    assert.deepEqual(profiles(), []);
    assert.ok(zset(TAKEN).has(P), "left for the list build to retire");
    panelAnswer = { status: 200, json: { success: true } };
    const again = await post();
    assert.equal(again.body.instant, false);
    assert.notEqual(profiles()[0].uuid, P);
  });

  test("a creation that fails on Redis logs no UUID, even though the failed command names it", async () => {
    const P = u(0xa7);
    mem.zsets.set(READY, new Map([[P, Date.now() - DAY]]));
    // Upstash puts the failed command, values included, into its error text.
    // Since the hy2:<uuid> key is gone, the write that names the UUID is the
    // subscription token's record ({ userId, uuid }).
    const realSet = mem.redis.set;
    mem.redis.set = async (key, value, ...rest) => {
      if (String(key).startsWith("sub_prof:")) {
        throw Object.assign(new Error(`ERR injected set failure, command was: ${JSON.stringify(["set", key, value])}`), {
          name: "UpstashError",
        });
      }
      return realSet(key, value, ...rest);
    };
    const lines = [];
    const saved = console.error;
    console.error = (...args) => lines.push(args.map(String).join(" "));
    let status;
    try {
      ({ status } = await post());
    } finally {
      console.error = saved;
      mem.redis.set = realSet;
    }
    assert.equal(status, 500);
    assert.ok(lines.some((l) => l.includes("[vpn/create]") && l.includes("injected set failure")));
    for (const l of lines) assert.doesNotMatch(l, ANY_UUID);
  });

  test("two devices in a row get two different reserve UUIDs", async () => {
    const old = Date.now() - DAY;
    mem.zsets.set(READY, new Map([[u(0xb1), old], [u(0xb2), old + 1]]));
    const first = await post();
    await mem.redis.del(`rl:create:${USER}`);
    const second = await post();
    assert.equal(first.body.instant, true);
    assert.equal(second.body.instant, true);
    assert.deepEqual(profiles().map((p) => p.uuid), [u(0xb1), u(0xb2)]);
  });
});
