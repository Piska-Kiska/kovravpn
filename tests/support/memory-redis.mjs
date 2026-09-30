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
// Use: `setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url))`
// from load-ts.mjs before the dynamic imports, then import this file too and
// read `store` / `ttls` / `sets`, and `reset()` between tests.

/** key -> stored string. */
export const store = new Map();
/** key -> { ex?: number, px?: number } as passed to set / expire. */
export const ttls = new Map();
/** key -> Set of members. */
export const sets = new Map();
/** op -> number of calls, for tests that count round trips. */
export const calls = new Map();

/** Pending injected faults: { op, key?: string | RegExp, times }. */
const faults = [];

export function reset() {
  store.clear();
  ttls.clear();
  sets.clear();
  calls.clear();
  faults.length = 0;
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
    return "OK";
  },
  async del(...keys) {
    maybeFail("del", keys.flat().join(","));
    let removed = 0;
    for (const key of keys.flat()) {
      if (store.delete(key)) removed += 1;
      if (sets.delete(key)) removed += 1;
      ttls.delete(key);
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
    if (!store.has(key)) return 0;
    ttls.set(key, { ex: seconds, px: undefined });
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
};

export const redis = new Proxy(impl, {
  get(target, prop) {
    if (prop in target) return target[prop];
    // `then` is probed when the object passes through a promise; say "no".
    if (prop === "then") return undefined;
    throw new Error(`memory-redis: redis.${String(prop)} is not faked; add it or keep the test away from it`);
  },
});
