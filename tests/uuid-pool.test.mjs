// tests/uuid-pool.test.mjs — run: npm test
//
// The reserve of device UUIDs (src/lib/uuid-pool.ts, uuid-pool-body.ts) as
// the site uses it: /api/vpn/create takes one, and every build of the PRO
// nodes' list (src/lib/node-uuids.ts, GET /api/internal/node-uuids) refills,
// rotates and lists it. Runs on the in-memory Redis, with the JS twins of the
// scripts (tests/uuid-pool-lua.test.mjs proves them against the real Lua).
//
// The node side is modelled on the Kovra agent (ops kovra-pro-2026-09-25):
// it refuses a list that DROPS more than max(10, 25 %) of its live users,
// and removes users whose date passed by the clock. `agentPoll` does both.
//
// UUIDs and ids are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

delete process.env.KOVRA_UUID_POOL_SIZE;
process.env.KOVRA_NODE_TOKEN = ["node", "token", "for", "tests"].join("-");
delete process.env.KOVRA_NODE_MIN_ACTIVE;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");
const { registerUuidPoolScripts } = await import("./support/uuid-pool-twin.mjs");

const poolBody = await import("../src/lib/uuid-pool-body.ts");
const {
  POOL_READY_KEY: READY,
  POOL_TAKEN_KEY: TAKEN,
  POOL_RETIRED_KEY: RETIRED,
  POOL_SIZE_DEFAULT,
  POOL_MIN_AGE_MS,
  POOL_MAX_AGE_MS,
  POOL_ROTATE_PER_BUILD,
  TAKEN_GRACE_MS,
  poolLineUntil,
  reservePairs,
  uuidPoolSize,
} = poolBody;
const { takeDeviceUuid, releaseTakenMark } = await import("../src/lib/uuid-pool.ts");
const { readNodeUuidPairs, resetNodeUuidCache, REBUILD_EVERY_MS } = await import("../src/lib/node-uuids.ts");
const { buildNodeUuidsBody, NODE_BODY_WINDOW_MS } = await import("../src/lib/node-uuids-body.ts");
const { NextRequest } = await import("next/server");
const { GET: nodeUuidsGet } = await import("../src/app/api/internal/node-uuids/route.ts");

const NOW = 1_790_000_000_000;
const MIN = 60_000;
const DAY = 86_400_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const u = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const USER = "tg_100000001";
const OTHER = "em_other@kovra.test";
const DEV = u(0xd1);

const zset = (key) => mem.zsets.get(key) ?? new Map();
function seedReady(entries) {
  mem.zsets.set(READY, new Map(entries));
}
function setUser(userId, profiles, subs) {
  mem.store.set(`profiles:${userId}`, JSON.stringify(profiles));
  mem.store.set(`subs:${userId}`, JSON.stringify(subs));
}
const plan = (slots, expiresAt) => ({ id: `s${slots}${expiresAt}`, kind: slots === 3 ? "plan3" : "plan1", slots, createdAt: 1, expiresAt });
const device = (uuid, createdAt) => ({ uuid, clientEmail: `vpn_${createdAt}`, vlessUrl: "", createdAt, deviceType: "iphone" });

/** A build as the endpoint makes it: pairs + reserve → the answer's lines. */
async function answer(now) {
  const read = await readNodeUuidPairs(now);
  const built = buildNodeUuidsBody(read.pairs, now, 1, read.reserve);
  assert.equal(built.ok, true, "the answer is not refused");
  const lines = new Map(
    built.body
      .trim()
      .split("\n")
      .map((l) => l.split(" "))
      .map(([id, until]) => [id, Number(until)]),
  );
  return { read, built, lines };
}

/**
 * One poll of a node agent: the guard (refuse a list dropping more than
 * max(10, 25 %) of live users), then desired = lines dated ahead. Returns the
 * users live after the poll and what the guard saw.
 */
function agentPoll(live, lines, now) {
  const dropped = [...live].filter((id) => !lines.has(id));
  if (live.size > 0 && dropped.length > Math.max(10, 0.25 * live.size)) return { live, dropped, refused: true };
  const next = new Set([...lines].filter(([, until]) => until > now).map(([id]) => id));
  return { live: next, dropped, refused: false };
}

beforeEach(() => {
  mem.reset();
  registerUuidPoolScripts(mem, poolBody);
  resetNodeUuidCache();
  delete process.env.KOVRA_UUID_POOL_SIZE;
  // A paying device, so an answer is never refused for "too few live".
  setUser(OTHER, [device(DEV, 1)], [plan(1, NOW + 30 * DAY)]);
});
afterEach(() => {
  delete process.env.KOVRA_UUID_POOL_SIZE;
});

describe("uuidPoolSize", () => {
  test("default 10 (the agents' refusal floor), 0 turns it off, capped at 100, junk gives the default", () => {
    assert.equal(POOL_SIZE_DEFAULT, 10);
    assert.equal(uuidPoolSize(undefined), 10);
    assert.equal(uuidPoolSize(""), 10);
    assert.equal(uuidPoolSize("0"), 0);
    assert.equal(uuidPoolSize(" 12 "), 12);
    assert.equal(uuidPoolSize("5000"), 100);
    for (const junk of ["-1", "2.5", "ten", "1e3"]) assert.equal(uuidPoolSize(junk), 10, junk);
  });

  test("a rollback that stops listing a default reserve at once is still accepted by the agents", async () => {
    let live = new Set();
    const { lines } = await answer(NOW);
    live = agentPoll(live, lines, NOW).live;
    assert.equal(live.size, 1 + POOL_SIZE_DEFAULT);
    // The old code lists the devices only.
    const onlyDevices = new Map([...lines].filter(([id]) => id === DEV));
    const r = agentPoll(live, onlyDevices, NOW + 2 * MIN);
    assert.equal(r.dropped.length, POOL_SIZE_DEFAULT);
    assert.equal(r.refused, false);
  });
});

describe("takeDeviceUuid", () => {
  test("takes the oldest reserve UUID that every node has had time to load: instant", async () => {
    seedReady([
      [u(1), NOW - 2 * DAY],
      [u(2), NOW - 3 * DAY],
      [u(3), NOW - MIN],
    ]);
    const got = await takeDeviceUuid(NOW);
    assert.deepEqual(got, { uuid: u(2), instant: true });
    assert.deepEqual([...zset(READY).keys()].sort(), [u(1), u(3)]);
    assert.deepEqual([...zset(TAKEN)], [[u(2), NOW]], "marked taken at once, in the same script");
  });

  test("an empty reserve: a fresh random UUID, as before, not instant", async () => {
    const got = await takeDeviceUuid(NOW);
    assert.match(got.uuid, UUID_V4);
    assert.equal(got.instant, false);
    assert.equal(zset(TAKEN).size, 0);
  });

  test("a reserve too young to be on the nodes counts as empty", async () => {
    seedReady([[u(1), NOW - POOL_MIN_AGE_MS + 1]]);
    const got = await takeDeviceUuid(NOW);
    assert.equal(got.instant, false);
    assert.notEqual(got.uuid, u(1));
    assert.equal(zset(READY).size, 1, "left for later");
  });

  test("Redis failing on the take never blocks a device: fresh UUID", async () => {
    seedReady([[u(1), NOW - DAY]]);
    mem.failNext("eval");
    const got = await takeDeviceUuid(NOW);
    assert.equal(got.instant, false);
    assert.match(got.uuid, UUID_V4);
  });

  test("an unexpected reply is not trusted: fresh UUID", async () => {
    const saved = mem.redis.eval;
    mem.redis.eval = async () => ["ok", "not-a-uuid"];
    try {
      const got = await takeDeviceUuid(NOW);
      assert.equal(got.instant, false);
      assert.match(got.uuid, UUID_V4);
    } finally {
      mem.redis.eval = saved;
    }
  });

  test("KOVRA_UUID_POOL_SIZE=0: the reserve is not touched at all", async () => {
    process.env.KOVRA_UUID_POOL_SIZE = "0";
    seedReady([[u(1), NOW - DAY]]);
    const got = await takeDeviceUuid(NOW);
    assert.equal(got.instant, false);
    assert.equal(mem.calls.get("eval") ?? 0, 0);
    assert.equal(zset(READY).size, 1);
  });

  test("concurrent creations never share a UUID: each reserve UUID goes to one, the rest get fresh ones", async () => {
    const reserve = Array.from({ length: 5 }, (_, i) => [u(10 + i), NOW - DAY - i]);
    seedReady(reserve);
    const got = await Promise.all(Array.from({ length: 20 }, () => takeDeviceUuid(NOW)));
    const ids = got.map((g) => g.uuid);
    assert.equal(new Set(ids).size, 20, "no duplicate UUID");
    const fromPool = got.filter((g) => g.instant).map((g) => g.uuid);
    assert.deepEqual(fromPool.sort(), reserve.map(([id]) => id).sort(), "all five reserve UUIDs, once each");
    assert.equal(got.filter((g) => !g.instant).length, 15);
    assert.equal(zset(READY).size, 0);
    assert.deepEqual([...zset(TAKEN).keys()].sort(), fromPool);
  });

  test("releaseTakenMark drops the mark and never throws", async () => {
    mem.zsets.set(TAKEN, new Map([[u(1), NOW], [u(2), NOW]]));
    await releaseTakenMark(u(1));
    assert.deepEqual([...zset(TAKEN).keys()], [u(2)]);
    mem.failNext("zrem");
    await releaseTakenMark(u(2));
    assert.deepEqual([...zset(TAKEN).keys()], [u(2)], "a failure leaves the mark for the list build to drop");
  });
});

describe("the node list carries the reserve", () => {
  test("a build fills the reserve and lists it 48 h ahead; reserve lines are not live devices", async () => {
    const { read, built, lines } = await answer(NOW);
    assert.equal(zset(READY).size, POOL_SIZE_DEFAULT);
    assert.equal(read.reserve.length, POOL_SIZE_DEFAULT);
    assert.equal(built.reserve, POOL_SIZE_DEFAULT);
    assert.equal(built.live, 1, "only the paying device counts as live");
    assert.equal(built.total, 1);
    for (const id of zset(READY).keys()) assert.equal(lines.get(id), poolLineUntil(NOW));
    assert.ok(poolLineUntil(NOW) >= NOW + 47 * 3_600_000);
    assert.equal(read.pool.ready, POOL_SIZE_DEFAULT);
    assert.equal(read.pool.mature, 0, "just added: not handed out yet");
  });

  test("the reserve alone never passes the live minimum: a read that lost the devices is still refused", async () => {
    mem.store.delete(`profiles:${OTHER}`);
    const read = await readNodeUuidPairs(NOW);
    assert.equal(read.reserve.length, POOL_SIZE_DEFAULT);
    const built = buildNodeUuidsBody(read.pairs, NOW, 1, read.reserve);
    assert.deepEqual(built, { ok: false, reason: "too-few-live", live: 0, total: 0, min: 1 });
  });

  test("the reserve never grows past the cap, over many builds and cache windows", async () => {
    process.env.KOVRA_UUID_POOL_SIZE = "3";
    for (let i = 0; i < 20; i += 1) {
      resetNodeUuidCache();
      await readNodeUuidPairs(NOW + i * REBUILD_EVERY_MS);
      assert.ok(zset(READY).size <= 3, `build ${i}: ${zset(READY).size}`);
    }
    assert.equal(zset(READY).size, 3);
  });

  test("the answer's ETag does not move within the hour: the reserve does not wake the agents", async () => {
    const hour = Math.floor(NOW / 3_600_000) * 3_600_000;
    const a = await answer(hour + 5 * MIN);
    const b = await answer(hour + 5 * MIN + REBUILD_EVERY_MS);
    assert.equal(a.built.etag, b.built.etag);
  });

  test("a failing reserve script fails the build: 503, the nodes keep what they have", async () => {
    mem.failNext("eval");
    const res = await nodeUuidsGet(nodeReq("fail1"));
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "storage unreadable" });
  });

  test("the endpoint says how many reserve lines it carries", async () => {
    const res = await nodeUuidsGet(nodeReq("ok1"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Node-Reserve"), String(POOL_SIZE_DEFAULT));
    assert.equal(res.headers.get("X-Node-Live"), "1");
    assert.equal((await res.text()).trim().split("\n").length, 1 + POOL_SIZE_DEFAULT);
  });
});

function nodeReq(node) {
  return new NextRequest(`https://kovra.test/api/internal/node-uuids?node=${node}`, {
    headers: { authorization: `Bearer ${process.env.KOVRA_NODE_TOKEN}` },
  });
}

describe("a taken UUID stays on the nodes without a gap", () => {
  /** A build's line for `id` must be dated ahead of `now`. */
  const listedAhead = (lines, id, now, step) => {
    assert.ok(lines.has(id), `${step}: listed`);
    assert.ok(lines.get(id) > now, `${step}: dated ahead`);
  };

  test("reserve → taken → device record, across cache windows", async () => {
    const t0 = NOW;
    await answer(t0); // fills the reserve
    const t1 = t0 + POOL_MIN_AGE_MS + MIN;
    resetNodeUuidCache();
    let { lines } = await answer(t1);
    const { uuid, instant } = await takeDeviceUuid(t1 + 5_000);
    assert.equal(instant, true);
    listedAhead(lines, uuid, t1, "before the take");

    // Same instance, inside the cache window: the cached answer still has it.
    ({ lines } = await answer(t1 + 10_000));
    listedAhead(lines, uuid, t1 + 10_000, "cached");

    // Next window, the device record not written yet: listed as taken.
    const t2 = t1 + REBUILD_EVERY_MS + 1;
    let read;
    ({ lines, read } = await answer(t2));
    listedAhead(lines, uuid, t2, "taken, no record yet");
    assert.ok(read.reserve.some((p) => p.uuid === uuid));

    // /api/vpn/create writes the record, then drops the mark.
    setUser(USER, [device(uuid, t2 + 1_000)], [plan(3, t2 + 30 * DAY)]);
    await releaseTakenMark(uuid);

    const t3 = t2 + REBUILD_EVERY_MS + 1;
    ({ lines, read } = await answer(t3));
    assert.equal(lines.get(uuid), t2 + 30 * DAY, "now the device's own date");
    assert.ok(!read.reserve.some((p) => p.uuid === uuid), "no longer a reserve line");
  });

  test("a take between the build's reserve read and its profile read: still listed", async () => {
    seedReady([[u(1), NOW - DAY]]);
    let taken = null;
    mem.beforeNext("scan", {
      run: async () => {
        taken = await takeDeviceUuid(NOW);
      },
    });
    const { lines } = await answer(NOW);
    assert.equal(taken.uuid, u(1));
    assert.equal(lines.get(u(1)), poolLineUntil(NOW), "the reserve read had it");
  });

  test("the record written and the mark dropped in the same gap: still listed, by the record", async () => {
    seedReady([[u(1), NOW - DAY]]);
    const { uuid } = await takeDeviceUuid(NOW - 5_000);
    mem.beforeNext("scan", {
      run: async () => {
        setUser(USER, [device(uuid, NOW - 1_000)], [plan(1, NOW + 10 * DAY)]);
        await releaseTakenMark(uuid);
      },
    });
    const { lines } = await answer(NOW);
    assert.equal(lines.get(uuid), NOW + 10 * DAY);
  });

  test("a node agent keeps the device across the whole sequence, and nothing counts as dropped", async () => {
    let live = new Set();
    let t = NOW;
    const poll = async () => {
      resetNodeUuidCache();
      const { lines } = await answer(t);
      const r = agentPoll(live, lines, t);
      assert.equal(r.refused, false);
      assert.deepEqual(r.dropped, [], `nothing dropped at +${(t - NOW) / MIN} min`);
      live = r.live;
      t += 2 * MIN;
    };
    await poll();
    t += POOL_MIN_AGE_MS;
    await poll();
    const { uuid } = await takeDeviceUuid(t);
    assert.ok(live.has(uuid), "the node had it before the device existed");
    await poll();
    setUser(USER, [device(uuid, t)], [plan(1, t + 30 * DAY)]);
    await releaseTakenMark(uuid);
    for (let i = 0; i < 5; i += 1) {
      await poll();
      assert.ok(live.has(uuid));
    }
  });
});

describe("the device record decides: the reserve keeps no one alive", () => {
  test("a paused device with a lingering taken mark is not listed, and the mark is dropped", async () => {
    // P came from the reserve; a newer device Q took the only slot, so P is
    // paused (device-capacity.ts). P's mark was never released.
    const P = u(0x51);
    const Q = u(0x52);
    mem.zsets.set(TAKEN, new Map([[P, NOW - MIN]]));
    setUser(USER, [device(P, NOW - 2 * MIN), device(Q, NOW - MIN)], [plan(1, NOW + 30 * DAY)]);
    const { lines } = await answer(NOW);
    assert.ok(!lines.has(P), "paused: off the nodes");
    assert.equal(lines.get(Q), NOW + 30 * DAY);
    assert.ok(!zset(TAKEN).has(P), "the build dropped the mark once it saw the record");
  });

  test("a deleted device is not brought back by its old mark", async () => {
    const P = u(0x61);
    mem.zsets.set(TAKEN, new Map([[P, NOW - MIN]]));
    setUser(USER, [device(P, NOW - MIN)], [plan(1, NOW + 30 * DAY)]);
    await answer(NOW); // sees the record, drops the mark
    setUser(USER, [], [plan(1, NOW + 30 * DAY)]);
    resetNodeUuidCache();
    const { lines } = await answer(NOW + REBUILD_EVERY_MS);
    assert.ok(!lines.has(P));
  });

  test("a device whose plan ended keeps its past date, not the reserve's", async () => {
    const P = u(0x71);
    mem.zsets.set(TAKEN, new Map([[P, NOW - MIN]]));
    const ended = NOW - 2 * 3_600_000;
    setUser(USER, [device(P, NOW - MIN)], [plan(1, ended)]);
    const { lines } = await answer(NOW);
    assert.equal(lines.get(P), ended, "removed by the clock on the nodes");
  });

  test("reservePairs never lists a UUID that has a device record", () => {
    const state = {
      ready: [{ uuid: u(1), at: NOW }],
      taken: [{ uuid: u(2), at: NOW }],
      retired: [{ uuid: u(3), at: NOW - MIN }],
      added: 0,
      rotated: 0,
      malformed: 0,
    };
    assert.deepEqual(reservePairs(state, new Set([u(1), u(2), u(3)]), NOW), []);
  });
});

describe("a taken UUID whose device never appeared", () => {
  test("listed ahead within the grace, then with a past date, then gone", async () => {
    const P = u(0x81);
    mem.zsets.set(TAKEN, new Map([[P, NOW]]));
    let { lines } = await answer(NOW + TAKEN_GRACE_MS - 1);
    assert.equal(lines.get(P), poolLineUntil(NOW + TAKEN_GRACE_MS - 1));
    resetNodeUuidCache();
    ({ lines } = await answer(NOW + TAKEN_GRACE_MS));
    assert.equal(lines.get(P), NOW + TAKEN_GRACE_MS, "an expiry: the nodes remove it by the clock");
    resetNodeUuidCache();
    ({ lines } = await answer(NOW + TAKEN_GRACE_MS + NODE_BODY_WINDOW_MS));
    assert.ok(!lines.has(P), "out of the answer after the window");
    resetNodeUuidCache();
    await answer(NOW + TAKEN_GRACE_MS + NODE_BODY_WINDOW_MS + 2 * 3_600_000);
    assert.ok(!zset(TAKEN).has(P), "and the mark is forgotten");
  });
});

describe("rotation", () => {
  test("old reserve UUIDs leave a few per build, as expiries: the agents' guard never sees a drop", async () => {
    const old = Array.from({ length: POOL_SIZE_DEFAULT }, (_, i) => [u(0x100 + i), NOW - POOL_MAX_AGE_MS - i * MIN]);
    seedReady(old);
    let live = new Set([DEV, ...old.map(([id]) => id)]);
    let t = NOW;
    const retiredSeen = new Set();
    for (let build = 0; build < 12; build += 1) {
      resetNodeUuidCache();
      const before = zset(RETIRED).size;
      const { lines, read } = await answer(t);
      const now = zset(RETIRED).size;
      assert.ok(now - before <= POOL_ROTATE_PER_BUILD, `build ${build}: at most ${POOL_ROTATE_PER_BUILD} retired`);
      assert.ok(read.pool.rotated <= POOL_ROTATE_PER_BUILD);
      for (const id of zset(RETIRED).keys()) {
        assert.ok(lines.get(id) <= t, "a retired UUID is listed with a past date");
        retiredSeen.add(id);
      }
      const r = agentPoll(live, lines, t);
      assert.equal(r.refused, false);
      assert.deepEqual(r.dropped, [], "retired lines are expiries, not drops");
      live = r.live;
      for (const id of retiredSeen) assert.ok(!live.has(id), "the node removed it by the clock");
      assert.equal(zset(READY).size, POOL_SIZE_DEFAULT, "refilled to the cap in the same build");
      t += REBUILD_EVERY_MS;
    }
    assert.equal(retiredSeen.size, POOL_SIZE_DEFAULT, "all old ones rotated out within a few builds");
    assert.ok(live.has(DEV));
  });

  test("retired lines leave the answer after the window, and the marks are forgotten", async () => {
    mem.zsets.set(RETIRED, new Map([[u(1), NOW]]));
    let { lines } = await answer(NOW + NODE_BODY_WINDOW_MS - 1);
    assert.equal(lines.get(u(1)), NOW);
    resetNodeUuidCache();
    ({ lines } = await answer(NOW + NODE_BODY_WINDOW_MS));
    assert.ok(!lines.has(u(1)));
    resetNodeUuidCache();
    await answer(NOW + NODE_BODY_WINDOW_MS + 2 * 3_600_000);
    assert.equal(zset(RETIRED).size, 0);
  });

  test("KOVRA_UUID_POOL_SIZE=0 drains the reserve a few per build, without drops", async () => {
    seedReady(Array.from({ length: 5 }, (_, i) => [u(0x200 + i), NOW - DAY - i]));
    process.env.KOVRA_UUID_POOL_SIZE = "0";
    let live = new Set([DEV, ...zset(READY).keys()]);
    for (let build = 0; build < 4; build += 1) {
      resetNodeUuidCache();
      const t = NOW + build * REBUILD_EVERY_MS;
      const { lines } = await answer(t);
      const r = agentPoll(live, lines, t);
      assert.deepEqual(r.dropped, []);
      live = r.live;
    }
    assert.equal(zset(READY).size, 0);
    assert.deepEqual([...live], [DEV]);
  });
});
