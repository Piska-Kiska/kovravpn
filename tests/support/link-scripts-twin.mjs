// tests/support/link-scripts-twin.mjs
//
// JS twins of READ_RAW_LUA and MOVE_MONEY_LUA (src/lib/tg-link-merge.ts) for
// the in-memory Redis, which cannot run Lua. `registerLinkScripts(mem, lib)`
// registers both for the exact script sources. Each twin follows its script
// line by line, on raw strings, and never awaits, so it is as atomic as EVAL.
// tests/link-scripts-lua.test.mjs runs the real scripts and these twins on
// the same cases and requires the same reply and the same store.

/** READ_RAW_LUA: "v<raw>" or "n" per key. */
export function readRawTwin(api, keys) {
  return keys.map((k) => {
    const v = api.get(k);
    return v === null ? "n" : `v${v}`;
  });
}

function state(api, key) {
  const v = api.get(key);
  return v === null ? "n" : `v${v}`;
}

function wallet(api, key, allowNegative) {
  const v = api.get(key);
  if (v === null) return "0";
  if (v === "0") return v;
  const m = allowNegative ? /^-?([1-9]\d*)$/.exec(v) : /^([1-9]\d*)$/.exec(v);
  return m && m[1].length <= 15 ? v : null;
}

/** MOVE_MONEY_LUA: compare-and-set of both lists, then the wallet and list writes. */
export function moveMoneyTwin(api, keys, args) {
  const [walletFrom, walletTo, subsFrom, subsTo] = keys;
  const [expectFrom, expectTo, nextTo, dropFrom] = args;
  if (state(api, subsFrom) !== expectFrom || state(api, subsTo) !== expectTo) return ["conflict"];
  const cents = wallet(api, walletFrom, false);
  if (cents === null) return ["bad_wallet_from"];
  if (wallet(api, walletTo, true) === null) return ["bad_wallet_to"];
  if (cents !== "0") {
    api.incrby(walletFrom, -Number(cents));
    api.incrby(walletTo, Number(cents));
  }
  if (nextTo !== "") api.set(subsTo, nextTo);
  if (dropFrom === "1") api.del(subsFrom);
  return ["ok", cents];
}

/** Register both twins with the in-memory Redis module `mem` for the sources in `lib`. */
export function registerLinkScripts(mem, lib) {
  mem.registerScript(lib.READ_RAW_LUA, readRawTwin);
  mem.registerScript(lib.MOVE_MONEY_LUA, moveMoneyTwin);
}
