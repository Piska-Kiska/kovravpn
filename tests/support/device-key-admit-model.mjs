// tests/support/device-key-admit-model.mjs
//
// The script that admits a device key to a link's ledger
// (src/lib/watafast-device-keys.ts ADMIT_DEVICE_KEY_SCRIPT) as plain
// JavaScript, for the in-memory Redis fake that cannot run Lua
// (tests/support/memory-redis.mjs). It runs synchronously, so a fake that
// calls it is as atomic as Redis running the script.
//
// tests/watafast-device-keys.test.mjs runs the Lua itself against this model,
// so the two cannot drift apart unnoticed.
//
//   KEYS  [wfk:<token>]
//   ARGV  [member, now ms, forget-up-to ms, ledger TTL ms, keys a link may hold]
//   reply 0  the ledger is full and the member is not in it: nothing written
//         1  the member was there: its score is now `now`
//         2  the member was added

/** A string every version of the script carries, so a fake can tell it from other scripts. */
export const DEVICE_KEY_ADMIT_MARK = "watafast: admit a device key v1";

/**
 * Run the script over `zsets`: Map of key -> array of { score, member } in
 * ascending order. `setTtlMs(key, ms)` is told the ledger's TTL when the
 * script writes. Arguments as the strings Redis is sent.
 */
export function runDeviceKeyAdmit(zsets, setTtlMs, keys, args) {
  const [key] = keys;
  const [member, now, forgetUpTo, ttlMs, max] = args;

  // ZREMRANGEBYSCORE key 0 forgetUpTo: both ends are part of the range.
  const set = (zsets.get(key) ?? []).filter((e) => e.score < 0 || e.score > Number(forgetUpTo));
  if (set.length > 0) zsets.set(key, set);
  else zsets.delete(key); // Redis keeps no empty sorted set

  const at = set.findIndex((e) => e.member === member);
  if (at < 0 && set.length >= Number(max)) return 0;

  if (at >= 0) set.splice(at, 1);
  set.push({ score: Number(now), member });
  set.sort((a, b) => a.score - b.score || (a.member < b.member ? -1 : a.member > b.member ? 1 : 0));
  zsets.set(key, set);
  setTtlMs(key, Number(ttlMs));
  return at >= 0 ? 1 : 2;
}
