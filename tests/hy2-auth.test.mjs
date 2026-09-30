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
//   • when storage fails the last good list answers for a few minutes, then
//     every connect is refused (fail closed);
//   • the wire contract Hysteria2 expects stays: always 200, {ok, id}.
//
// UUIDs and ids are made up.

import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { decideHy2, indexPairs, createHy2Access, STALE_IF_ERROR_MS } = await import("../src/lib/hy2-access.ts");
const { REBUILD_EVERY_MS } = await import("../src/lib/node-uuids.ts");
const { POST } = await import("../src/app/api/hy2/auth/route.ts");

const NOW = 1_790_000_000_000;
const DAY = 86_400_000;
const A = "0a1b2c3d-0000-4000-8000-00000000000a";
const B = "0a1b2c3d-0000-4000-8000-00000000000b";
const C = "0a1b2c3d-0000-4000-8000-00000000000c";
const D = "0a1b2c3d-0000-4000-8000-00000000000d";
const E = "0a1b2c3d-0000-4000-8000-00000000000e";

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
    async readPairs() {
      reads += 1;
      if (failing) throw new Error("storage down");
      return { pairs, malformed: 0 };
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
});
