// tests/hy2-auth.test.mjs — run: npm test
//
// POST /api/hy2/auth used to let in every UUID that had a `hy2:<uuid>` key,
// written once at creation and never tied to a plan: an expired account, a
// device paused for lack of slots and (until its key was cleaned) a deleted
// one all kept Hysteria2. Now the route follows the same device access as the
// subscription and the panel-less nodes (lib/hy2-access.ts):
//   • only a device holding a running slot is let in;
//   • unknown, malformed and stale-key UUIDs are refused, and a malformed
//     password costs no storage read;
//   • the list is read once a minute per instance, never per connect;
//   • when storage fails OR HANGS the last good list answers for a few
//     minutes from when it was read, then every connect is refused (fail
//     closed); a hung read costs a connect at most READ_TIMEOUT_MS, and after
//     a failure no read is tried for RETRY_AFTER_FAILURE_MS;
//   • the wire contract Hysteria2 expects stays: always 200, {ok, id}.
//   • the reserve of UUIDs the PRO nodes preload (lib/uuid-pool.ts) never
//     opens Hysteria2: those UUIDs are dated ahead in the nodes' list but
//     belong to no device, and Hysteria2 reads the devices alone, so it
//     neither runs the reserve's script nor fails when the reserve does.
//
// UUIDs, ids and the node token are made up.

import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

process.env.KOVRA_NODE_TOKEN = ["node", "token", "for", "hy2", "tests"].join("-");
delete process.env.KOVRA_NODE_MIN_ACTIVE;
delete process.env.KOVRA_UUID_POOL_SIZE;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");
const { registerUuidPoolScripts } = await import("./support/uuid-pool-twin.mjs");
const poolBody = await import("../src/lib/uuid-pool-body.ts");
registerUuidPoolScripts(mem, poolBody);
const { POOL_READY_KEY, POOL_TAKEN_KEY, POOL_REFRESH_MS } = poolBody;

const { NextRequest } = await import("next/server");
const { decideHy2, indexPairs, createHy2Access, STALE_IF_ERROR_MS, READ_TIMEOUT_MS, RETRY_AFTER_FAILURE_MS } = await import(
  "../src/lib/hy2-access.ts"
);
const { REBUILD_EVERY_MS } = await import("../src/lib/node-uuids.ts");
const { resetUuidPoolInstance } = await import("../src/lib/uuid-pool.ts");
const { POST } = await import("../src/app/api/hy2/auth/route.ts");
const { GET: nodeUuidsGet } = await import("../src/app/api/internal/node-uuids/route.ts");

const NOW = 1_790_000_000_000;
const DAY = 86_400_000;
const A = "0a1b2c3d-0000-4000-8000-00000000000a";
const B = "0a1b2c3d-0000-4000-8000-00000000000b";
const C = "0a1b2c3d-0000-4000-8000-00000000000c";
const D = "0a1b2c3d-0000-4000-8000-00000000000d";
const E = "0a1b2c3d-0000-4000-8000-00000000000e";
/** A reserve UUID: listed for the PRO nodes, held by no device. */
const R = "0a1b2c3d-0000-4000-8000-0000000000f1";

describe("the pure decision", () => {
  const byUuid = indexPairs([
    { uuid: A, until: NOW + DAY },
    { uuid: B, until: NOW - DAY },
    { uuid: A.toUpperCase(), until: NOW - 5 * DAY },
    { uuid: "junk", until: NOW + DAY },
  ]);

  test("indexPairs keeps each UUID once, lower-cased, with its latest date, and drops junk", () => {
    assert.deepEqual([...byUuid], [
      [A, NOW + DAY],
      [B, NOW - DAY],
    ]);
  });

  test("a device holding a running slot is let in under its lower-case UUID", () => {
    assert.deepEqual(decideHy2(A, byUuid, NOW), { ok: true, id: A });
    assert.deepEqual(decideHy2(` ${A.toUpperCase()} `, byUuid, NOW), { ok: true, id: A });
  });

  test("a slot that has ended, an unknown UUID and anything else are refused", () => {
    assert.deepEqual(decideHy2(B, byUuid, NOW), { ok: false, reason: "inactive" });
    assert.deepEqual(decideHy2(A, byUuid, NOW + DAY), { ok: false, reason: "inactive" }, "the end of the slot is the end");
    assert.deepEqual(decideHy2(C, byUuid, NOW), { ok: false, reason: "unknown" });
    for (const bad of ["", "12345678", `${A}x`, null, undefined, 42, { auth: A }, [A]]) {
      assert.deepEqual(decideHy2(bad, byUuid, NOW), { ok: false, reason: "malformed" }, JSON.stringify(bad));
    }
  });
});

describe("storage failures", () => {
  let reads;
  let failing;
  const pairs = [{ uuid: A, until: NOW + DAY }];
  const deps = {
    async readPairs(now) {
      reads += 1;
      if (failing) throw new Error("storage down");
      return { pairs, malformed: 0, at: now };
    },
  };
  const quiet = () => mock.method(console, "error", () => {});

  beforeEach(() => {
    reads = 0;
    failing = false;
  });
  afterEach(() => mock.restoreAll());

  test("no list ever read: refused, fail closed", async () => {
    quiet();
    failing = true;
    const access = createHy2Access(deps);
    assert.deepEqual(await access(A, NOW), { ok: false, reason: "unavailable" });
  });

  test("the last good list answers for a while, then every connect is refused", async () => {
    quiet();
    const access = createHy2Access(deps);
    assert.deepEqual(await access(A, NOW), { ok: true, id: A });
    failing = true;
    assert.deepEqual(await access(A, NOW + STALE_IF_ERROR_MS - 1), { ok: true, id: A });
    assert.deepEqual(await access(C, NOW + 60_000), { ok: false, reason: "unknown" }, "the stale list is still exact");
    assert.deepEqual(await access(A, NOW + STALE_IF_ERROR_MS), { ok: false, reason: "unavailable" });
  });

  test("a malformed password never reaches storage", async () => {
    const access = createHy2Access(deps);
    for (const bad of ["", "x".repeat(36), 7, null]) assert.equal((await access(bad, NOW)).ok, false);
    assert.equal(reads, 0);
  });

  test("after a failed read no read is tried for a while: a wave of connects answers from the list", async () => {
    quiet();
    const access = createHy2Access(deps);
    await access(A, NOW);
    failing = true;
    reads = 0;
    assert.deepEqual(await access(A, NOW + 70_000), { ok: true, id: A });
    for (let i = 1; i <= 20; i++) assert.deepEqual(await access(A, NOW + 70_000 + i * 100), { ok: true, id: A });
    assert.equal(reads, 1, "one failed read, then none until the pause is over");
    assert.deepEqual(await access(A, NOW + 70_000 + RETRY_AFTER_FAILURE_MS), { ok: true, id: A });
    assert.equal(reads, 2, "after the pause the next connect tries again");
    failing = false;
    assert.deepEqual(await access(A, NOW + 70_000 + 2 * RETRY_AFTER_FAILURE_MS), { ok: true, id: A });
    assert.deepEqual(await access(A, NOW + 70_000 + 2 * RETRY_AFTER_FAILURE_MS + 1), { ok: true, id: A });
    assert.equal(reads, 4, "once a read succeeds, every connect reads again (the cache below makes it cheap)");
  });

  test("the list goes stale from when it was READ, not from when a cached copy was last handed out", async () => {
    quiet();
    // readDevicePairs hands out its copy for a minute with the time of the rebuild.
    let readAt = NOW;
    const access = createHy2Access({
      async readPairs() {
        if (failing) throw new Error("storage down");
        return { pairs, malformed: 0, at: readAt };
      },
    });
    assert.deepEqual(await access(A, NOW), { ok: true, id: A });
    assert.deepEqual(await access(A, NOW + 59_000), { ok: true, id: A }, "the same copy, read at NOW");
    failing = true;
    assert.deepEqual(await access(A, NOW + STALE_IF_ERROR_MS - 1), { ok: true, id: A });
    assert.deepEqual(
      await access(A, NOW + STALE_IF_ERROR_MS + RETRY_AFTER_FAILURE_MS),
      { ok: false, reason: "unavailable" },
      "five minutes after the real read, not after the last cached answer",
    );
    readAt = NOW + STALE_IF_ERROR_MS + 2 * RETRY_AFTER_FAILURE_MS;
    failing = false;
    assert.deepEqual(await access(A, readAt), { ok: true, id: A }, "a new read lets everyone back");
  });
});

describe("storage hangs", () => {
  const pairs = [{ uuid: A, until: NOW + DAY }];
  afterEach(() => mock.restoreAll());

  /** A readPairs whose reads, after the first `good` ones, never settle until released. */
  const hangingDeps = (good, readTimeoutMs) => {
    const state = { reads: 0, pending: [] };
    state.deps = {
      readTimeoutMs,
      readPairs(now) {
        state.reads += 1;
        if (state.reads <= good) return Promise.resolve({ pairs, malformed: 0, at: now });
        return new Promise((resolve) => state.pending.push(resolve));
      },
    };
    return state;
  };

  test("with a warm list, a hung Redis costs a connect under 2 s and it is let in (default timeout)", async () => {
    mock.method(console, "error", () => {});
    const { deps } = hangingDeps(1);
    const access = createHy2Access(deps);
    assert.deepEqual(await access(A, NOW), { ok: true, id: A });
    const started = performance.now();
    const verdict = await access(A, NOW + 61_000);
    const took = performance.now() - started;
    assert.deepEqual(verdict, { ok: true, id: A });
    assert.ok(took < 2_000, `answered in ${Math.round(took)} ms`);
    assert.ok(took >= READ_TIMEOUT_MS - 50, "it did wait for the read first");
  });

  test("a hung read is waited for once; the connects after it answer at once from the list", async () => {
    mock.method(console, "error", () => {});
    const state = hangingDeps(1, 20);
    const access = createHy2Access(state.deps);
    await access(A, NOW);
    const wave = await Promise.all([access(A, NOW + 61_000), access(A, NOW + 61_001), access(C, NOW + 61_002)]);
    assert.deepEqual(wave, [{ ok: true, id: A }, { ok: true, id: A }, { ok: false, reason: "unknown" }]);
    const reads = state.reads;
    const started = performance.now();
    assert.deepEqual(await access(A, NOW + 62_000), { ok: true, id: A });
    assert.ok(performance.now() - started < 15, "no wait inside the pause");
    assert.equal(state.reads, reads, "no read inside the pause");
  });

  test("a read that answers after its timeout still updates the list", async () => {
    mock.method(console, "error", () => {});
    const state = hangingDeps(1, 20);
    const access = createHy2Access(state.deps);
    await access(A, NOW);
    assert.deepEqual(await access(C, NOW + 61_000), { ok: false, reason: "unknown" });
    // The hung read finally answers, and C has bought a plan meanwhile.
    for (const resolve of state.pending) {
      resolve({ pairs: [...pairs, { uuid: C, until: NOW + DAY }], malformed: 0, at: NOW + 61_000 });
    }
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(await access(C, NOW + 61_500), { ok: true, id: C });
  });

  test("no list yet and Redis hangs: refused within the timeout, fail closed", async () => {
    mock.method(console, "error", () => {});
    const { deps } = hangingDeps(0, 20);
    const access = createHy2Access(deps);
    assert.deepEqual(await access(A, NOW), { ok: false, reason: "unavailable" });
  });

  test("a hung Redis for longer than the stale window: refused after it", async () => {
    mock.method(console, "error", () => {});
    const { deps } = hangingDeps(1, 20);
    const access = createHy2Access(deps);
    await access(A, NOW);
    assert.deepEqual(await access(A, NOW + STALE_IF_ERROR_MS - 1), { ok: true, id: A });
    assert.deepEqual(await access(A, NOW + STALE_IF_ERROR_MS + RETRY_AFTER_FAILURE_MS), { ok: false, reason: "unavailable" });
  });
});

describe("POST /api/hy2/auth", () => {
  // Users: one on a 3-slot plan with two devices; one whose plan ended; one
  // with three devices and a single slot left (the two oldest are paused).
  const seed = () => {
    mem.store.set("profiles:tg_1", JSON.stringify([{ uuid: A, createdAt: 1 }, { uuid: B, createdAt: 2 }]));
    mem.store.set("subs:tg_1", JSON.stringify([{ slots: 3, expiresAt: Date.now() + 30 * DAY }]));
    mem.store.set("profiles:tg_2", JSON.stringify([{ uuid: C, createdAt: 1 }]));
    mem.store.set("subs:tg_2", JSON.stringify([{ slots: 1, expiresAt: Date.now() - DAY }]));
    mem.store.set("profiles:em_x@example.test", JSON.stringify([{ uuid: D, createdAt: 1 }, { uuid: E, createdAt: 3 }]));
    mem.store.set("subs:em_x@example.test", JSON.stringify([{ slots: 1, expiresAt: Date.now() + DAY }]));
    // The key the old route trusted, for a device whose plan has ended.
    mem.store.set(`hy2:${C}`, "1");
  };

  const call = async (body, raw = false) => {
    const res = await POST(
      new NextRequest("https://kovra.test/api/hy2/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: raw ? body : JSON.stringify(body),
      }),
    );
    assert.equal(res.status, 200, "Hysteria2 reads anything but 200 as a refusal; the contract is always 200");
    return res.json();
  };
  const connect = (uuid) => call({ addr: "198.51.100.7:40000", auth: uuid, tx: 0 });

  // The route keeps its list per instance (the module), across tests: every
  // test starts on a clock past the lifetime of whatever an earlier test read.
  let clock = NOW;
  beforeEach(() => {
    clock += REBUILD_EVERY_MS + STALE_IF_ERROR_MS + DAY;
    mock.timers.enable({ apis: ["Date"], now: clock });
    mem.reset();
    seed();
  });
  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  test("a device holding a slot gets in, named by its UUID", async () => {
    assert.deepEqual(await connect(A), { ok: true, id: A });
    assert.deepEqual(await connect(B.toUpperCase()), { ok: true, id: B });
  });

  test("an expired plan is refused although its old hy2: key exists", async () => {
    assert.deepEqual(await connect(C), { ok: false });
  });

  test("devices beyond the running slots are refused, the newest one keeps access (KM-03)", async () => {
    assert.deepEqual(await connect(E), { ok: true, id: E });
    assert.deepEqual(await connect(D), { ok: false });
  });

  test("unknown UUIDs, junk and broken bodies are refused", async () => {
    assert.deepEqual(await connect("0a1b2c3d-0000-4000-8000-0000000000ff"), { ok: false });
    assert.deepEqual(await connect("12345678"), { ok: false });
    assert.deepEqual(await call({ addr: "198.51.100.7:40000" }), { ok: false });
    assert.deepEqual(await call("{not json", true), { ok: false });
    assert.deepEqual(await call("null", true), { ok: false });
    assert.deepEqual(await call(JSON.stringify({ auth: A, pad: "x".repeat(5000) }), true), { ok: false });
  });

  test("a burst of connects reads storage once, and a change lands within a minute", async () => {
    await Promise.all([connect(A), connect(B), connect(E), connect(C)]);
    assert.equal(mem.calls.get("scan"), 1, "one rebuild for the whole burst");
    assert.equal(mem.calls.get("get") ?? 0, 0, "no per-connect reads");

    // The device is deleted (removeProfile rewrites the list).
    mem.store.set("profiles:tg_1", JSON.stringify([{ uuid: B, createdAt: 2 }]));
    assert.deepEqual(await connect(A), { ok: true, id: A }, "within the minute the copy still answers");
    mock.timers.tick(REBUILD_EVERY_MS);
    assert.deepEqual(await connect(A), { ok: false }, "after it, the deleted device is out");
    assert.deepEqual(await connect(B), { ok: true, id: B });
  });

  test("storage down: the last list answers for a while, then every connect is refused", async () => {
    mock.method(console, "error", () => {});
    assert.deepEqual(await connect(A), { ok: true, id: A });
    mock.timers.tick(REBUILD_EVERY_MS);
    mem.failNext("scan", { times: 100 });
    assert.deepEqual(await connect(A), { ok: true, id: A });
    assert.deepEqual(await connect(D), { ok: false });
    mock.timers.tick(STALE_IF_ERROR_MS);
    assert.deepEqual(await connect(A), { ok: false });
  });

  test("a storage error is logged without the command Upstash quotes: its keys carry e-mail ids", async () => {
    const lines = [];
    mock.method(console, "error", (...args) => lines.push(args.map(String).join(" ")));
    // @upstash/redis builds its error text as `${error}, command was: ${JSON.stringify(body)}`.
    const realMget = mem.redis.mget;
    mem.redis.mget = async (...keys) => {
      throw Object.assign(new Error(`ERR max requests limit exceeded, command was: ${JSON.stringify(["mget", ...keys])}`), {
        name: "UpstashError",
      });
    };
    try {
      assert.deepEqual(await connect(A), { ok: false });
    } finally {
      mem.redis.mget = realMget;
    }
    assert.equal(lines.length, 1);
    assert.match(lines[0], /max requests limit exceeded/, "the reason stays");
    assert.doesNotMatch(lines[0], /example\.test|profiles:|command was/);
  });

  describe("the UUID reserve of the PRO nodes", () => {
    /** GET /api/internal/node-uuids as an agent asks it: `uuid -> date` of every line. */
    const nodeLines = async () => {
      const res = await nodeUuidsGet(
        new NextRequest("https://kovra.test/api/internal/node-uuids?node=pl", {
          headers: { authorization: `Bearer ${process.env.KOVRA_NODE_TOKEN}` },
        }),
      );
      if (res.status !== 200) return { status: res.status, lines: new Map() };
      const lines = new Map(
        (await res.text())
          .trim()
          .split("\n")
          .map((line) => line.split(" "))
          .map(([id, until]) => [id, Number(until)]),
      );
      return { status: res.status, lines };
    };

    test("a reserve UUID the nodes list ahead is refused; the devices of the same list get in", async () => {
      mem.zsets.set(POOL_READY_KEY, new Map([[R, Date.now() - DAY]]));
      const { status, lines } = await nodeLines();
      assert.equal(status, 200);
      assert.ok(lines.get(R) > Date.now(), "the nodes' list carries it, dated ahead");
      assert.ok(lines.get(A) > Date.now());

      const evals = mem.calls.get("eval") ?? 0;
      const scans = mem.calls.get("scan") ?? 0;
      assert.deepEqual(await connect(R), { ok: false });
      assert.deepEqual(await connect(R.toUpperCase()), { ok: false });
      assert.deepEqual(await connect(A), { ok: true, id: A });
      assert.deepEqual(await connect(E), { ok: true, id: E });
      assert.equal(mem.calls.get("eval") ?? 0, evals, "Hysteria2 never runs the reserve's script");
      assert.equal(mem.calls.get("scan") ?? 0, scans, "it reuses the device read the node build just made");

      // Later, with the device copy and the view of the reserve both old:
      // Hysteria2 reads the devices again, and still never the reserve.
      mock.timers.tick(Math.max(POOL_REFRESH_MS, REBUILD_EVERY_MS));
      assert.deepEqual(await connect(A), { ok: true, id: A });
      assert.equal(mem.calls.get("scan") ?? 0, scans + 1, "its own device read");
      assert.equal(mem.calls.get("eval") ?? 0, evals, "no reserve script on its own read either");
    });

    test("a UUID taken for a device is refused until the device record holds it with a running slot", async () => {
      // The take happened, the record is not written yet: the nodes list it ahead.
      mem.zsets.set(POOL_TAKEN_KEY, new Map([[R, Date.now()]]));
      const { lines } = await nodeLines();
      assert.ok(lines.get(R) > Date.now(), "listed ahead while in flight");
      assert.deepEqual(await connect(R), { ok: false });

      // /api/vpn/create writes the record: R is the third device on a 3-slot plan.
      mem.store.set(
        "profiles:tg_1",
        JSON.stringify([{ uuid: A, createdAt: 1 }, { uuid: B, createdAt: 2 }, { uuid: R, createdAt: 3 }]),
      );
      mock.timers.tick(REBUILD_EVERY_MS);
      assert.deepEqual(await connect(R), { ok: true, id: R }, "the device record decides, not the reserve");
    });

    test("the reserve unreadable for good: the nodes get 503, Hysteria2 still answers from the devices", async () => {
      mock.method(console, "error", () => {});
      resetUuidPoolInstance();
      mem.zsets.set(POOL_READY_KEY, new Map([[R, Date.now() - DAY]]));
      // Every reserve call keeps failing (a one-off fault would let a later
      // reserve read succeed and hide a Hysteria2 that depends on it).
      mem.failNext("eval", { times: 1_000 });
      mem.failNext("zrange", { times: 1_000 });
      const { status } = await nodeLines();
      assert.equal(status, 503, "no view of the reserve: the nodes keep their list");
      assert.deepEqual(await connect(A), { ok: true, id: A });
      assert.deepEqual(await connect(R), { ok: false });
      assert.deepEqual(await connect(C), { ok: false });
      mock.timers.tick(STALE_IF_ERROR_MS + REBUILD_EVERY_MS);
      assert.deepEqual(await connect(A), { ok: true, id: A }, "fresh device reads, however long the reserve is down");
      assert.equal((await nodeLines()).status, 503);
    });
  });
});
