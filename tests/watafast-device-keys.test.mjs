// tests/watafast-device-keys.test.mjs
//
// The ledger of device keys a link holds reserve credentials for
// (src/lib/watafast-device-keys.ts).
//
// The decision "may this link have one more key" is one Redis script, because
// taken in two steps it let thirty requests of one moment all in. Its Lua text
// is run here under the `lua` on this machine with a stand-in for Redis's
// `redis`, and held against the JavaScript model the in-memory fake runs
// (tests/support/device-key-admit-model.mjs), step for step over a long random
// history. Without a `lua` on PATH the runs are skipped and the text checks
// and the checks of the function around the script still count.
//
// Pinned here: the script holds a link to as many keys as it is told; a key
// in the ledger is always let in and has its time moved; one more is refused
// and nothing is written, not even the ledger's TTL; a key is forgotten when
// its last credential is as old as the memory, to the millisecond; every
// argument reaches Redis as text;
// the script uses nothing newer than Redis's Lua 5.1; the function refuses
// arguments and answers that do not read instead of guessing.
//
// Every value below is synthetic.
//
// Run: npm test

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import "./support/load-ts.mjs";
import { DEVICE_KEY_ADMIT_MARK, runDeviceKeyAdmit } from "./support/device-key-admit-model.mjs";

const { ADMIT_DEVICE_KEY_SCRIPT, admitDeviceKey, MAX_KEYS_PER_LINK, KEY_MEMORY_S } = await import(
  "../src/lib/watafast-device-keys.ts"
);

const LEDGER = "wfk:ledger-test-token";
const MEMORY_MS = KEY_MEMORY_S * 1000;
const START = 1_800_000_000_000;
const HOUR = 60 * 60 * 1000;

const probe = spawnSync("lua", ["-v"], { encoding: "utf8" });
const LUA = probe.error === undefined && probe.status === 0;
const SKIP = LUA ? false : "no `lua` on PATH: the script's text is checked, its runs are not";

/** A JS string as a Lua string literal: printable ASCII as is, every other byte as \ddd. */
function luaString(s) {
  let out = '"';
  for (const byte of Buffer.from(s, "utf8")) {
    const ch = String.fromCharCode(byte);
    out += byte >= 0x20 && byte < 0x7f && ch !== '"' && ch !== "\\" ? ch : `\\${String(byte).padStart(3, "0")}`;
  }
  return `${out}"`;
}

/** What one step is asked with: the script's ARGV for a member at a time, in a ledger of three unless told. */
const argvOf = (member, nowMs, max = 3) => [
  member,
  String(nowMs),
  String(nowMs - MEMORY_MS),
  String(MEMORY_MS),
  String(max),
];

/** One line per step: the reply, the ledger in order, its TTL. */
const lineOf = (reply, set, ttl) => `${reply}|${set.map((e) => `${e.member}:${e.score}`).join(",")}|${ttl ?? ""}`;

/**
 * Run the script's own text under Lua, once per step, over one ledger that
 * lives across the steps. `steps`: arrays of ARGV. Answers one line per step,
 * as `lineOf` writes them.
 */
function runLua(steps) {
  const program = `
local db, ttl = {}, {}
redis = {}
function redis.call(name, ...)
  local a = { ... }
  -- Redis is sent text; a number here would be printed by the script engine.
  for i = 1, #a do assert(type(a[i]) == "string", name .. ": argument " .. i .. " is not text") end
  name = string.upper(name)
  local set = db[a[1]]
  if name == "ZREMRANGEBYSCORE" then
    assert(#a == 3, "ZREMRANGEBYSCORE key min max")
    local lo, hi = tonumber(a[2]), tonumber(a[3])
    assert(lo ~= nil and hi ~= nil, "ZREMRANGEBYSCORE needs numbers")
    local removed = 0
    if set then
      for member, score in pairs(set) do
        if score >= lo and score <= hi then
          set[member] = nil
          removed = removed + 1
        end
      end
      if next(set) == nil then
        db[a[1]] = nil
        ttl[a[1]] = nil
      end
    end
    return removed
  elseif name == "ZSCORE" then
    assert(#a == 2, "ZSCORE key member")
    if set and set[a[2]] ~= nil then return string.format("%.0f", set[a[2]]) end
    return false
  elseif name == "ZCARD" then
    assert(#a == 1, "ZCARD key")
    local n = 0
    if set then for _ in pairs(set) do n = n + 1 end end
    return n
  elseif name == "ZADD" then
    assert(#a == 3, "ZADD key score member")
    local score = tonumber(a[2])
    assert(score ~= nil, "ZADD needs a number for the score")
    if not set then
      set = {}
      db[a[1]] = set
    end
    local added = set[a[3]] == nil and 1 or 0
    set[a[3]] = score
    return added
  elseif name == "PEXPIRE" then
    assert(#a == 2, "PEXPIRE key ms")
    local ms = tonumber(a[2])
    assert(ms ~= nil and ms > 0 and ms == math.floor(ms), "PEXPIRE needs whole milliseconds")
    if not set then return 0 end
    ttl[a[1]] = ms
    return 1
  end
  error("unexpected command " .. name)
end

local script = assert(load(${luaString(ADMIT_DEVICE_KEY_SCRIPT)}))
KEYS = { ${luaString(LEDGER)} }
local steps = {
${steps.map((argv) => `  { ${argv.map(luaString).join(", ")} },`).join("\n")}
}
for _, argv in ipairs(steps) do
  ARGV = argv
  local reply = script()
  assert(type(reply) == "number", "the script answers a number")
  local members = {}
  for member in pairs(db[KEYS[1]] or {}) do members[#members + 1] = member end
  local set = db[KEYS[1]] or {}
  table.sort(members, function(x, y)
    if set[x] ~= set[y] then return set[x] < set[y] end
    return x < y
  end)
  local parts = {}
  for i, member in ipairs(members) do parts[i] = member .. ":" .. string.format("%.0f", set[member]) end
  local kept = ttl[KEYS[1]]
  print(string.format("%d", reply) .. "|" .. table.concat(parts, ",") .. "|" .. (kept and string.format("%.0f", kept) or ""))
end
`;
  const run = spawnSync("lua", ["-"], { input: program, encoding: "utf8" });
  assert.equal(run.status, 0, `lua: ${run.stderr}`);
  return run.stdout.split("\n").filter((line) => line !== "");
}

/** The same steps over the model, in the same lines. */
function runModel(steps) {
  const zsets = new Map();
  const ttls = new Map();
  return steps.map((argv) => {
    const reply = runDeviceKeyAdmit(zsets, (key, ms) => ttls.set(key, ms), [LEDGER], argv);
    const set = zsets.get(LEDGER) ?? [];
    // Redis drops the TTL with the key it was on.
    if (set.length === 0) ttls.delete(LEDGER);
    return lineOf(reply, set, ttls.get(LEDGER));
  });
}

/** A small generator with a seed: the same history every run. */
function randomOf(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe("the admit script, its own text under Lua", { skip: SKIP }, () => {
  test("three keys are let in, one more is refused and writes nothing", () => {
    const lines = runLua([
      argvOf("ka", START),
      argvOf("kb", START + 1),
      argvOf("kc", START + 2),
      argvOf("kd", START + 3),
      argvOf("ka", START + 4), // in the ledger: let in, and its time moves
      argvOf("kd", START + 5),
    ]);
    assert.deepEqual(lines, [
      `2|ka:${START}|${MEMORY_MS}`,
      `2|ka:${START},kb:${START + 1}|${MEMORY_MS}`,
      `2|ka:${START},kb:${START + 1},kc:${START + 2}|${MEMORY_MS}`,
      `0|ka:${START},kb:${START + 1},kc:${START + 2}|${MEMORY_MS}`,
      `1|kb:${START + 1},kc:${START + 2},ka:${START + 4}|${MEMORY_MS}`,
      `0|kb:${START + 1},kc:${START + 2},ka:${START + 4}|${MEMORY_MS}`,
    ]);
  });

  test("a key is forgotten when its last credential is as old as the memory, to the millisecond", () => {
    const lines = runLua([
      argvOf("ka", START),
      argvOf("kb", START),
      argvOf("kc", START + 10 * HOUR),
      argvOf("kd", START + MEMORY_MS - 1), // one millisecond short: all three are held
      argvOf("kd", START + MEMORY_MS), // exactly as old: ka and kb are gone
      argvOf("ke", START + MEMORY_MS),
      argvOf("kf", START + MEMORY_MS),
    ]);
    assert.deepEqual(
      lines.map((line) => line.split("|")[0]),
      ["2", "2", "2", "0", "2", "2", "0"],
    );
    assert.equal(lines[4], `2|kc:${START + 10 * HOUR},kd:${START + MEMORY_MS}|${MEMORY_MS}`);
  });

  test("the script and its model agree over a long random history", () => {
    const random = randomOf(20261012);
    const members = ["ka", "kb", "kc", "kd", "ke", "kf"];
    const steps = [];
    let now = START;
    for (let i = 0; i < 600; i += 1) {
      // Mostly a few hours on, now and then the same millisecond or days on.
      const kind = random();
      if (kind < 0.15) now += 0;
      else if (kind < 0.9) now += Math.floor(random() * 30 * HOUR);
      else now += Math.floor(random() * 200 * HOUR);
      steps.push(argvOf(members[Math.floor(random() * members.length)], now, 1 + Math.floor(random() * 3)));
    }
    const lua = runLua(steps);
    const model = runModel(steps);
    assert.equal(lua.length, steps.length);
    assert.deepEqual(lua, model);
    // The history is worth its length only if every answer is in it.
    const answers = new Set(model.map((line) => line.split("|")[0]));
    assert.deepEqual([...answers].sort(), ["0", "1", "2"]);
  });
});

describe("the admit script, as text", () => {
  test("carries the mark the in-memory store knows it by", () => {
    assert.ok(ADMIT_DEVICE_KEY_SCRIPT.includes(DEVICE_KEY_ADMIT_MARK));
  });

  test("uses nothing newer than Redis's Lua 5.1, and only the five commands", () => {
    // Integer division, bitwise operators, goto and attributes came later.
    assert.equal(/\/\/|<<|>>|[&|]|\bgoto\b|<const>|<close>|~(?!=)/.test(ADMIT_DEVICE_KEY_SCRIPT), false);
    const commands = [...ADMIT_DEVICE_KEY_SCRIPT.matchAll(/redis\.call\("([A-Z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(commands, ["ZREMRANGEBYSCORE", "ZSCORE", "ZCARD", "ZADD", "PEXPIRE"]);
    // One key, and it is the only thing the script touches: a rule of Redis's scripts.
    assert.equal(/KEYS\[(?!1\])/.test(ADMIT_DEVICE_KEY_SCRIPT), false);
  });
});

describe("admitDeviceKey", () => {
  const KEY_HEX = "ab".repeat(32);

  /** A store that records what it was asked and answers `reply`. */
  function storeAnswering(reply) {
    const asked = [];
    return {
      asked,
      async eval(script, keys, args) {
        asked.push({ script, keys, args });
        return reply;
      },
    };
  }

  test("asks the script once, with the link's ledger and nothing but text", async () => {
    const store = storeAnswering(2);
    assert.equal(await admitDeviceKey(store, "ledger-test-token", KEY_HEX.toUpperCase(), START), "new");
    assert.equal(store.asked.length, 1);
    const [{ script, keys, args }] = store.asked;
    assert.equal(script, ADMIT_DEVICE_KEY_SCRIPT);
    assert.deepEqual(keys, [LEDGER]);
    // Upper and lower case are one key; the letter in front keeps a key of
    // digits alone from being read back as a number.
    assert.deepEqual(args, [`k${KEY_HEX}`, String(START), String(START - MEMORY_MS), String(MEMORY_MS), String(MAX_KEYS_PER_LINK)]);
    // Wide enough for someone who installs the app again and again in one
    // evening, narrow enough that keys are not handed out by the dozen.
    assert.equal(MAX_KEYS_PER_LINK, 5);
  });

  test("reads the answer as a number or as the same number in text", async () => {
    for (const [reply, admission] of [
      [0, "full"],
      [1, "known"],
      [2, "new"],
      ["0", "full"],
      ["1", "known"],
      ["2", "new"],
    ]) {
      assert.equal(await admitDeviceKey(storeAnswering(reply), "ledger-test-token", KEY_HEX, START), admission);
    }
  });

  test("an answer that does not read is a fault, not a guess", async () => {
    for (const reply of [null, undefined, "", "OK", 3, -1, 1.5, true, [], {}]) {
      await assert.rejects(admitDeviceKey(storeAnswering(reply), "ledger-test-token", KEY_HEX, START), /does not read/, String(reply));
    }
  });

  test("arguments that are not a link, a key and a time never reach the store", async () => {
    const store = storeAnswering(2);
    const bad = [
      ["", KEY_HEX, START],
      ["ledger-test-token", "", START],
      ["ledger-test-token", KEY_HEX.slice(2), START],
      ["ledger-test-token", `${KEY_HEX}ab`, START],
      ["ledger-test-token", `zz${KEY_HEX.slice(2)}`, START],
      ["ledger-test-token", KEY_HEX, Number.NaN],
      ["ledger-test-token", KEY_HEX, START + 0.5],
      ["ledger-test-token", KEY_HEX, 0],
      ["ledger-test-token", KEY_HEX, -START],
      ["ledger-test-token", KEY_HEX, Math.floor(START / 1000)], // seconds where milliseconds belong
    ];
    for (const [token, key, now] of bad) {
      await assert.rejects(admitDeviceKey(store, token, key, now), /not a link, a key and a time/, JSON.stringify([token, key, now]));
    }
    assert.equal(store.asked.length, 0);
  });

  test("what the store throws is thrown on", async () => {
    const store = {
      async eval() {
        throw new Error("store down");
      },
    };
    await assert.rejects(admitDeviceKey(store, "ledger-test-token", KEY_HEX, START), /store down/);
  });
});
