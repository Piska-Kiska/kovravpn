// tests/support/lua-redis.mjs
//
// Runs a Redis Lua script in the local `lua` interpreter against a small
// in-process store, so a test can check the real script and not only its JS
// twin. Shims stand in for what Redis provides: `redis.call` (GET, SET, DEL,
// INCRBY, DECRBY, with GET of a missing key giving false, as in Redis; and on
// sorted sets ZADD [NX], ZREM, ZCARD, ZCOUNT, ZSCORE, ZRANGE [WITHSCORES],
// ZRANGEBYSCORE [LIMIT], ZREMRANGEBYSCORE, ordered by score then member, with
// inclusive bounds and -inf / +inf) and `cjson` (decode / encode, numbers
// encoded with %.14g like cjson's default).
// The script runs under whatever Lua is installed (Redis embeds 5.1), so the
// scripts it checks keep to what 5.1 and later share.
//
// The reply: by default every item is turned into a string (the older
// tests compare that). With `typed: true` it is converted the way Redis
// turns a Lua value into a reply, so number/string differences show: a
// string stays a string, a number becomes an integer (truncated, as Redis
// does), true becomes 1, false / nil end or become null, a table becomes a
// nested list. The Upstash client then JSON-parses what it gets; a test
// applies that step itself (memory-redis upstashParse).
//
// `luaAvailable()` tells a test to skip when there is no `lua` on PATH.

import { spawnSync } from "node:child_process";

export function luaAvailable() {
  try {
    return spawnSync("lua", ["-v"], { encoding: "utf8" }).status === 0;
  } catch {
    return false;
  }
}

const SHIM = String.raw`
local function encode_string(s)
  local escaped = string.gsub(s, '[%c"\\/]', function(c)
    local map = { ['"'] = '\\"', ['\\'] = '\\\\', ['/'] = '\\/', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
    return map[c] or string.format('\\u%04x', string.byte(c))
  end)
  return '"' .. escaped .. '"'
end

cjson = {}
-- The real cjson.null is a light userdata; any non-table value behaves the same here.
cjson.null = function() end

function cjson.decode(str)
  local pos = 1
  local function fail(msg) error('cjson shim: ' .. msg .. ' at ' .. pos, 0) end
  local function ws() pos = string.find(str, '[^ \t\r\n]', pos) or (#str + 1) end
  local ESC = { ['"'] = '"', ['\\'] = '\\', ['/'] = '/', b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }
  local function str_lit()
    local out = {}
    pos = pos + 1
    while true do
      local c = string.sub(str, pos, pos)
      if c == '' then fail('unterminated string') end
      if c == '"' then pos = pos + 1; return table.concat(out) end
      if c == '\\' then
        local e = string.sub(str, pos + 1, pos + 1)
        if ESC[e] then out[#out + 1] = ESC[e]; pos = pos + 2
        elseif e == 'u' then
          local hex = string.sub(str, pos + 2, pos + 5)
          if not string.match(hex, '^%x%x%x%x$') then fail('bad \\u escape') end
          out[#out + 1] = utf8.char(tonumber(hex, 16)); pos = pos + 6
        else fail('bad escape') end
      else
        out[#out + 1] = c; pos = pos + 1
      end
    end
  end
  local value
  value = function()
    ws()
    local c = string.sub(str, pos, pos)
    if c == '{' then
      local t = {}
      pos = pos + 1; ws()
      if string.sub(str, pos, pos) == '}' then pos = pos + 1; return t end
      while true do
        ws()
        if string.sub(str, pos, pos) ~= '"' then fail('expected a key') end
        local k = str_lit(); ws()
        if string.sub(str, pos, pos) ~= ':' then fail('expected a colon') end
        pos = pos + 1
        t[k] = value(); ws()
        local d = string.sub(str, pos, pos); pos = pos + 1
        if d == '}' then return t end
        if d ~= ',' then fail('expected , or }') end
      end
    elseif c == '[' then
      local t, n = {}, 0
      pos = pos + 1; ws()
      if string.sub(str, pos, pos) == ']' then pos = pos + 1; return t end
      while true do
        n = n + 1; t[n] = value(); ws()
        local d = string.sub(str, pos, pos); pos = pos + 1
        if d == ']' then return t end
        if d ~= ',' then fail('expected , or ]') end
      end
    elseif c == '"' then return str_lit()
    elseif string.sub(str, pos, pos + 3) == 'true' then pos = pos + 4; return true
    elseif string.sub(str, pos, pos + 4) == 'false' then pos = pos + 5; return false
    elseif string.sub(str, pos, pos + 3) == 'null' then pos = pos + 4; return cjson.null
    end
    local num = string.match(str, '^%-?%d+%.?%d*[eE]?[-+]?%d*', pos)
    if not num or not tonumber(num) then fail('unexpected character') end
    pos = pos + #num
    return tonumber(num)
  end
  local v = value(); ws()
  if pos <= #str then fail('trailing data') end
  return v
end

function cjson.encode(v)
  if v == cjson.null then return 'null' end
  local t = type(v)
  if t == 'string' then return encode_string(v) end
  if t == 'number' then return string.format('%.14g', v) end
  if t == 'boolean' then return tostring(v) end
  if t ~= 'table' then error('cjson shim: cannot encode a ' .. t, 0) end
  local count, isArray = 0, true
  for k in pairs(v) do
    count = count + 1
    if type(k) ~= 'number' then isArray = false end
  end
  if count == 0 then return '{}' end
  local parts = {}
  if isArray and count == #v then
    for i = 1, #v do parts[i] = cjson.encode(v[i]) end
    return '[' .. table.concat(parts, ',') .. ']'
  end
  for k, x in pairs(v) do parts[#parts + 1] = encode_string(tostring(k)) .. ':' .. cjson.encode(x) end
  return '{' .. table.concat(parts, ',') .. '}'
end

ZSETS = {}

local function score_bound(x)
  x = tostring(x)
  if x == '-inf' then return -math.huge end
  if x == '+inf' or x == 'inf' then return math.huge end
  local n = tonumber(x)
  if n == nil then error('ERR min or max is not a float', 0) end
  return n
end

-- Redis prints whole scores without a fraction.
local function score_text(s)
  if s == math.floor(s) and math.abs(s) < 2^53 then return string.format('%d', s) end
  return string.format('%.17g', s)
end

local function zsorted(key)
  local out = {}
  for m, sc in pairs(ZSETS[key] or {}) do out[#out + 1] = { m, sc } end
  table.sort(out, function(x, y)
    if x[2] ~= y[2] then return x[2] < y[2] end
    return x[1] < y[1]
  end)
  return out
end

local function zslice(list, start, stop)
  local n = #list
  start, stop = tonumber(start), tonumber(stop)
  if start < 0 then start = n + start end
  if stop < 0 then stop = n + stop end
  if start < 0 then start = 0 end
  if stop > n - 1 then stop = n - 1 end
  local out = {}
  for i = start, stop do out[#out + 1] = list[i + 1] end
  return out
end

local function zrem(key, member)
  local set = ZSETS[key]
  if set == nil or set[member] == nil then return 0 end
  set[member] = nil
  if next(set) == nil then ZSETS[key] = nil end
  return 1
end

redis = {}
function redis.call(cmd, ...)
  local a = { ... }
  cmd = string.upper(cmd)
  if cmd == 'ZADD' then
    local i, nx = 2, false
    if string.upper(tostring(a[2])) == 'NX' then nx, i = true, 3 end
    local set = ZSETS[a[1]] or {}
    ZSETS[a[1]] = set
    local m, sc = tostring(a[i + 1]), score_bound(a[i])
    local had = set[m] ~= nil
    if not (had and nx) then set[m] = sc end
    return had and 0 or 1
  elseif cmd == 'ZREM' then
    local n = 0
    for i = 2, #a do n = n + zrem(a[1], tostring(a[i])) end
    return n
  elseif cmd == 'ZCARD' then
    local n = 0
    for _ in pairs(ZSETS[a[1]] or {}) do n = n + 1 end
    return n
  elseif cmd == 'ZCOUNT' then
    local lo, hi = score_bound(a[2]), score_bound(a[3])
    local n = 0
    for _, sc in pairs(ZSETS[a[1]] or {}) do
      if sc >= lo and sc <= hi then n = n + 1 end
    end
    return n
  elseif cmd == 'ZSCORE' then
    local sc = (ZSETS[a[1]] or {})[tostring(a[2])]
    if sc == nil then return false end
    return score_text(sc)
  elseif cmd == 'ZRANGE' then
    if a[4] ~= nil and string.upper(tostring(a[4])) ~= 'WITHSCORES' then error('shim: ZRANGE option ' .. tostring(a[4]), 0) end
    local out = {}
    for _, e in ipairs(zslice(zsorted(a[1]), a[2], a[3])) do
      out[#out + 1] = e[1]
      if a[4] ~= nil then out[#out + 1] = score_text(e[2]) end
    end
    return out
  elseif cmd == 'ZRANGEBYSCORE' or cmd == 'ZREMRANGEBYSCORE' then
    local lo, hi = score_bound(a[2]), score_bound(a[3])
    local offset, count = 0, -1
    if a[4] ~= nil then
      if cmd ~= 'ZRANGEBYSCORE' or string.upper(tostring(a[4])) ~= 'LIMIT' then error('shim: option ' .. tostring(a[4]), 0) end
      offset, count = tonumber(a[5]), tonumber(a[6])
    end
    local hit = {}
    for _, e in ipairs(zsorted(a[1])) do
      if e[2] >= lo and e[2] <= hi then hit[#hit + 1] = e[1] end
    end
    local out = {}
    for i = offset + 1, #hit do
      if count >= 0 and #out >= count then break end
      out[#out + 1] = hit[i]
    end
    if cmd == 'ZRANGEBYSCORE' then return out end
    local n = 0
    for _, m in ipairs(out) do n = n + zrem(a[1], m) end
    return n
  elseif cmd == 'GET' then
    local v = STORE[a[1]]
    if v == nil then return false end
    return v
  elseif cmd == 'SET' then
    STORE[a[1]] = tostring(a[2])
    return 'OK'
  elseif cmd == 'DEL' then
    local had = STORE[a[1]] ~= nil
    STORE[a[1]] = nil
    return had and 1 or 0
  elseif cmd == 'INCRBY' or cmd == 'DECRBY' then
    local cur, by = STORE[a[1]] or '0', tostring(a[2])
    if not string.match(cur, '^%-?%d+$') or not string.match(by, '^%-?%d+$') then
      error('ERR value is not an integer or out of range', 0)
    end
    local sign = cmd == 'INCRBY' and 1 or -1
    local n = tonumber(cur) + sign * tonumber(by)
    STORE[a[1]] = string.format('%d', n)
    return n
  end
  error('shim: unsupported command ' .. cmd, 0)
end

-- A Lua value as Redis replies it (RESP), in JSON: string, integer, null, list.
local function encode_typed(v)
  local t = type(v)
  if t == 'string' then return encode_string(v) end
  if t == 'number' then
    local n = v >= 0 and math.floor(v) or math.ceil(v)
    return string.format('%d', n)
  end
  if t == 'boolean' then return v and '1' or 'null' end
  if t == 'table' then
    if v.err ~= nil then error('script returned an error reply: ' .. tostring(v.err), 0) end
    if v.ok ~= nil then return encode_string(tostring(v.ok)) end
    local parts = {}
    local i = 1
    while v[i] ~= nil do
      parts[i] = encode_typed(v[i])
      i = i + 1
    end
    return '[' .. table.concat(parts, ',') .. ']'
  end
  return 'null'
end

function encode_out(ok, reply, typed)
  if not ok then return '{"error":' .. encode_string(tostring(reply)) .. '}' end
  local items = {}
  if typed then
    local ok2, enc = pcall(encode_typed, reply)
    if not ok2 then return '{"error":' .. encode_string(tostring(enc)) .. '}' end
    items = nil
    reply = enc
  else
    for i = 1, #reply do items[i] = encode_string(tostring(reply[i])) end
  end
  local kv = {}
  for k, v in pairs(STORE) do kv[#kv + 1] = encode_string(k) .. ':' .. encode_string(v) end
  local zs = {}
  for k, set in pairs(ZSETS) do
    local ms = {}
    for m, sc in pairs(set) do ms[#ms + 1] = encode_string(m) .. ':' .. score_text(sc) end
    zs[#zs + 1] = encode_string(k) .. ':{' .. table.concat(ms, ',') .. '}'
  end
  local body = items and ('[' .. table.concat(items, ',') .. ']') or reply
  return '{"reply":' .. body .. ',"store":{' .. table.concat(kv, ',') .. '},"zsets":{' .. table.concat(zs, ',') .. '}}'
end
`;

/** A Lua string literal for any JS string, byte-exact (decimal escapes). */
function luaString(s) {
  let out = '"';
  for (const b of Buffer.from(String(s), "utf8")) {
    out += b >= 0x20 && b < 0x7f && b !== 0x22 && b !== 0x5c ? String.fromCharCode(b) : `\\${String(b).padStart(3, "0")}`;
  }
  return `${out}"`;
}

/**
 * Run `source` with KEYS / ARGV against `store` (a Map of key -> raw string)
 * and `zsets` (a Map of key -> Map of member -> score). Returns
 * { reply, store, zsets } where reply is the script's array of strings (with
 * `typed`, the reply as Redis would send it; see the header) and store /
 * zsets the Maps after the run. A script error throws.
 */
export function runLua(source, { store, keys, args, zsets = new Map(), typed = false }) {
  const zsetTable = [...zsets]
    .map(([k, set]) => `[${luaString(k)}] = {${[...set].map(([m, sc]) => `[${luaString(m)}] = ${Number(sc)}`).join(", ")}}`)
    .join(", ");
  const chunk = [
    SHIM,
    `STORE = {${[...store].map(([k, v]) => `[${luaString(k)}] = ${luaString(v)}`).join(", ")}}`,
    `ZSETS = {${zsetTable}}`,
    `KEYS = {${keys.map(luaString).join(", ")}}`,
    `ARGV = {${args.map(luaString).join(", ")}}`,
    `local script = assert(load(${luaString(source)}, "=script"))`,
    "local ok, reply = pcall(script)",
    `io.write(encode_out(ok, reply, ${typed ? "true" : "false"}))`,
  ].join("\n");
  const r = spawnSync("lua", ["-"], { input: chunk, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`lua failed: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  if (typeof out.error === "string") throw new Error(`lua script error: ${out.error}`);
  return {
    reply: out.reply,
    store: new Map(Object.entries(out.store)),
    zsets: new Map(Object.entries(out.zsets).map(([k, set]) => [k, new Map(Object.entries(set))])),
  };
}
