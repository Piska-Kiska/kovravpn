// tests/uuid-pool-lua.test.mjs — run: npm test
//
// TAKE_LUA and MAINTAIN_LUA (src/lib/uuid-pool-body.ts): the whole reserve of
// device UUIDs runs as two server-side scripts. Every case runs twice: the
// real script in the local `lua` interpreter with a redis.call shim
// (tests/support/lua-redis.mjs; skipped when there is no `lua` on PATH), and
// the JS twin the in-memory Redis uses (tests/support/uuid-pool-twin.mjs).
// Both must give the expected reply and the expected sets, so the tests that
// use the twins test the scripts. UUIDs are made up.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";
import { luaAvailable, runLua } from "./support/lua-redis.mjs";
import { maintainTwin, takeTwin } from "./support/uuid-pool-twin.mjs";
import { zsetOps } from "./support/memory-redis.mjs";

const body = await import("../src/lib/uuid-pool-body.ts");
const {
  TAKE_LUA,
  MAINTAIN_LUA,
  POOL_READY_KEY: READY,
  POOL_TAKEN_KEY: TAKEN,
  POOL_RETIRED_KEY: RETIRED,
  POOL_MIN_AGE_MS,
  POOL_MAX_AGE_MS,
  POOL_ROTATE_PER_BUILD,
  TAKEN_GRACE_MS,
  takeArgs,
  takeKeys,
  maintainArgs,
  maintainKeys,
  parseMaintainReply,
  parseTakeReply,
} = body;
const { NODE_BODY_WINDOW_MS } = await import("../src/lib/node-uuids-body.ts");

const NOW = 1_790_000_000_000;
const MIN = 60_000;
const DAY = 86_400_000;
const u = (n) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const LUA = luaAvailable();

/** key -> [[member, score], ...] as a Map of Maps. */
function zs(spec) {
  return new Map(Object.entries(spec).map(([k, entries]) => [k, new Map(entries)]));
}

function clone(zsets) {
  return new Map([...zsets].map(([k, set]) => [k, new Map(set)]));
}

/** Plain object of the sets, for deepEqual across both runners. */
function plain(zsets) {
  const out = {};
  for (const [k, set] of [...zsets].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (set.size === 0) continue;
    out[k] = Object.fromEntries([...set].map(([m, s]) => [m, Number(s)]).sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  return out;
}

function runTwin(twin, zsets, keys, args) {
  const z = clone(zsets);
  const reply = twin({ ...zsetOps(z) }, keys, args);
  return { reply, zsets: z };
}

/** Run `source` / `twin` on the same input; both must match `expect`. */
function both(name, { source, twin, zsets, keys, args, reply, after }) {
  const cases = [["twin", () => runTwin(twin, zsets, keys, args)]];
  if (LUA) cases.push(["lua", () => runLua(source, { store: new Map(), keys, args, zsets: clone(zsets) })]);
  for (const [runner, run] of cases) {
    const got = run();
    assert.deepEqual(got.reply, reply, `${name} [${runner}]: reply`);
    assert.deepEqual(plain(got.zsets), plain(after), `${name} [${runner}]: sets`);
  }
}

describe("TAKE_LUA", () => {
  const take = (name, zsets, reply, after) =>
    both(name, { source: TAKE_LUA, twin: takeTwin, zsets, keys: takeKeys(), args: takeArgs(NOW), reply, after });

  test("an empty reserve: none, nothing changes", () => {
    take("empty", zs({}), ["none"], zs({}));
  });

  test("only UUIDs younger than the minimum age: none", () => {
    const young = zs({ [READY]: [[u(1), NOW - POOL_MIN_AGE_MS + 1]] });
    take("young", young, ["none"], young);
  });

  test("the oldest old-enough UUID moves to taken, stamped now", () => {
    take(
      "oldest",
      zs({
        [READY]: [
          [u(3), NOW - 2 * DAY],
          [u(1), NOW - 3 * DAY],
          [u(2), NOW - POOL_MIN_AGE_MS],
          [u(4), NOW - MIN],
        ],
        [TAKEN]: [[u(9), NOW - 5 * MIN]],
      }),
      ["ok", u(1)],
      zs({
        [READY]: [
          [u(3), NOW - 2 * DAY],
          [u(2), NOW - POOL_MIN_AGE_MS],
          [u(4), NOW - MIN],
        ],
        [TAKEN]: [
          [u(9), NOW - 5 * MIN],
          [u(1), NOW],
        ],
      }),
    );
  });

  test("equal ages: the smallest UUID first, as Redis orders them", () => {
    take(
      "tie",
      zs({ [READY]: [[u(7), NOW - DAY], [u(5), NOW - DAY]] }),
      ["ok", u(5)],
      zs({ [READY]: [[u(7), NOW - DAY]], [TAKEN]: [[u(5), NOW]] }),
    );
  });

  test("parseTakeReply reads both answers and refuses anything else", () => {
    assert.equal(parseTakeReply(["none"]), null);
    assert.equal(parseTakeReply(["ok", u(1).toUpperCase()]), u(1));
    for (const bad of [null, [], ["ok"], ["ok", "not-a-uuid"], ["none", u(1)], ["maybe"], "ok"]) {
      assert.throws(() => parseTakeReply(bad), /uuid pool/, JSON.stringify(bad));
    }
  });
});

describe("MAINTAIN_LUA", () => {
  const fresh = [u(101), u(102), u(103), u(104), u(105)];
  const run = (name, zsets, cap, reply, after, extra = fresh) =>
    both(name, {
      source: MAINTAIN_LUA,
      twin: maintainTwin,
      zsets,
      keys: maintainKeys(),
      args: maintainArgs(NOW, cap, extra.slice(0, cap)),
      reply,
      after,
    });
  const S = String;

  test("an empty reserve is filled up to the cap and read back", () => {
    run(
      "fill",
      zs({}),
      3,
      ["pool", "3", "0", "3", u(101), S(NOW), u(102), S(NOW), u(103), S(NOW), "0", "0"],
      zs({ [READY]: [[u(101), NOW], [u(102), NOW], [u(103), NOW]] }),
    );
  });

  test("a full reserve gets nothing more; taken and retired are read too", () => {
    const sets = zs({
      [READY]: [[u(1), NOW - DAY], [u(2), NOW - 2 * DAY]],
      [TAKEN]: [[u(3), NOW - MIN]],
      [RETIRED]: [[u(4), NOW - 2 * MIN]],
    });
    run(
      "full",
      sets,
      2,
      ["pool", "0", "0", "2", u(2), S(NOW - 2 * DAY), u(1), S(NOW - DAY), "1", u(3), S(NOW - MIN), "1", u(4), S(NOW - 2 * MIN)],
      sets,
    );
  });

  test("UUIDs past the maximum age are retired, oldest first, at most the budget per call", () => {
    assert.equal(POOL_ROTATE_PER_BUILD, 2);
    const old = (n, days) => [u(n), NOW - POOL_MAX_AGE_MS - days * DAY];
    run(
      "rotate",
      zs({ [READY]: [old(1, 3), old(2, 1), old(3, 2), old(4, 0), [u(5), NOW - DAY]] }),
      5,
      [
        "pool", "2", "2",
        "5", u(2), S(NOW - POOL_MAX_AGE_MS - DAY), u(4), S(NOW - POOL_MAX_AGE_MS), u(5), S(NOW - DAY), u(101), S(NOW), u(102), S(NOW),
        "0",
        "2", u(1), S(NOW), u(3), S(NOW),
      ],
      zs({
        [READY]: [old(2, 1), old(4, 0), [u(5), NOW - DAY], [u(101), NOW], [u(102), NOW]],
        [RETIRED]: [[u(1), NOW], [u(3), NOW]],
      }),
    );
  });

  test("a lowered cap retires the newest first, within the budget, and adds nothing", () => {
    const ready = [1, 2, 3, 4, 5, 6].map((n) => [u(n), NOW - n * MIN]);
    run(
      "shrink",
      zs({ [READY]: ready }),
      2,
      [
        "pool", "0", "2",
        "4", u(6), S(NOW - 6 * MIN), u(5), S(NOW - 5 * MIN), u(4), S(NOW - 4 * MIN), u(3), S(NOW - 3 * MIN),
        "0",
        "2", u(1), S(NOW), u(2), S(NOW),
      ],
      zs({ [READY]: ready.slice(2), [RETIRED]: [[u(1), NOW], [u(2), NOW]] }),
    );
  });

  test("too old and over the cap share one budget", () => {
    run(
      "shared",
      zs({ [READY]: [[u(1), NOW - POOL_MAX_AGE_MS - DAY], [u(2), NOW - 3 * MIN], [u(3), NOW - 2 * MIN], [u(4), NOW - MIN]] }),
      1,
      ["pool", "0", "2", "2", u(2), S(NOW - 3 * MIN), u(3), S(NOW - 2 * MIN), "0", "2", u(1), S(NOW), u(4), S(NOW)],
      zs({ [READY]: [[u(2), NOW - 3 * MIN], [u(3), NOW - 2 * MIN]], [RETIRED]: [[u(1), NOW], [u(4), NOW]] }),
    );
  });

  test("cap 0 (reserve off): nothing added, what is left drains a budget per call", () => {
    run(
      "off",
      zs({ [READY]: [[u(1), NOW - 3 * MIN], [u(2), NOW - 2 * MIN], [u(3), NOW - MIN]] }),
      0,
      ["pool", "0", "2", "1", u(1), S(NOW - 3 * MIN), "0", "2", u(2), S(NOW), u(3), S(NOW)],
      zs({ [READY]: [[u(1), NOW - 3 * MIN]], [RETIRED]: [[u(2), NOW], [u(3), NOW]] }),
    );
  });

  test("marks whose lines have left the node answer are forgotten, fresher ones kept", () => {
    const takenEdge = NOW - TAKEN_GRACE_MS - NODE_BODY_WINDOW_MS - 3_600_000;
    const retiredEdge = NOW - NODE_BODY_WINDOW_MS - 3_600_000;
    run(
      "forget",
      zs({
        [READY]: [[u(1), NOW - DAY]],
        [TAKEN]: [[u(2), takenEdge], [u(3), takenEdge + 1]],
        [RETIRED]: [[u(4), retiredEdge], [u(5), retiredEdge + 1]],
      }),
      1,
      ["pool", "0", "0", "1", u(1), S(NOW - DAY), "1", u(3), S(takenEdge + 1), "1", u(5), S(retiredEdge + 1)],
      zs({ [READY]: [[u(1), NOW - DAY]], [TAKEN]: [[u(3), takenEdge + 1]], [RETIRED]: [[u(5), retiredEdge + 1]] }),
    );
  });

  test("a fresh UUID already in the reserve is not counted twice", () => {
    run(
      "nx",
      zs({ [READY]: [[u(101), NOW - DAY]] }),
      2,
      ["pool", "1", "0", "2", u(101), S(NOW - DAY), u(102), S(NOW), "0", "0"],
      zs({ [READY]: [[u(101), NOW - DAY], [u(102), NOW]] }),
      [u(101), u(102)],
    );
  });
});

describe("parseMaintainReply", () => {
  const reply = ["pool", "1", "0", "1", u(1), String(NOW), "1", u(2), String(NOW - MIN), "0"];

  test("reads the script's reply, with Upstash's numbers or as strings", () => {
    const want = {
      ready: [{ uuid: u(1), at: NOW }],
      taken: [{ uuid: u(2), at: NOW - MIN }],
      retired: [],
      added: 1,
      rotated: 0,
      malformed: 0,
    };
    assert.deepEqual(parseMaintainReply(reply), want);
    const upstash = reply.map((x) => (/^[0-9]+$/.test(x) ? Number(x) : x));
    assert.deepEqual(parseMaintainReply(upstash), want);
  });

  test("a member that is not a UUID is skipped and counted", () => {
    const got = parseMaintainReply(["pool", 0, 0, 2, "junk", NOW, u(1), NOW, 0, 0]);
    assert.deepEqual(got.ready, [{ uuid: u(1), at: NOW }]);
    assert.equal(got.malformed, 1);
  });

  test("any other shape throws", () => {
    for (const bad of [
      null,
      [],
      ["pool"],
      ["pool", 0, 0, 1, u(1)],
      ["pool", 0, 0, 0, 0],
      ["pool", 0, 0, 0, 0, 0, "extra"],
      ["pool", -1, 0, 0, 0, 0],
      ["other", 0, 0, 0, 0, 0],
    ]) {
      assert.throws(() => parseMaintainReply(bad), /uuid pool/, JSON.stringify(bad));
    }
  });
});
