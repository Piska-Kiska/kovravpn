// tests/support/uuid-pool-twin.mjs
//
// JS twins of TAKE_LUA and MAINTAIN_LUA (src/lib/uuid-pool-body.ts) for the
// in-memory Redis, which cannot run Lua. `registerUuidPoolScripts(mem, lib)`
// registers both for the exact script sources. Each twin follows its script
// line by line through the sorted-set primitives of memory-redis zsetOps and
// never awaits, so it is as atomic as EVAL. tests/uuid-pool-lua.test.mjs runs
// the real scripts and these twins on the same cases and requires the same
// reply and the same sets.

/** TAKE_LUA: the oldest ready UUID added at or before ARGV[2] moves to taken. */
export function takeTwin(api, keys, args) {
  const [ready, taken] = keys;
  const [now, latest] = args;
  const got = api.zrangebyscore(ready, "-inf", latest, 0, 1);
  if (got.length === 0) return ["none"];
  api.zrem(ready, got[0]);
  api.zadd(taken, now, got[0]);
  return ["ok", got[0]];
}

/** MAINTAIN_LUA: rotate (keeping half mature), forget, refill, read. */
export function maintainTwin(api, keys, args) {
  const [ready, taken, spent] = keys;
  const now = args[0];
  const cap = Number(args[1]);
  const budget = Number(args[3]);
  let rotated = 0;
  const retire = (list) => {
    for (const m of list) {
      api.zrem(ready, m);
      api.zadd(spent, now, m);
      rotated += 1;
    }
  };
  const room = Math.min(budget, api.zcount(ready, "-inf", args[6]) - Number(args[7]));
  if (room > 0) retire(api.zrangebyscore(ready, "-inf", args[2], 0, room));
  const over = api.zcard(ready) - cap;
  if (over > 0 && rotated < budget) retire(api.zrange(ready, -Math.min(over, budget - rotated), -1));
  api.zremrangebyscore(taken, "-inf", args[4]);
  api.zremrangebyscore(spent, "-inf", args[5]);
  let added = 0;
  const need = cap - api.zcard(ready);
  for (const fresh of args.slice(8)) {
    if (added >= need) break;
    added += api.zadd(ready, now, fresh, { nx: true });
  }
  const out = ["pool", String(added), String(rotated)];
  for (const key of [ready, taken, spent]) {
    const all = api.zrangeWithScores(key, 0, -1);
    out.push(String(all.length / 2), ...all);
  }
  return out;
}

/** Register both twins with the in-memory Redis module `mem` for the sources in `lib`. */
export function registerUuidPoolScripts(mem, lib) {
  mem.registerScript(lib.TAKE_LUA, takeTwin);
  mem.registerScript(lib.MAINTAIN_LUA, maintainTwin);
}
