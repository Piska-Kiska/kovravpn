// tests/support/lua-redis.mjs
//
// Runs a Redis Lua script in the local `lua` interpreter against a small
// in-process store, so a test can check the real script and not only its JS
// twin. Shims stand in for what Redis provides: `redis.call` (GET, SET, DEL,
// INCRBY, DECRBY, with GET of a missing key giving false, as in Redis) and
// `cjson` (decode / encode, numbers encoded with %.14g like cjson's default).
// The script runs under whatever Lua is installed (Redis embeds 5.1), so the
// scripts it checks keep to what 5.1 and later share.
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

redis = {}
function redis.call(cmd, ...)
  local a = { ... }
  cmd = string.upper(cmd)
  if cmd == 'GET' then
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

function encode_out(ok, reply)
  if not ok then return '{"error":' .. encode_string(tostring(reply)) .. '}' end
  local items = {}
  for i = 1, #reply do items[i] = encode_string(tostring(reply[i])) end
  local kv = {}
  for k, v in pairs(STORE) do kv[#kv + 1] = encode_string(k) .. ':' .. encode_string(v) end
  return '{"reply":[' .. table.concat(items, ',') .. '],"store":{' .. table.concat(kv, ',') .. '}}'
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
 * Run `source` with KEYS / ARGV against `store` (a Map of key -> raw string).
 * Returns { reply, store } where reply is the script's array of strings and
 * store the Map after the run. A script error throws.
 */
export function runLua(source, { store, keys, args }) {
  const chunk = [
    SHIM,
    `STORE = {${[...store].map(([k, v]) => `[${luaString(k)}] = ${luaString(v)}`).join(", ")}}`,
    `KEYS = {${keys.map(luaString).join(", ")}}`,
    `ARGV = {${args.map(luaString).join(", ")}}`,
    `local script = assert(load(${luaString(source)}, "=script"))`,
    "local ok, reply = pcall(script)",
    "io.write(encode_out(ok, reply))",
  ].join("\n");
  const r = spawnSync("lua", ["-"], { input: chunk, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`lua failed: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  if (typeof out.error === "string") throw new Error(`lua script error: ${out.error}`);
  return { reply: out.reply, store: new Map(Object.entries(out.store)) };
}
