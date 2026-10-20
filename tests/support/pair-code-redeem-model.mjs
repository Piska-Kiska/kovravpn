// tests/support/pair-code-redeem-model.mjs
//
// The redeem script of a «Код для приложения» (src/lib/pair-code.ts
// PAIR_CODE_REDEEM_SCRIPT) as plain JavaScript, for the in-memory Redis fakes
// that cannot run Lua: tests/support/memory-redis.mjs and the fake Upstash
// endpoint of tests/pair-code-upstash.test.mjs. It runs synchronously, so a
// fake that calls it is as atomic as Redis running the script.
//
// tests/pair-code-script.test.mjs runs the Lua itself against this model, so
// the two cannot drift apart unnoticed.
//
//   KEYS  [paircode:<CODE>, paircode:done:<CODE>]
//   ARGV  [sha256 hex of the request id, or "" for none; replay TTL in seconds]
//   reply ["taken", <record>, 1|0]   the code was there and is gone now; 1
//                                    when the replay record was written
//         ["done", <replay record>]  the code was gone, a replay record is
//                                    there (only asked with an id)
//         null                       neither

/** A string every version of the script carries, so a fake can tell it from other scripts. */
export const PAIR_CODE_REDEEM_MARK = "pair-code v1.1 redeem";

/**
 * Run the script over `db`: { getdel(key), get(key), set(key, value, exSec) },
 * synchronous, values as stored strings, null for a missing key.
 */
export function runPairCodeRedeem(db, keys, args) {
  const [codeKey, doneKey] = keys;
  const [rid, ttl] = args;
  const taken = db.getdel(codeKey);
  if (taken !== null) {
    let saved = 0;
    if (rid !== "") {
      let record = null;
      try {
        record = JSON.parse(taken);
      } catch {
        record = null;
      }
      if (record !== null && typeof record === "object" && !Array.isArray(record) && typeof record.subUrl === "string") {
        db.set(doneKey, JSON.stringify({ subUrl: record.subUrl, rid }), Number(ttl));
        saved = 1;
      }
    }
    return ["taken", taken, saved];
  }
  if (rid !== "") {
    const done = db.get(doneKey);
    if (done !== null) return ["done", done];
  }
  return null;
}
