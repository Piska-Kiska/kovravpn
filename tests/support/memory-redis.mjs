// tests/support/memory-redis.mjs
//
// An in-memory stand-in for the @upstash/redis calls the money and auth paths
// make: get, mget, set (nx / xx / ex / px), del, incr, incrby, expire, ttl,
// the set commands sadd / srem / smembers / sismember / smismember, zadd /
// zrem / zrange (withScores) on sorted sets, the hash commands hgetall / hset /
// hdel, and scan (MATCH with `*` globs, keys of every type in one page,
// cursor 0). Anything else throws, like the default stub in load-ts.mjs, so a
// test cannot silently depend on a call this file fakes wrongly.
//
// Values are kept the way Upstash keeps them: a string as is, anything else as
// JSON; `get` parses JSON back when it can, as the Upstash client does by
// default (so a counter written by INCRBY reads back as a number). TTLs are
// recorded, not enforced.
//
// Faults: `failNext(op, { key, times })` makes the next matching call(s) throw,
// so a test can prove what happens when Redis fails half-way through a money
// operation.
//
// Transactions: `multi()` queues the faked commands and `exec()` applies them
// back to back with nothing in between, like MULTI/EXEC. `failNext("exec")`
// fails the whole transaction before any command runs (the request never
// reached Redis); a fault on a queued command fails only that command, and the
// others still apply, because Redis does not roll back.
//
// Scripts: Node cannot run Lua, so `eval` runs a JS twin registered for the
// exact script source with `registerScript(source, twin)`. The twin gets raw
// string access to the store (and the sorted-set primitives of zsetOps) and
// runs without awaiting, so nothing runs in between, as with EVAL; its reply
// goes through the Upstash client's JSON parsing. tests/link-scripts-lua.test.mjs
// and tests/uuid-pool-lua.test.mjs check the twins against the real Lua.
//
// Interleaving: `beforeNext(op, { key, run })` awaits `run()` right before the
// next matching top-level call, so a test can slip another operation into the
// gap between two calls of the code under test.
//
// Time: TTLs are recorded against a virtual clock that only `elapse(seconds)`
// moves; keys whose TTL runs out are deleted then.
//
// Use: `setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url))`
// from load-ts.mjs before the dynamic imports, then import this file too and
// read `store` / `ttls` / `sets`, and `reset()` between tests.

/** key -> stored string. */
export const store = new Map();
/** key -> { ex?: number, px?: number } as passed to set / expire. */
export const ttls = new Map();
/** key -> Set of members. */
export const sets = new Map();
/** key -> list of strings, head first (LPUSH / LTRIM / LRANGE). */
export const lists = new Map();
/** key -> Map of member -> score (sorted sets). */
export const zsets = new Map();
/** key -> Map of field -> raw string (hashes). */
export const hashes = new Map();
/** op -> number of calls, for tests that count round trips. */
export const calls = new Map();

/** Pending injected faults: { op, key?: string | RegExp, times }. */
const faults = [];

export function reset() {
  store.clear();
  ttls.clear();
  sets.clear();
  lists.clear();
  zsets.clear();
  hashes.clear();
  calls.clear();
  faults.length = 0;
  hooks.length = 0;
  deadlines.clear();
  clock = 0;
}

/**
 * Make the next `times` calls of `op` (optionally only those touching `key`,
 * an exact string or a RegExp) throw an Error, as a network failure would.
 */
export function failNext(op, { key, times = 1 } = {}) {
  faults.push({ op, key, times });
}

function maybeFail(op, key) {
  calls.set(op, (calls.get(op) ?? 0) + 1);
  const i = faults.findIndex(
    (f) =>
      f.op === op &&
      (f.key === undefined || (f.key instanceof RegExp ? f.key.test(String(key)) : f.key === String(key))),
  );
  if (i < 0) return;
  const f = faults[i];
  f.times -= 1;
  if (f.times <= 0) faults.splice(i, 1);
  throw new Error(`memory-redis: injected ${op} failure on ${String(key)}`);
}

/** Lua source -> JS twin (see the header). */
const scripts = new Map();

/** Run `twin(api, keys, args)` whenever `eval` is called with `source`. */
export function registerScript(source, twin) {
  scripts.set(source, twin);
}

/** Pending interleavings: { op, key?: string | RegExp, run }. */
const hooks = [];

/** Await `run()` right before the next top-level `op` call touching `key`. */
export function beforeNext(op, { key, run }) {
  hooks.push({ op, key, run });
}

async function runHooks(op, key) {
  const i = hooks.findIndex(
    (h) =>
      h.op === op &&
      (h.key === undefined || (h.key instanceof RegExp ? h.key.test(String(key)) : h.key === String(key))),
  );
  if (i < 0) return;
  const [h] = hooks.splice(i, 1);
  await h.run();
}

/** Virtual time in seconds and key -> second its TTL runs out. */
let clock = 0;
const deadlines = new Map();

function setDeadline(key, opts) {
  if (opts.ex !== undefined) deadlines.set(key, clock + opts.ex);
  else if (opts.px !== undefined) deadlines.set(key, clock + opts.px / 1000);
  else deadlines.delete(key);
}

/** Move the virtual clock and delete every key whose TTL ran out. */
export function elapse(seconds) {
  clock += seconds;
  for (const [key, at] of [...deadlines]) {
    if (at > clock) continue;
    store.delete(key);
    sets.delete(key);
    zsets.delete(key);
    hashes.delete(key);
    ttls.delete(key);
    deadlines.delete(key);
  }
}

/** A score bound as Redis takes it: "-inf", "+inf" or a number (inclusive only). */
function bound(raw) {
  const text = String(raw);
  if (text === "-inf") return -Infinity;
  if (text === "+inf" || text === "inf") return Infinity;
  const n = Number(text);
  if (text.trim() === "" || Number.isNaN(n)) throw new Error(`memory-redis: bad score bound ${text}`);
  return n;
}

/** A score as Redis prints it in a reply (the scores here are whole ms). */
function scoreText(score) {
  return String(score);
}

/**
 * The sorted-set commands a script can call, over `zsets` (key -> Map of
 * member -> score), with Redis's order: score, then member. Synchronous, so
 * a twin that uses them stays as atomic as EVAL. Exported for tests that run
 * a twin against their own map.
 */
export function zsetOps(zsets) {
  const sorted = (key) =>
    [...(zsets.get(key) ?? new Map())].sort(([ma, sa], [mb, sb]) => sa - sb || (ma < mb ? -1 : ma > mb ? 1 : 0));
  const slice = (list, start, stop) => {
    const n = list.length;
    let from = Number(start) < 0 ? n + Number(start) : Number(start);
    let to = Number(stop) < 0 ? n + Number(stop) : Number(stop);
    from = Math.max(0, from);
    to = Math.min(n - 1, to);
    return from > to ? [] : list.slice(from, to + 1);
  };
  const ops = {
    zadd(key, score, member, { nx = false } = {}) {
      const set = zsets.get(key) ?? new Map();
      const m = String(member);
      const had = set.has(m);
      if (!(had && nx)) set.set(m, bound(score));
      zsets.set(key, set);
      return had ? 0 : 1;
    },
    zrem(key, ...members) {
      const set = zsets.get(key);
      if (!set) return 0;
      let removed = 0;
      for (const m of members.flat()) if (set.delete(String(m))) removed += 1;
      if (set.size === 0) zsets.delete(key);
      return removed;
    },
    zcard(key) {
      return zsets.get(key)?.size ?? 0;
    },
    zcount(key, min, max) {
      const lo = bound(min);
      const hi = bound(max);
      return sorted(key).filter(([, s]) => s >= lo && s <= hi).length;
    },
    zscore(key, member) {
      const set = zsets.get(key);
      return set?.has(String(member)) ? scoreText(set.get(String(member))) : null;
    },
    /** Members by rank; negative ranks count from the end. */
    zrange(key, start, stop) {
      return slice(sorted(key), start, stop).map(([m]) => m);
    },
    /** [member, score, member, score, ...] by rank, scores as Redis prints them. */
    zrangeWithScores(key, start, stop) {
      return slice(sorted(key), start, stop).flatMap(([m, s]) => [m, scoreText(s)]);
    },
    zrangebyscore(key, min, max, offset = 0, count = -1) {
      const lo = bound(min);
      const hi = bound(max);
      const hit = sorted(key)
        .filter(([, s]) => s >= lo && s <= hi)
        .map(([m]) => m);
      const rest = hit.slice(Number(offset));
      return Number(count) < 0 ? rest : rest.slice(0, Number(count));
    },
    zremrangebyscore(key, min, max) {
      const drop = ops.zrangebyscore(key, min, max);
      return ops.zrem(key, ...drop);
    },
  };
  return ops;
}

/** `*` globs of SCAN MATCH as a RegExp (no `?`, `[...]` or escapes: none are used). */
function globRegExp(pattern) {
  return new RegExp(`^${String(pattern).split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
}

/** What the Upstash client does to a reply: JSON-parse what parses back unchanged. */
export function upstashParse(reply) {
  if (Array.isArray(reply)) return reply.map(upstashParse);
  if (typeof reply !== "string") return reply;
  try {
    const parsed = JSON.parse(reply);
    return typeof parsed === "number" && parsed.toString() !== reply ? reply : parsed;
  } catch {
    return reply;
  }
}

function serialize(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function deserialize(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function toInt(raw, key) {
  if (raw === undefined) return 0;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`memory-redis: value at ${key} is not an integer`);
  return n;
}

const impl = {
  async eval(script, keys, args = []) {
    maybeFail("eval", keys.join(","));
    const twin = scripts.get(script);
    if (!twin) throw new Error("memory-redis: eval of a script with no registered twin; see registerScript()");
    // Raw access, as a script sees Redis: strings in, strings out, no awaits.
    const api = {
      get: (key) => (store.has(key) ? store.get(key) : null),
      set: (key, value) => {
        store.set(key, String(value));
        ttls.delete(key);
        deadlines.delete(key);
      },
      del: (key) => {
        const had = store.delete(key);
        ttls.delete(key);
        deadlines.delete(key);
        return had ? 1 : 0;
      },
      incrby: (key, by) => {
        const next = toInt(store.get(key), key) + by;
        store.set(key, String(next));
        return next;
      },
      ...zsetOps(zsets),
    };
    return upstashParse(twin(api, keys.map(String), args.map(String)));
  },
  async get(key) {
    maybeFail("get", key);
    return store.has(key) ? deserialize(store.get(key)) : null;
  },
  async mget(...keys) {
    maybeFail("mget", keys.flat().join(","));
    return keys.flat().map((key) => (store.has(key) ? deserialize(store.get(key)) : null));
  },
  async set(key, value, opts = {}) {
    maybeFail("set", key);
    if (opts.nx && store.has(key)) return null;
    if (opts.xx && !store.has(key)) return null;
    store.set(key, serialize(value));
    if (opts.ex !== undefined || opts.px !== undefined) ttls.set(key, { ex: opts.ex, px: opts.px });
    else ttls.delete(key);
    setDeadline(key, opts);
    return "OK";
  },
  async del(...keys) {
    maybeFail("del", keys.flat().join(","));
    let removed = 0;
    for (const key of keys.flat()) {
      if (store.delete(key)) removed += 1;
      if (sets.delete(key)) removed += 1;
      if (zsets.delete(key)) removed += 1;
      if (hashes.delete(key)) removed += 1;
      ttls.delete(key);
      deadlines.delete(key);
    }
    return removed;
  },
  async incr(key) {
    maybeFail("incr", key);
    const next = toInt(store.get(key), key) + 1;
    store.set(key, String(next));
    return next;
  },
  async incrby(key, by) {
    maybeFail("incrby", key);
    if (!Number.isInteger(by)) throw new Error(`memory-redis: incrby needs an integer, got ${by}`);
    const next = toInt(store.get(key), key) + by;
    store.set(key, String(next));
    return next;
  },
  async expire(key, seconds) {
    maybeFail("expire", key);
    if (!store.has(key) && !sets.has(key)) return 0;
    ttls.set(key, { ex: seconds, px: undefined });
    setDeadline(key, { ex: seconds });
    return 1;
  },
  async ttl(key) {
    maybeFail("ttl", key);
    if (!store.has(key)) return -2;
    const t = ttls.get(key);
    return t?.ex ?? (t?.px !== undefined ? Math.ceil(t.px / 1000) : -1);
  },
  async sadd(key, ...members) {
    maybeFail("sadd", key);
    const set = sets.get(key) ?? new Set();
    const before = set.size;
    for (const m of members.flat()) set.add(String(m));
    sets.set(key, set);
    return set.size - before;
  },
  async srem(key, ...members) {
    maybeFail("srem", key);
    const set = sets.get(key);
    if (!set) return 0;
    let removed = 0;
    for (const m of members.flat()) if (set.delete(String(m))) removed += 1;
    return removed;
  },
  async smembers(key) {
    maybeFail("smembers", key);
    return [...(sets.get(key) ?? [])];
  },
  async sismember(key, member) {
    maybeFail("sismember", key);
    return sets.get(key)?.has(String(member)) ? 1 : 0;
  },
  async smismember(key, members) {
    maybeFail("smismember", key);
    const set = sets.get(key);
    return members.map((m) => (set?.has(String(m)) ? 1 : 0));
  },
  /** The Upstash signature: zadd(key, [opts,] { score, member }, ...). */
  async zadd(key, first, ...rest) {
    maybeFail("zadd", key);
    const withOpts = first && typeof first === "object" && !("score" in first);
    const opts = withOpts ? first : {};
    const items = withOpts ? rest : [first, ...rest];
    const ops = zsetOps(zsets);
    let added = 0;
    for (const { score, member } of items) added += ops.zadd(key, score, member, { nx: opts.nx === true });
    return added;
  },
  async zrem(key, ...members) {
    maybeFail("zrem", key);
    return zsetOps(zsets).zrem(key, ...members);
  },
  /** By rank only; `{ withScores: true }` gives [member, score, ...] as the Upstash client parses it. */
  async zrange(key, start, stop, opts = {}) {
    maybeFail("zrange", key);
    if (opts.byScore || opts.byLex || opts.rev || opts.count !== undefined) {
      throw new Error("memory-redis: zrange options other than withScores are not faked");
    }
    const ops = zsetOps(zsets);
    return upstashParse(opts.withScores ? ops.zrangeWithScores(key, start, stop) : ops.zrange(key, start, stop));
  },
  /** Null for a missing hash, else field -> value parsed as the Upstash client does. */
  async hgetall(key) {
    maybeFail("hgetall", key);
    const hash = hashes.get(key);
    if (!hash || hash.size === 0) return null;
    const out = {};
    for (const [field, raw] of hash) {
      const n = Number(raw);
      if (!Number.isNaN(n) && !Number.isSafeInteger(n)) out[field] = raw;
      else out[field] = deserialize(raw);
    }
    return out;
  },
  async hset(key, fields) {
    maybeFail("hset", key);
    const hash = hashes.get(key) ?? new Map();
    let added = 0;
    for (const [field, value] of Object.entries(fields)) {
      if (!hash.has(field)) added += 1;
      hash.set(field, serialize(value));
    }
    hashes.set(key, hash);
    return added;
  },
  async hdel(key, ...fields) {
    maybeFail("hdel", key);
    const hash = hashes.get(key);
    if (!hash) return 0;
    let removed = 0;
    for (const f of fields.flat()) if (hash.delete(String(f))) removed += 1;
    if (hash.size === 0) hashes.delete(key);
    return removed;
  },
  async lpush(key, ...values) {
    maybeFail("lpush", key);
    const list = lists.get(key) ?? [];
    for (const v of values.flat()) list.unshift(String(v));
    lists.set(key, list);
    return list.length;
  },
  async ltrim(key, start, stop) {
    maybeFail("ltrim", key);
    const list = lists.get(key) ?? [];
    const end = stop < 0 ? list.length + stop : stop;
    lists.set(key, list.slice(start, end + 1));
    return "OK";
  },
  async lrange(key, start, stop) {
    maybeFail("lrange", key);
    const list = lists.get(key) ?? [];
    const end = stop < 0 ? list.length + stop : stop;
    return list.slice(start, end + 1);
  },
  async scan(cursor, opts = {}) {
    const match = typeof opts.match === "string" ? opts.match : "*";
    maybeFail("scan", match);
    if (String(cursor) !== "0") throw new Error(`memory-redis: scan answers in one page, cursor ${cursor} is not one it gave`);
    const re = globRegExp(match);
    const keys = new Set([...store.keys(), ...sets.keys(), ...lists.keys(), ...zsets.keys(), ...hashes.keys()]);
    return ["0", [...keys].filter((k) => re.test(k)).sort()];
  },
  multi() {
    const queue = [];
    const tx = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "exec") {
            return async () => {
              maybeFail("exec", queue.map(([, args]) => String(args[0])).join(","));
              // Every command starts before any settles: the bodies above never
              // await, so each one completes on the spot and nothing can run in
              // between, as inside MULTI/EXEC.
              return Promise.all(queue.map(([op, args]) => impl[op](...args)));
            };
          }
          if (prop === "then") return undefined;
          if (typeof prop === "string" && prop !== "multi" && prop in impl) {
            return (...args) => {
              queue.push([prop, args]);
              return tx;
            };
          }
          throw new Error(`memory-redis: multi().${String(prop)} is not faked`);
        },
      },
    );
    return tx;
  },
};

/** One stable wrapper per command, so a test can save one and put it back. */
const wrappers = new Map();
/** Commands a test replaced with `redis.get = ...`; the wrapper put back removes the entry. */
const patched = new Map();

function wrapper(prop) {
  if (!wrappers.has(prop)) {
    // Top-level calls only: commands queued in multi() never wait on a hook.
    wrappers.set(prop, async (...args) => {
      const key = prop === "eval" ? (args[1] ?? []).join(",") : Array.isArray(args[0]) ? args[0].join(",") : args[0];
      await runHooks(prop, key);
      return impl[prop](...args);
    });
  }
  return wrappers.get(prop);
}

export const redis = new Proxy(impl, {
  set(_target, prop, value) {
    if (value === wrappers.get(prop)) patched.delete(prop);
    else patched.set(prop, value);
    return true;
  },
  get(target, prop) {
    if (patched.has(prop)) return patched.get(prop);
    if (prop in target) return prop === "multi" ? target[prop] : wrapper(prop);
    // `then` is probed when the object passes through a promise; say "no".
    if (prop === "then") return undefined;
    throw new Error(`memory-redis: redis.${String(prop)} is not faked; add it or keep the test away from it`);
  },
});
