// tests/uuid-pool.test.mjs — run: npm test
//
// The reserve of device UUIDs (src/lib/uuid-pool.ts, uuid-pool-body.ts) as
// the site uses it: /api/vpn/create takes one, every build of the PRO nodes'
// list (src/lib/node-uuids.ts, GET /api/internal/node-uuids) lists it from
// the instance's view (refilled and rotated at most every POOL_REFRESH_MS),
// and a node's 304 counts as its confirmation. Runs on the in-memory Redis,
// with the JS twins of the scripts (tests/uuid-pool-lua.test.mjs proves them
// against the real Lua).
//
// The node side is modelled on the Kovra agent (ops kovra-pro-2026-09-25,
// kovra-agent.sh): it refuses a list that DROPS more than max(10, 25 %) of
// its live users and then keeps its stored list; either way its live users
// are the stored lines dated ahead, by its clock. `Agent` does exactly that.
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
  POOL_SPENT_KEY: SPENT,
  POOL_SEEN_KEY: SEEN,
  POOL_SIZE_DEFAULT,
  POOL_MIN_AGE_MS,
  POOL_MAX_AGE_MS,
  POOL_REFRESH_MS,
  POOL_ROTATE_PER_PASS,
  POOL_LINE_AHEAD_MS,
  TAKEN_GRACE_MS,
  SEEN_HORIZON_MS,
  SEEN_FORGET_MS,
  SEEN_MARGIN_MS,
  keepMature,
  poolLineUntil,
  reservePairs,
  takeLimit,
  uuidPoolSize,
} = poolBody;
const { takeDeviceUuid, releaseTakenMark, noteNodeConfirmed, resetUuidPoolInstance, SEEN_WRITE_EVERY_MS } = await import(
  "../src/lib/uuid-pool.ts"
);
const { readDevicePairs, readNodeUuidPairs, resetNodeUuidCache, REBUILD_EVERY_MS } = await import("../src/lib/node-uuids.ts");
const { buildNodeUuidsBody, NODE_BODY_WINDOW_MS } = await import("../src/lib/node-uuids-body.ts");
const { NextRequest } = await import("next/server");
const { GET: nodeUuidsGet } = await import("../src/app/api/internal/node-uuids/route.ts");

const NOW = 1_790_000_000_000;
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ANY_UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
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

/** Forget this instance's pairs and reserve view: the next build reads everything. */
function coldInstance() {
  resetNodeUuidCache();
  resetUuidPoolInstance();
}

/** A build as the endpoint makes it (caches as they are): pairs + reserve → the answer's lines. */
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

/** The next cache window of the same instance: new pairs, the reserve view reused while young. */
async function rebuild(now) {
  resetNodeUuidCache();
  return answer(now);
}

/**
 * The Kovra agent (kovra-agent.sh step 3 and 4): a list that drops more than
 * max(10, 25 %) of the live users outright is refused and the stored list is
 * kept; live users are the stored lines dated ahead of now.
 */
class Agent {
  constructor() {
    this.stored = new Map();
    this.live = new Set();
    this.refused = false;
  }

  poll(lines, now) {
    const dropped = [...this.live].filter((id) => !lines.has(id));
    this.refused = this.live.size > 0 && dropped.length > Math.max(10, 0.25 * this.live.size);
    if (!this.refused) this.stored = lines;
    this.live = new Set([...this.stored].filter(([, until]) => until > now).map(([id]) => id));
    return dropped;
  }
}

/** Collect console output of `fn` (log and error). */
async function captureLogs(fn) {
  const lines = [];
  const saved = { log: console.log, error: console.error, warn: console.warn };
  for (const k of Object.keys(saved)) console[k] = (...args) => lines.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    Object.assign(console, saved);
  }
  return lines;
}

function nodeReq(node, etag) {
  return new NextRequest(`https://kovra.test/api/internal/node-uuids?node=${node}`, {
    headers: { authorization: `Bearer ${process.env.KOVRA_NODE_TOKEN}`, ...(etag ? { "if-none-match": etag } : {}) },
  });
}

beforeEach(() => {
  mem.reset();
  registerUuidPoolScripts(mem, poolBody);
  coldInstance();
  delete process.env.KOVRA_UUID_POOL_SIZE;
  // A paying device, so an answer is never refused for "too few live".
  setUser(OTHER, [device(DEV, 1)], [plan(1, NOW + 30 * DAY)]);
});
afterEach(() => {
  delete process.env.KOVRA_UUID_POOL_SIZE;
});

describe("sizes and timings", () => {
  test("default 5, half the agents' refusal floor; 0 turns it off; capped at 20; junk gives the default", () => {
    assert.equal(POOL_SIZE_DEFAULT, 5);
    assert.ok(2 * POOL_SIZE_DEFAULT <= 10, "a rollback leaves room for as many ordinary drops");
    assert.equal(uuidPoolSize(undefined), 5);
    assert.equal(uuidPoolSize(""), 5);
    assert.equal(uuidPoolSize("0"), 0);
    assert.equal(uuidPoolSize(" 12 "), 12);
    assert.equal(uuidPoolSize("5000"), 20);
    for (const junk of ["-1", "2.5", "ten", "1e3"]) assert.equal(uuidPoolSize(junk), 5, junk);
  });

  test("a UUID is handed out only after every served list carries it", () => {
    // A view lives POOL_REFRESH_MS, a cached list REBUILD_EVERY_MS on top.
    assert.ok(POOL_MIN_AGE_MS > POOL_REFRESH_MS + REBUILD_EVERY_MS + SEEN_MARGIN_MS);
  });

  test("reserve lines are dated at most 6 h ahead, and move once an hour", () => {
    assert.equal(POOL_LINE_AHEAD_MS, 6 * HOUR);
    const hour = Math.floor(NOW / HOUR) * HOUR;
    assert.equal(poolLineUntil(hour + 59 * MIN), hour + 6 * HOUR);
    assert.equal(poolLineUntil(hour + HOUR), hour + 7 * HOUR);
    assert.ok(poolLineUntil(NOW) <= NOW + POOL_LINE_AHEAD_MS);
  });
});

describe("takeLimit: which ready UUIDs a device may take", () => {
  test("no node known: the age alone", () => {
    assert.deepEqual(takeLimit(NOW, null), { latest: NOW - POOL_MIN_AGE_MS, fresh: 0, stale: 0, forget: [] });
    assert.deepEqual(takeLimit(NOW, {}), { latest: NOW - POOL_MIN_AGE_MS, fresh: 0, stale: 0, forget: [] });
  });

  test("the oldest recent confirmation bounds it, minus the clock margin; the age still applies", () => {
    const got = takeLimit(NOW, { pl: NOW - 30 * MIN, se: String(NOW - 2 * MIN), fi: NOW - 50 * MIN });
    assert.deepEqual(got, { latest: NOW - 50 * MIN - SEEN_MARGIN_MS, fresh: 3, stale: 0, forget: [] });
    assert.equal(takeLimit(NOW, { pl: NOW - MIN }).latest, NOW - POOL_MIN_AGE_MS);
  });

  test("a node silent past the horizon is left out; all of them silent: nothing is handed out", () => {
    const mixed = takeLimit(NOW, { pl: NOW - 5 * MIN, kz: NOW - SEEN_HORIZON_MS - MIN });
    assert.equal(mixed.latest, NOW - POOL_MIN_AGE_MS);
    assert.equal(mixed.stale, 1);
    const silent = takeLimit(NOW, { pl: NOW - 3 * HOUR, kz: NOW - 5 * HOUR });
    assert.equal(silent.latest, null);
  });

  test("a node silent for a week, a junk field or junk value is to be forgotten", () => {
    const got = takeLimit(NOW, { old: NOW - SEEN_FORGET_MS, "Bad Name": NOW, tr: "soon", pl: NOW - MIN });
    assert.deepEqual(got.forget.sort(), ["Bad Name", "old", "tr"]);
    assert.equal(got.fresh, 1);
  });

  test("a confirmation from a clock ahead counts as now", () => {
    assert.equal(takeLimit(NOW, { pl: NOW + HOUR }).latest, NOW - POOL_MIN_AGE_MS);
  });
});

describe("takeDeviceUuid", () => {
  test("takes the oldest eligible reserve UUID: instant", async () => {
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

  test("a UUID added after a node's last confirmation waits for that node", async () => {
    seedReady([[u(1), NOW - 20 * MIN]]);
    await mem.redis.hset(SEEN, { pl: NOW - 30 * MIN, se: NOW - MIN });
    const held = await takeDeviceUuid(NOW);
    assert.equal(held.instant, false, "pl has not confirmed a list with it");
    assert.ok(zset(READY).has(u(1)));
    await mem.redis.hset(SEEN, { pl: NOW - MIN });
    assert.deepEqual(await takeDeviceUuid(NOW), { uuid: u(1), instant: true });
  });

  test("every known node silent for hours: nothing is handed out, the reserve is untouched", async () => {
    seedReady([[u(1), NOW - DAY]]);
    await mem.redis.hset(SEEN, { pl: NOW - 3 * HOUR, se: NOW - 4 * HOUR });
    const got = await takeDeviceUuid(NOW);
    assert.equal(got.instant, false);
    assert.equal(mem.calls.get("eval") ?? 0, 0);
    assert.ok(zset(READY).has(u(1)));
  });

  test("a node silent for a week is forgotten and does not hold anything back", async () => {
    seedReady([[u(1), NOW - DAY]]);
    await mem.redis.hset(SEEN, { gone: NOW - SEEN_FORGET_MS - 1, pl: NOW - MIN });
    const got = await takeDeviceUuid(NOW);
    assert.equal(got.instant, true);
    assert.deepEqual(Object.keys(await mem.redis.hgetall(SEEN)), ["pl"]);
  });

  test("Redis failing on the take (either call) never blocks a device: fresh UUID", async () => {
    seedReady([[u(1), NOW - DAY]]);
    for (const op of ["eval", "hgetall"]) {
      mem.failNext(op);
      const got = await takeDeviceUuid(NOW);
      assert.equal(got.instant, false, op);
      assert.match(got.uuid, UUID_V4);
    }
    assert.ok(zset(READY).has(u(1)));
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
    assert.equal(mem.calls.get("hgetall") ?? 0, 0);
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

  test("releaseTakenMark moves the mark to spent in one MULTI and never throws", async () => {
    mem.zsets.set(TAKEN, new Map([[u(1), NOW - MIN], [u(2), NOW - MIN]]));
    await releaseTakenMark(u(1), NOW);
    assert.deepEqual([...zset(TAKEN).keys()], [u(2)]);
    assert.deepEqual([...zset(SPENT)], [[u(1), NOW]]);
    mem.failNext("exec");
    const logs = await captureLogs(() => releaseTakenMark(u(2), NOW));
    assert.deepEqual([...zset(TAKEN).keys()], [u(2)], "a failure leaves the taken mark, which then ages out");
    assert.ok(logs.some((l) => l.includes("uuidpool.release_failed")));
  });

  test("a failed release logs no UUID, even when the Redis error quotes the command", async () => {
    const saved = mem.redis.multi;
    mem.redis.multi = () => {
      const tx = {
        zadd: () => tx,
        zrem: () => tx,
        exec: async () => {
          throw Object.assign(new Error(`ERR max requests limit exceeded, command was: [["zadd","${SPENT}",1,"${u(7)}"]]`), {
            name: "UpstashError",
          });
        },
      };
      return tx;
    };
    try {
      const logs = await captureLogs(() => releaseTakenMark(u(7), NOW));
      assert.equal(logs.length, 1);
      assert.match(logs[0], /max requests limit exceeded/);
      assert.doesNotMatch(logs[0], ANY_UUID);
      assert.doesNotMatch(logs[0], /command was/);
    } finally {
      mem.redis.multi = saved;
    }
  });
});

describe("the node list carries the reserve", () => {
  test("a build fills the reserve and lists it 6 h ahead; reserve lines are not live devices", async () => {
    const { read, built, lines } = await answer(NOW);
    assert.equal(zset(READY).size, POOL_SIZE_DEFAULT);
    assert.equal(read.reserve.length, POOL_SIZE_DEFAULT);
    assert.equal(built.reserve, POOL_SIZE_DEFAULT);
    assert.equal(built.live, 1, "only the paying device counts as live");
    assert.equal(built.total, 1);
    for (const id of zset(READY).keys()) assert.equal(lines.get(id), poolLineUntil(NOW));
    assert.equal(read.pool.ready, POOL_SIZE_DEFAULT);
    assert.equal(read.pool.mature, 0, "just added: not handed out yet");
    assert.equal(read.poolAt, NOW);
  });

  test("the reserve alone never passes the live minimum: a read that lost the devices is still refused", async () => {
    mem.store.delete(`profiles:${OTHER}`);
    const read = await readNodeUuidPairs(NOW);
    assert.equal(read.reserve.length, POOL_SIZE_DEFAULT);
    const built = buildNodeUuidsBody(read.pairs, NOW, 1, read.reserve);
    assert.deepEqual(built, { ok: false, reason: "too-few-live", live: 0, total: 0, min: 1 });
  });

  test("the reserve never grows past the cap, over many refreshes and instances", async () => {
    process.env.KOVRA_UUID_POOL_SIZE = "3";
    for (let i = 0; i < 20; i += 1) {
      coldInstance();
      await readNodeUuidPairs(NOW + i * POOL_REFRESH_MS);
      assert.ok(zset(READY).size <= 3, `refresh ${i}: ${zset(READY).size}`);
    }
    assert.equal(zset(READY).size, 3);
  });

  test("the view is refreshed at most every POOL_REFRESH_MS: one script per 5 minutes, not per build", async () => {
    for (let t = NOW; t <= NOW + 12 * MIN; t += REBUILD_EVERY_MS) await rebuild(t);
    assert.equal(mem.calls.get("eval"), 3, "at 0, 5 and 10 minutes");
    assert.equal(mem.calls.get("zrange") ?? 0, 0, "no plain reads while the script works");
  });

  test("the view log is written when it changes, not on every build", async () => {
    const logs = await captureLogs(async () => {
      for (let t = NOW; t <= NOW + 30 * MIN; t += REBUILD_EVERY_MS) await rebuild(t);
    });
    const views = logs.filter((l) => l.includes("uuidpool.view"));
    assert.ok(views.length >= 1 && views.length <= 3, `${views.length} view lines in 31 builds`);
    for (const l of logs) assert.doesNotMatch(l, ANY_UUID);
  });

  test("the answer's ETag does not move within the hour: the reserve does not wake the agents", async () => {
    const hour = Math.floor(NOW / HOUR) * HOUR;
    const a = await answer(hour + 5 * MIN);
    const b = await rebuild(hour + 5 * MIN + REBUILD_EVERY_MS);
    coldInstance();
    const c = await answer(hour + 5 * MIN + 2 * REBUILD_EVERY_MS);
    assert.equal(a.built.etag, b.built.etag);
    assert.equal(a.built.etag, c.built.etag, "another instance lists the same");
  });

  test("the script failing does not fail the list: the sets are read with plain commands", async () => {
    seedReady([[u(1), NOW - DAY], [u(2), NOW - HOUR]]);
    const saved = mem.redis.eval;
    mem.redis.eval = async () => {
      throw Object.assign(new Error(`ERR Error compiling script, command was: ["eval","…",3,"a","b","c","${u(99)}"]`), {
        name: "UpstashError",
      });
    };
    let got;
    let logs;
    try {
      logs = await captureLogs(async () => {
        got = await answer(NOW);
      });
    } finally {
      mem.redis.eval = saved;
    }
    assert.equal(got.lines.get(u(1)), poolLineUntil(NOW));
    assert.equal(got.lines.get(u(2)), poolLineUntil(NOW));
    assert.equal(got.read.pool.ready, 2, "nothing refilled without the script, but nothing lost");
    assert.equal(mem.calls.get("zrange"), 3, "ready, taken, spent");
    assert.ok(logs.some((l) => l.includes("uuidpool.maintain_failed")));
    for (const l of logs) assert.doesNotMatch(l, ANY_UUID, "no UUID in the logs");
  });

  test("the plain read misses no UUID that moves between its three reads", async () => {
    seedReady([[u(1), NOW - DAY], [u(2), NOW - DAY + 1]]);
    // Taken after `ready` was read, before `taken` is: caught as taken.
    mem.failNext("eval"); // the script fails once; the take still runs
    let first;
    mem.beforeNext("zrange", { key: /uuidpool:taken$/, run: async () => (first = await takeDeviceUuid(NOW)) });
    let { read, lines } = await answer(NOW);
    assert.equal(first.uuid, u(1));
    assert.equal(read.pool.taken, 1);
    assert.equal(lines.get(u(1)), poolLineUntil(NOW), "in flight: listed ahead");

    // Released (and the device deleted) after `taken` was read, before `spent` is: caught as spent.
    coldInstance();
    const second = await takeDeviceUuid(NOW);
    mem.failNext("eval");
    mem.beforeNext("zrange", { key: /uuidpool:spent$/, run: () => releaseTakenMark(second.uuid, NOW) });
    ({ read, lines } = await answer(NOW + MIN));
    assert.equal(second.uuid, u(2));
    assert.equal(lines.get(u(2)), NOW, "listed with a past date, not missing");
  });

  test("the reserve unreadable: the last view serves; with no view at all the build fails (503)", async () => {
    await answer(NOW);
    const listed = [...zset(READY).keys()];
    mem.failNext("eval");
    mem.failNext("zrange");
    const { lines } = await rebuild(NOW + POOL_REFRESH_MS + MIN);
    for (const id of listed) assert.ok(lines.has(id), "the old view still lists the reserve");

    coldInstance();
    mem.failNext("eval");
    mem.failNext("zrange", { key: /uuidpool:taken$/ });
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

describe("a node's 304 is its confirmation", () => {
  test("a 304 notes the time of the view the list was built from; a 200 does not", async () => {
    const first = await nodeUuidsGet(nodeReq("pl"));
    assert.equal(first.status, 200);
    assert.equal(await mem.redis.hgetall(SEEN), null, "a 200 may still be refused by the agent");
    const etag = first.headers.get("ETag");
    const again = await nodeUuidsGet(nodeReq("pl", etag));
    assert.equal(again.status, 304);
    const seen = await mem.redis.hgetall(SEEN);
    const read = await readNodeUuidPairs(Date.now());
    assert.deepEqual(seen, { pl: read.poolAt });
  });

  test("written at most every SEEN_WRITE_EVERY_MS per node and instance, never throwing", async () => {
    await noteNodeConfirmed("pl", NOW - MIN, NOW);
    await noteNodeConfirmed("pl", NOW, NOW + SEEN_WRITE_EVERY_MS - 1);
    await noteNodeConfirmed("se", NOW, NOW + 1);
    assert.deepEqual(await mem.redis.hgetall(SEEN), { pl: NOW - MIN, se: NOW });
    await noteNodeConfirmed("pl", NOW + 2 * MIN, NOW + SEEN_WRITE_EVERY_MS);
    assert.equal((await mem.redis.hgetall(SEEN)).pl, NOW + 2 * MIN);
    mem.failNext("hset");
    await noteNodeConfirmed("kz", NOW, NOW);
    assert.equal(mem.calls.get("hset"), 4);
  });

  test("a new reserve UUID is instant once the nodes confirmed a list with it, not before", async () => {
    await mem.redis.hset(SEEN, { pl: NOW - HOUR });
    await answer(NOW); // fills the reserve at NOW
    // By age alone it would be ready 10 minutes later, but pl has not confirmed it.
    assert.equal((await takeDeviceUuid(NOW + 15 * MIN)).instant, false);
    // pl confirms the list built from the next view (which carries it).
    const { read } = await rebuild(NOW + POOL_REFRESH_MS);
    assert.equal(read.poolAt, NOW + POOL_REFRESH_MS);
    await noteNodeConfirmed("pl", read.poolAt, NOW + POOL_REFRESH_MS + 2 * MIN);
    assert.equal((await takeDeviceUuid(NOW + 15 * MIN)).instant, true);
  });

  test("KOVRA_UUID_POOL_SIZE=0: nothing is written", async () => {
    process.env.KOVRA_UUID_POOL_SIZE = "0";
    await noteNodeConfirmed("pl", NOW, NOW);
    assert.equal(mem.calls.get("hset") ?? 0, 0);
  });
});

describe("a taken UUID stays on the nodes without a gap", () => {
  /** A build's line for `id` must be dated ahead of `now`. */
  const listedAhead = (lines, id, now, step) => {
    assert.ok(lines.has(id), `${step}: listed`);
    assert.ok(lines.get(id) > now, `${step}: dated ahead`);
  };

  test("reserve → taken → device record, across cache windows and views", async () => {
    const t0 = NOW;
    await answer(t0); // fills the reserve
    const t1 = t0 + POOL_MIN_AGE_MS + MIN;
    let { lines } = await rebuild(t1);
    const { uuid, instant } = await takeDeviceUuid(t1 + 5_000);
    assert.equal(instant, true);
    listedAhead(lines, uuid, t1, "before the take");

    // Same instance, inside the cache window: the cached answer still has it.
    ({ lines } = await answer(t1 + 10_000));
    listedAhead(lines, uuid, t1 + 10_000, "cached");

    // Next window, the device record not written yet: the view still says ready.
    const t2 = t1 + REBUILD_EVERY_MS + 1;
    ({ lines } = await rebuild(t2));
    listedAhead(lines, uuid, t2, "taken, no record yet");

    // Another instance with a fresh view: listed as taken.
    coldInstance();
    ({ lines } = await answer(t2));
    listedAhead(lines, uuid, t2, "taken, fresh view");

    // /api/vpn/create writes the record, then moves the mark to spent.
    setUser(USER, [device(uuid, t2 + 1_000)], [plan(3, t2 + 30 * DAY)]);
    await releaseTakenMark(uuid, t2 + 1_000);

    for (const t of [t2 + REBUILD_EVERY_MS + 1, t2 + POOL_REFRESH_MS + 1]) {
      ({ lines } = await rebuild(t));
      assert.equal(lines.get(uuid), t2 + 30 * DAY, "now the device's own date");
    }
  });

  test("a take between the view and the profile read: still listed", async () => {
    seedReady([[u(1), NOW - DAY]]);
    let taken = null;
    mem.beforeNext("scan", {
      run: async () => {
        taken = await takeDeviceUuid(NOW);
      },
    });
    const { lines } = await answer(NOW);
    assert.equal(taken.uuid, u(1));
    assert.equal(lines.get(u(1)), poolLineUntil(NOW), "the view had it");
  });

  test("the record written and the mark released in the same gap: still listed, by the record", async () => {
    seedReady([[u(1), NOW - DAY]]);
    const { uuid } = await takeDeviceUuid(NOW - 5_000);
    mem.beforeNext("scan", {
      run: async () => {
        setUser(USER, [device(uuid, NOW - 1_000)], [plan(1, NOW + 10 * DAY)]);
        await releaseTakenMark(uuid, NOW - 1_000);
      },
    });
    const { lines } = await answer(NOW);
    assert.equal(lines.get(uuid), NOW + 10 * DAY);
  });

  test("a node build never answers from a device read older than its view of the reserve", async () => {
    // Hysteria2 read the devices a moment ago (the instance keeps that copy
    // for REBUILD_EVERY_MS). Then a device takes P, its record is written
    // and P moves to `spent`. The node build's view shows P spent, so only
    // a device read made AFTER that view can see P's record: an older one
    // would date P in the past and the nodes would drop the new device.
    seedReady([[u(1), NOW - DAY]]);
    await readDevicePairs(NOW);
    const { uuid, instant } = await takeDeviceUuid(NOW + 1_000);
    assert.equal(instant, true);
    setUser(USER, [device(uuid, NOW + 1_000)], [plan(1, NOW + 10 * DAY)]);
    await releaseTakenMark(uuid, NOW + 1_000);
    const { lines } = await answer(NOW + 2_000);
    assert.equal(lines.get(uuid), NOW + 10 * DAY, "the device's own date, ahead");
  });

  test("a node agent keeps the device across the whole sequence, and nothing counts as dropped", async () => {
    const agent = new Agent();
    let t = NOW;
    const poll = async () => {
      const { lines } = await rebuild(t);
      const dropped = agent.poll(lines, t);
      assert.equal(agent.refused, false);
      assert.deepEqual(dropped, [], `nothing dropped at +${(t - NOW) / MIN} min`);
      t += 2 * MIN;
    };
    await poll();
    t += POOL_MIN_AGE_MS;
    await poll();
    const { uuid, instant } = await takeDeviceUuid(t);
    assert.equal(instant, true);
    assert.ok(agent.live.has(uuid), "the node had it before the device existed");
    await poll();
    setUser(USER, [device(uuid, t)], [plan(1, t + 30 * DAY)]);
    await releaseTakenMark(uuid, t);
    for (let i = 0; i < 10; i += 1) {
      await poll();
      assert.ok(agent.live.has(uuid));
    }
  });
});

describe("the device record decides: the reserve keeps no one alive", () => {
  test("a pool device that gets paused leaves the nodes by the clock, not as a drop", async () => {
    // P came from the reserve; a newer device Q then took the only slot, so
    // P is paused (device-capacity.ts).
    const P = u(0x51);
    const Q = u(0x52);
    seedReady([[P, NOW - DAY]]);
    const agent = new Agent();
    agent.poll((await answer(NOW)).lines, NOW);
    assert.ok(agent.live.has(P));
    assert.equal((await takeDeviceUuid(NOW + MIN)).uuid, P);
    setUser(USER, [device(P, NOW + MIN)], [plan(1, NOW + 30 * DAY)]);
    await releaseTakenMark(P, NOW + MIN);
    setUser(USER, [device(P, NOW + MIN), device(Q, NOW + 2 * MIN)], [plan(1, NOW + 30 * DAY)]);
    for (const t of [NOW + 3 * MIN, NOW + POOL_REFRESH_MS + MIN]) {
      const { lines } = await rebuild(t);
      assert.ok(lines.get(P) <= t, "listed, with a past date");
      assert.deepEqual(agent.poll(lines, t), [], "not a drop");
      assert.ok(!agent.live.has(P), "paused: off the node");
    }
  });

  test("a paused device whose mark was never released: a past date too", async () => {
    const P = u(0x53);
    const Q = u(0x54);
    mem.zsets.set(TAKEN, new Map([[P, NOW - MIN]]));
    setUser(USER, [device(P, NOW - 2 * MIN), device(Q, NOW - MIN)], [plan(1, NOW + 30 * DAY)]);
    const { lines } = await answer(NOW);
    assert.equal(lines.get(P), NOW - MIN);
    assert.equal(lines.get(Q), NOW + 30 * DAY);
  });

  test("a pool device deleted in its first day leaves by the clock; with a stale view it lingers one view at most", async () => {
    const P = u(0x61);
    seedReady([[P, NOW - DAY]]);
    const agent = new Agent();
    agent.poll((await answer(NOW)).lines, NOW);
    await takeDeviceUuid(NOW + MIN);
    setUser(USER, [device(P, NOW + MIN)], [plan(1, NOW + 30 * DAY)]);
    await releaseTakenMark(P, NOW + MIN);
    setUser(USER, [], [plan(1, NOW + 30 * DAY)]);

    // The view read at NOW still says "ready": the deleted UUID stays listed until it is renewed.
    let { lines } = await rebuild(NOW + 2 * MIN);
    assert.equal(lines.get(P), poolLineUntil(NOW + 2 * MIN));
    assert.deepEqual(agent.poll(lines, NOW + 2 * MIN), []);

    ({ lines } = await rebuild(NOW + POOL_REFRESH_MS));
    assert.equal(lines.get(P), NOW + MIN, "spent: its release time, past");
    assert.deepEqual(agent.poll(lines, NOW + POOL_REFRESH_MS), [], "an expiry, not a drop");
    assert.ok(!agent.live.has(P));
  });

  test("a device whose plan ended keeps its own past date, not the reserve's", async () => {
    const P = u(0x71);
    mem.zsets.set(TAKEN, new Map([[P, NOW - MIN]]));
    const ended = NOW - 2 * HOUR;
    setUser(USER, [device(P, NOW - MIN)], [plan(1, ended)]);
    const { lines } = await answer(NOW);
    assert.equal(lines.get(P), ended, "removed by the clock on the nodes");
  });

  test("reservePairs: a known UUID is never dated ahead; spent wins over taken", () => {
    const hour = Math.floor(NOW / HOUR) * HOUR;
    const state = {
      ready: [{ uuid: u(1), at: NOW - DAY }, { uuid: u(9), at: NOW - DAY }],
      taken: [
        { uuid: u(2), at: NOW - MIN },
        { uuid: u(3), at: NOW - MIN },
        { uuid: u(4), at: NOW - TAKEN_GRACE_MS },
        { uuid: u(5), at: NOW - MIN },
      ],
      spent: [{ uuid: u(5), at: NOW - 30_000 }, { uuid: u(6), at: NOW - HOUR }],
      added: 0,
      rotated: 0,
      malformed: 0,
    };
    const got = Object.fromEntries(reservePairs(state, new Set([u(1), u(2)]), NOW).map((p) => [p.uuid, p.until]));
    assert.deepEqual(got, {
      [u(1)]: hour, // ready but in a record (a stale view): past
      [u(9)]: poolLineUntil(NOW),
      [u(2)]: NOW - MIN, // taken, record visible, not listed by it: past
      [u(3)]: poolLineUntil(NOW), // taken, creation in flight
      [u(4)]: NOW, // taken, grace over, no record: past
      [u(5)]: NOW - 30_000, // released: the spent date, not the taken grace
      [u(6)]: NOW - HOUR,
    });
    for (const until of Object.values(got)) assert.ok(until > NOW - NODE_BODY_WINDOW_MS, "inside the answer's window");
  });
});

describe("a taken UUID whose device never appeared", () => {
  test("listed ahead within the grace, then with a past date, then gone", async () => {
    const P = u(0x81);
    mem.zsets.set(TAKEN, new Map([[P, NOW]]));
    let { lines } = await answer(NOW + TAKEN_GRACE_MS - 1);
    assert.equal(lines.get(P), poolLineUntil(NOW + TAKEN_GRACE_MS - 1));
    coldInstance();
    ({ lines } = await answer(NOW + TAKEN_GRACE_MS));
    assert.equal(lines.get(P), NOW + TAKEN_GRACE_MS, "an expiry: the nodes remove it by the clock");
    coldInstance();
    ({ lines } = await answer(NOW + TAKEN_GRACE_MS + NODE_BODY_WINDOW_MS));
    assert.ok(!lines.has(P), "out of the answer after the window");
    coldInstance();
    await answer(NOW + TAKEN_GRACE_MS + NODE_BODY_WINDOW_MS + 2 * HOUR);
    assert.ok(!zset(TAKEN).has(P), "and the mark is forgotten");
  });
});

describe("rotation", () => {
  test("a reserve that aged at once is renewed in steps: expiries only, never below half mature", async () => {
    const old = Array.from({ length: POOL_SIZE_DEFAULT }, (_, i) => [u(0x100 + i), NOW - POOL_MAX_AGE_MS - i * MIN]);
    seedReady(old);
    const agent = new Agent();
    agent.poll(new Map([[DEV, NOW + 30 * DAY], ...old.map(([id]) => [id, poolLineUntil(NOW)])]), NOW);
    const retiredSeen = new Set();
    for (let t = NOW; t <= NOW + 45 * MIN; t += REBUILD_EVERY_MS) {
      const before = zset(SPENT).size;
      const { lines, read } = await rebuild(t);
      assert.ok(zset(SPENT).size - before <= POOL_ROTATE_PER_PASS, "a few per refresh");
      assert.ok(read.pool.rotated <= POOL_ROTATE_PER_PASS);
      const mature = [...zset(READY).values()].filter((at) => at <= t - POOL_MIN_AGE_MS).length;
      assert.ok(mature >= keepMature(POOL_SIZE_DEFAULT), `at +${(t - NOW) / MIN} min: ${mature} mature`);
      for (const id of zset(SPENT).keys()) retiredSeen.add(id);
      assert.deepEqual(agent.poll(lines, t), [], "rotated lines are expiries, not drops");
      assert.equal(agent.refused, false);
      for (const id of retiredSeen) if (lines.get(id) <= t) assert.ok(!agent.live.has(id));
      assert.equal(zset(READY).size, POOL_SIZE_DEFAULT, "refilled in the same refresh");
    }
    assert.equal(retiredSeen.size, POOL_SIZE_DEFAULT, "all old ones rotated out");
    assert.ok(agent.live.has(DEV));
  });

  test("spent lines leave the answer after the window, and the marks are forgotten", async () => {
    mem.zsets.set(SPENT, new Map([[u(1), NOW]]));
    let { lines } = await answer(NOW + NODE_BODY_WINDOW_MS - 1);
    assert.equal(lines.get(u(1)), NOW);
    coldInstance();
    ({ lines } = await answer(NOW + NODE_BODY_WINDOW_MS));
    assert.ok(!lines.has(u(1)));
    coldInstance();
    await answer(NOW + NODE_BODY_WINDOW_MS + 2 * HOUR);
    assert.equal(zset(SPENT).size, 0);
  });

  test("KOVRA_UUID_POOL_SIZE=0 drains the reserve a few per refresh, without drops", async () => {
    seedReady(Array.from({ length: 5 }, (_, i) => [u(0x200 + i), NOW - DAY - i]));
    process.env.KOVRA_UUID_POOL_SIZE = "0";
    const agent = new Agent();
    agent.poll(new Map([[DEV, NOW + 30 * DAY], ...[...zset(READY).keys()].map((id) => [id, poolLineUntil(NOW)])]), NOW);
    for (let i = 0; i < 4; i += 1) {
      const t = NOW + i * POOL_REFRESH_MS;
      const { lines } = await rebuild(t);
      assert.deepEqual(agent.poll(lines, t), []);
    }
    assert.equal(zset(READY).size, 0);
    assert.deepEqual([...agent.live], [DEV]);
  });
});

describe("the agents' refusal guard is never tripped by the reserve", () => {
  const users = (n, prefix = "u") => {
    for (let i = 0; i < n; i += 1) setUser(`${prefix}${i}`, [device(u(0xa0 + i), 1)], [plan(1, NOW + 30 * DAY)]);
  };

  test("create/delete churn on reserve UUIDs plus an ordinary deletion in the same poll: accepted", async () => {
    mem.store.delete(`profiles:${OTHER}`);
    users(5);
    const B = u(0xbb);
    setUser("att", [device(B, 1)], [plan(2, NOW + 30 * DAY)]);
    const agent = new Agent();
    let t = NOW;
    agent.poll((await rebuild(t)).lines, t);
    t += 12 * MIN;
    agent.poll((await rebuild(t)).lines, t); // the reserve is mature and on the node
    assert.equal(agent.live.size, 6 + POOL_SIZE_DEFAULT);

    // Within one poll interval: 10 create+delete cycles on the free slot (5 a minute allowed), then B deleted.
    let fromPool = 0;
    for (let i = 0; i < 10; i += 1) {
      const at = t + i * 6_000;
      const { uuid, instant } = await takeDeviceUuid(at);
      if (instant) fromPool += 1;
      setUser("att", [device(B, 1), device(uuid, at)], [plan(2, NOW + 30 * DAY)]);
      if (instant) await releaseTakenMark(uuid, at);
      setUser("att", [device(B, 1)], [plan(2, NOW + 30 * DAY)]);
    }
    assert.equal(fromPool, POOL_SIZE_DEFAULT, "the whole reserve went through the churn");
    setUser("att", [], [plan(2, NOW + 30 * DAY)]);

    for (let i = 0; i < 20; i += 1) {
      t += 2 * MIN;
      const dropped = agent.poll((await rebuild(t)).lines, t);
      assert.equal(agent.refused, false, `poll ${i}`);
      assert.ok(dropped.length <= 1, `poll ${i}: ${dropped.length} dropped`);
    }
    assert.ok(!agent.live.has(B));
    assert.equal(agent.live.size, 5 + POOL_SIZE_DEFAULT, "five paying devices and a refilled reserve");
  });

  test("a rollback that stops listing the reserve, plus a deletion in the same poll: accepted", async () => {
    mem.store.delete(`profiles:${OTHER}`);
    users(6);
    const agent = new Agent();
    const first = (await answer(NOW)).lines;
    agent.poll(first, NOW);
    // The old code lists devices only; meanwhile u0 deleted its device.
    const old = new Map([...first].filter(([id]) => id.startsWith("00000000-0000-4000-8000-0000000000a") && id !== u(0xa0)));
    const dropped = agent.poll(old, NOW + 2 * MIN);
    assert.equal(dropped.length, POOL_SIZE_DEFAULT + 1);
    assert.equal(agent.refused, false);
  });

  test("should an agent refuse anyway, the reserve lines expire on it within POOL_LINE_AHEAD_MS and it accepts again", async () => {
    mem.store.delete(`profiles:${OTHER}`);
    users(8);
    const agent = new Agent();
    const first = (await answer(NOW)).lines;
    agent.poll(first, NOW);
    // A rollback while six users delete their devices: 5 + 6 = 11 drops, refused.
    const gone = new Set([0, 1, 2, 3, 4, 5].map((i) => u(0xa0 + i)));
    const old = new Map([...first].filter(([id]) => id.startsWith("00000000-0000-4000-8000-0000000000a") && !gone.has(id)));
    agent.poll(old, NOW + 2 * MIN);
    assert.equal(agent.refused, true);
    // The agent polls every 2 minutes; its refused passes still remove lines by the clock.
    let t = NOW + 2 * MIN;
    while (agent.refused && t < NOW + 48 * HOUR) {
      t += 2 * MIN;
      agent.poll(old, t);
    }
    assert.equal(agent.refused, false);
    assert.ok(t - NOW <= POOL_LINE_AHEAD_MS + 2 * MIN, `accepted again after ${((t - NOW) / HOUR).toFixed(2)} h`);
  });
});
