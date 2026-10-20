// tests/pair-code-script.test.mjs
//
// The redeem script of a «Код для приложения» (src/lib/pair-code.ts
// PAIR_CODE_REDEEM_SCRIPT), the Lua text itself, run under the `lua` on this
// machine with a stand-in for Redis's `redis` and `cjson`, and held against
// the JavaScript model the in-memory fakes run
// (tests/support/pair-code-redeem-model.mjs). Without a `lua` on PATH the
// runs are skipped and only the text checks below them count.
//
// Pinned here: one script takes the code and leaves the replay record; with
// no id it neither writes nor reads the record; a record cjson cannot read,
// no cjson at all, or a SET that fails still give the code back with 0 for
// "no replay record" and never end the script in an error after the GETDEL;
// the replay record is {subUrl, rid} with the TTL passed in; the script uses
// nothing newer than Redis's Lua 5.1.
//
// Every value below is synthetic.
//
// Run: npm test

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

import "./support/load-ts.mjs";
import { PAIR_CODE_REDEEM_MARK, runPairCodeRedeem } from "./support/pair-code-redeem-model.mjs";

const { PAIR_CODE_REDEEM_SCRIPT } = await import("../src/lib/pair-code.ts");

const TOKEN = "0123456789abcdef0123456789abcdef"; // gitleaks:allow — synthetic test value
const SUB = `https://kovravpn.com/api/sub/${TOKEN}`;
const RID = createHash("sha256").update("synthetic-request-id", "utf8").digest("hex");
const CODE_KEY = "paircode:K7QM2XPA";
const DONE_KEY = "paircode:done:K7QM2XPA";
const RECORD = JSON.stringify({ subUrl: SUB, userId: "tg_100", deviceId: "11111111-0000-4000-8000-000000000001", createdAt: 1 });

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

/** A parsed JSON value as a Lua literal, null as `cjson_null` (a userdata, as cjson's own null is). */
function luaValue(v) {
  if (v === null) return "cjson_null";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return luaString(v);
  if (Array.isArray(v)) return `{ ${v.map(luaValue).join(", ")} }`;
  return `{ ${Object.entries(v)
    .map(([k, x]) => `[${luaString(k)}] = ${luaValue(x)}`)
    .join(", ")} }`;
}

/**
 * Run the script once under Lua. `db`: key -> stored string. `cjson`: false
 * to leave it out; otherwise decode answers from what JSON.parse makes of
 * each stored value (and errors on what it cannot read), encode is a plain
 * JSON writer that escapes "/" as cjson does. `failSet`: SET errors.
 * Answers {reply, db: key -> {value, ex}, calls: [command names]}.
 */
function runLua(db, keys, args, { cjson = true, failSet = false } = {}) {
  const decodable = [];
  for (const value of Object.values(db)) {
    try {
      decodable.push(`[${luaString(value)}] = ${luaValue(JSON.parse(value))}`);
    } catch {
      // Not JSON: the stand-in's decode errors on it, as cjson's does.
    }
  }
  const harness = `
local cjson_null = io.stdout
local db, calls = {}, {}
${Object.entries(db)
  .map(([k, v]) => `db[${luaString(k)}] = { value = ${luaString(v)} }`)
  .join("\n")}
KEYS = { ${keys.map(luaString).join(", ")} }
ARGV = { ${args.map(luaString).join(", ")} }

local function json(v)
  local t = type(v)
  if v == nil or v == cjson_null then return "null" end
  if t == "boolean" or t == "number" then return tostring(v) end
  if t == "string" then
    return '"' .. v:gsub('[%c"\\\\/]', function(c)
      if c == '"' then return '\\\\"' elseif c == "\\\\" then return "\\\\\\\\" elseif c == "/" then return "\\\\/" end
      return string.format("\\\\u%04x", c:byte())
    end) .. '"'
  end
  if t ~= "table" then error("json: cannot encode a " .. t) end
  if #v > 0 then
    local parts = {}
    for i = 1, #v do parts[i] = json(v[i]) end
    return "[" .. table.concat(parts, ",") .. "]"
  end
  local names = {}
  for k in pairs(v) do names[#names + 1] = k end
  table.sort(names)
  local parts = {}
  for i, k in ipairs(names) do parts[i] = json(k) .. ":" .. json(v[k]) end
  return "{" .. table.concat(parts, ",") .. "}"
end

${
  cjson
    ? `local decodable = { ${decodable.join(", ")} }
cjson = {
  decode = function(s)
    local v = decodable[s]
    if v == nil then error("Expected value but found invalid token") end
    return v
  end,
  encode = json,
}`
    : "-- no cjson in this run"
}

local fail_set = ${failSet ? "true" : "false"}
redis = {}
function redis.call(name, ...)
  local args = { ... }
  name = string.upper(name)
  calls[#calls + 1] = name
  if name == "GETDEL" or name == "GET" then
    assert(#args == 1, name .. " takes one key")
    local cur = db[args[1]]
    if name == "GETDEL" then db[args[1]] = nil end
    if cur == nil then return false end
    return cur.value
  elseif name == "SET" then
    assert(#args == 4 and string.upper(args[3]) == "EX", "SET key value EX ttl")
    assert(type(args[2]) == "string", "SET value must be a string")
    local ttl = tonumber(args[4])
    assert(ttl ~= nil and ttl > 0 and ttl == math.floor(ttl), "SET EX needs whole seconds")
    if fail_set then error("OOM command not allowed when used memory > 'maxmemory'") end
    db[args[1]] = { value = args[2], ex = ttl }
    return { ok = "OK" }
  end
  error("unexpected command " .. name)
end
function redis.pcall(name, ...)
  local ok, res = pcall(redis.call, name, ...)
  if ok then return res end
  return { err = tostring(res) }
end

local script = io.read("a")
local f = assert(load(script, "=redeem", "t"))
local reply = f()
if reply == false then reply = nil end
local out = {}
for k, cur in pairs(db) do out[k] = { value = cur.value, ex = cur.ex or cjson_null } end
io.write(json({ reply = reply or cjson_null, db = out, calls = #calls > 0 and calls or cjson_null }))
`;
  // The harness as the program, the script on stdin, so its text reaches Lua untouched.
  const run = spawnSync("lua", ["-e", harness], { input: PAIR_CODE_REDEEM_SCRIPT, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`lua failed: ${run.stderr}`);
  const parsed = JSON.parse(run.stdout);
  return { reply: parsed.reply, db: parsed.db, calls: parsed.calls ?? [] };
}

/** The model over the same db, in the same shape. */
function runModel(db, keys, args) {
  const state = new Map(Object.entries(db).map(([k, v]) => [k, { value: v, ex: null }]));
  const reply = runPairCodeRedeem(
    {
      getdel(key) {
        const cur = state.get(key);
        state.delete(key);
        return cur === undefined ? null : cur.value;
      },
      get(key) {
        const cur = state.get(key);
        return cur === undefined ? null : cur.value;
      },
      set(key, value, ex) {
        state.set(key, { value, ex });
      },
    },
    keys,
    args,
  );
  return { reply, db: Object.fromEntries(state) };
}

/** Stored values compared as JSON where they are JSON: cjson writes "\/" where JSON.stringify writes "/". */
function readable(db) {
  return Object.fromEntries(
    Object.entries(db).map(([k, { value, ex }]) => {
      let v = value;
      try {
        v = JSON.parse(value);
      } catch {
        // Kept as the string it is.
      }
      return [k, { value: v, ex }];
    }),
  );
}

function assertSameAsModel(db, keys, args, label) {
  const lua = runLua(db, keys, args);
  const model = runModel(db, keys, args);
  assert.deepEqual(lua.reply, model.reply, `${label}: reply`);
  assert.deepEqual(readable(lua.db), readable(model.db), `${label}: what is left in Redis`);
  return lua;
}

describe("PAIR_CODE_REDEEM_SCRIPT, the text", () => {
  test("carries the mark the fakes know it by, and calls Redis only with GETDEL, GET and SET", () => {
    assert.ok(PAIR_CODE_REDEEM_SCRIPT.includes(PAIR_CODE_REDEEM_MARK));
    const commands = [...PAIR_CODE_REDEEM_SCRIPT.matchAll(/redis\.p?call\("([A-Z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(commands, ["GETDEL", "SET", "GET"]);
    assert.match(PAIR_CODE_REDEEM_SCRIPT, /redis\.pcall\("SET", KEYS\[2\], value, "EX", ARGV\[2\]\)/, "the record's SET may fail without failing the script");
    assert.match(PAIR_CODE_REDEEM_SCRIPT, /pcall\(function\(\)\s+local record = cjson\.decode\(taken\)/, "cjson is reached only inside pcall");
  });

  test("nothing newer than Redis's Lua 5.1: no goto, labels, integer division, bitwise operators, attributes or global declarations", () => {
    const code = PAIR_CODE_REDEEM_SCRIPT.split("\n")
      .map((line) => line.replace(/--.*$/, ""))
      .join("\n")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const re of [/\bgoto\b/, /::\w+::/, /\/\//, /[&|]/, /~(?!=)/, /<<|>>/, /<(const|close)>/, /^\s*global\b/m]) {
      assert.doesNotMatch(code, re, String(re));
    }
  });
});

describe("PAIR_CODE_REDEEM_SCRIPT under Lua, against the model", { skip: SKIP }, () => {
  test("the code with an id: taken, the replay record {subUrl, rid} written for the TTL passed in", () => {
    const lua = assertSameAsModel({ [CODE_KEY]: RECORD }, [CODE_KEY, DONE_KEY], [RID, "300"], "taken with an id");
    assert.deepEqual(lua.reply, ["taken", RECORD, 1]);
    assert.deepEqual(Object.keys(lua.db), [DONE_KEY]);
    assert.deepEqual(JSON.parse(lua.db[DONE_KEY].value), { subUrl: SUB, rid: RID });
    assert.equal(lua.db[DONE_KEY].ex, 300);
    assert.deepEqual(lua.calls, ["GETDEL", "SET"]);
  });

  test("the code without an id: taken, no record written, none read", () => {
    const lua = assertSameAsModel({ [CODE_KEY]: RECORD, [DONE_KEY]: JSON.stringify({ subUrl: SUB, rid: RID }) }, [CODE_KEY, DONE_KEY], ["", "300"], "taken, no id");
    assert.deepEqual(lua.reply, ["taken", RECORD, 0]);
    assert.deepEqual(lua.calls, ["GETDEL"]);
  });

  test("the code gone, an id: the replay record as stored, nothing written, its TTL untouched", () => {
    const done = JSON.stringify({ subUrl: SUB, rid: RID });
    const lua = assertSameAsModel({ [DONE_KEY]: done }, [CODE_KEY, DONE_KEY], [RID, "300"], "done");
    assert.deepEqual(lua.reply, ["done", done]);
    assert.deepEqual(lua.calls, ["GETDEL", "GET"]);
  });

  test("the code gone, no record, or no id: nil, and without an id the record is not read", () => {
    assert.equal(assertSameAsModel({}, [CODE_KEY, DONE_KEY], [RID, "300"], "nothing").reply, null);
    const bare = assertSameAsModel({ [DONE_KEY]: JSON.stringify({ subUrl: SUB, rid: RID }) }, [CODE_KEY, DONE_KEY], ["", "300"], "no id");
    assert.equal(bare.reply, null);
    assert.deepEqual(bare.calls, ["GETDEL"]);
  });

  test("a record that is not JSON, not an object or without a string subUrl: taken, 0, no record, no script error", () => {
    for (const value of ["garbage", "[]", "null", "42", JSON.stringify({ subUrl: 5 }), JSON.stringify({ userId: "tg_100" }), JSON.stringify([SUB])]) {
      const lua = assertSameAsModel({ [CODE_KEY]: value }, [CODE_KEY, DONE_KEY], [RID, "300"], value);
      assert.deepEqual(lua.reply, ["taken", value, 0], value);
      assert.deepEqual(lua.db, {}, value);
    }
  });

  test("a link with quotes, a backslash and non-ASCII survives the round trip through cjson", () => {
    const subUrl = `${SUB}?q="a\\b"&n=ü€`;
    const value = JSON.stringify({ subUrl, userId: "tg_100", deviceId: "d", createdAt: 1 });
    const lua = assertSameAsModel({ [CODE_KEY]: value }, [CODE_KEY, DONE_KEY], [RID, "300"], "escaping");
    assert.deepEqual(JSON.parse(lua.db[DONE_KEY].value), { subUrl, rid: RID });
  });

  test("a record left by an earlier redeem of the same code string is replaced, with a fresh TTL", () => {
    const old = JSON.stringify({ subUrl: "https://kovravpn.com/api/sub/old", rid: "0".repeat(64) });
    const lua = assertSameAsModel({ [CODE_KEY]: RECORD, [DONE_KEY]: old }, [CODE_KEY, DONE_KEY], [RID, "300"], "replace");
    assert.deepEqual(JSON.parse(lua.db[DONE_KEY].value), { subUrl: SUB, rid: RID });
    assert.equal(lua.db[DONE_KEY].ex, 300);
  });

  test("no cjson at all: the code is still taken and given back, with 0 and no script error", () => {
    const lua = runLua({ [CODE_KEY]: RECORD }, [CODE_KEY, DONE_KEY], [RID, "300"], { cjson: false });
    assert.deepEqual(lua.reply, ["taken", RECORD, 0]);
    assert.deepEqual(lua.db, {});
  });

  test("a SET that fails: the code is still given back, with 0 and no script error", () => {
    const lua = runLua({ [CODE_KEY]: RECORD }, [CODE_KEY, DONE_KEY], [RID, "300"], { failSet: true });
    assert.deepEqual(lua.reply, ["taken", RECORD, 0]);
    assert.deepEqual(lua.db, {});
    assert.deepEqual(lua.calls, ["GETDEL", "SET"]);
  });

  test("run twice for one request, as a client retries a lost answer: taken, then the record it left", () => {
    const first = runLua({ [CODE_KEY]: RECORD }, [CODE_KEY, DONE_KEY], [RID, "300"]);
    const left = Object.fromEntries(Object.entries(first.db).map(([k, { value }]) => [k, value]));
    const second = assertSameAsModel(left, [CODE_KEY, DONE_KEY], [RID, "300"], "retry");
    assert.equal(first.reply[0], "taken");
    assert.equal(second.reply[0], "done");
    assert.deepEqual(JSON.parse(second.reply[1]), { subUrl: SUB, rid: RID });
  });
});
