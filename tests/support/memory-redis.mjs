// tests/support/memory-redis.mjs
//
// An in-memory stand-in for the @upstash/redis calls the money and auth paths
// make: get, mget, set (nx / xx / ex / px), del, incr, incrby, expire, ttl, and
// the set commands sadd / srem / smembers / sismember / smismember. Anything
// else throws, like the default stub in load-ts.mjs, so a test cannot
// silently depend on a call this file fakes wrongly.
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
// string access to the store and runs without awaiting, so nothing runs in
// between, as with EVAL; its reply goes through the Upstash client's JSON
// parsing. tests/link-scripts-lua.test.mjs checks the twins against the real Lua.
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
/** op -> number of calls, for tests that count round trips. */
export const calls = new Map();

/** Pending injected faults: { op, key?: string | RegExp, times }. */
const faults = [];

export function reset() {
  store.clear();
  ttls.clear();
  sets.clear();
  lists.clear();
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
    ttls.delete(key);
    deadlines.delete(key);
  }
}

/** What the Upstash client does to a reply: JSON-parse what parses back unchanged. */
function upstashParse(reply) {
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
