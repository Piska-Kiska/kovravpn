// tests/link-scripts-lua.test.mjs — run: npm test
//
// READ_RAW_LUA and MOVE_MONEY_LUA (src/lib/tg-link-merge.ts) are the whole
// wallet and subscription move of a Telegram link, run by Redis as scripts
// (KM-02). Every case runs twice: the real script in the local `lua`
// interpreter with a redis.call shim (tests/support/lua-redis.mjs; skipped
// when there is no `lua` on PATH), and the JS twin the in-memory Redis uses
// (tests/support/link-scripts-twin.mjs). Both must give the expected reply
// and the expected store, so the link tests that use the twins test the
// scripts. Ids are made up.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";
import { luaAvailable, runLua } from "./support/lua-redis.mjs";
import { moveMoneyTwin, readRawTwin } from "./support/link-scripts-twin.mjs";

const { READ_RAW_LUA, MOVE_MONEY_LUA, parseMoveReply, planSubsMove, parseSubsRaw, parseWalletCents } = await import(
  "../src/lib/tg-link-merge.ts"
);

const NOW = 1_790_000_000_000;
const DAY = 86_400_000;
const FROM = "tg_100000001";
const TO = "em_buyer@kovra.test";
const KEYS = [`balance_usd:${FROM}`, `balance_usd:${TO}`, `subs:${FROM}`, `subs:${TO}`];
const [W_FROM, W_TO, S_FROM, S_TO] = KEYS;

const sub = (id, kind, days) => ({
  id,
  kind,
  slots: kind === "plan3" ? 3 : 1,
  createdAt: NOW - DAY,
  expiresAt: NOW + days * DAY,
});
const PLAN = sub("aaaa000000000001", "plan3", 25);
const OLD = sub("aaaa000000000002", "device", -40);
const THEIRS = sub("bbbb000000000001", "plan1", 10);

function runTwin(twin, store, keys, args) {
  const s = new Map(store);
  const api = {
    get: (k) => (s.has(k) ? s.get(k) : null),
    set: (k, v) => void s.set(k, String(v)),
    del: (k) => (s.delete(k) ? 1 : 0),
    incrby: (k, by) => {
      const next = Number(s.get(k) ?? "0") + by;
      s.set(k, String(next));
      return next;
    },
  };
  return { reply: twin(api, keys, args), store: s };
}

const state = (raw) => (raw === undefined ? "n" : `v${raw}`);

/** The move args the app builds for `store` (as tg-link-merge.ts does). */
function argsFor(store) {
  const plan = planSubsMove(parseSubsRaw(store.get(S_FROM) ?? null), parseSubsRaw(store.get(S_TO) ?? null), NOW);
  return [state(store.get(S_FROM)), state(store.get(S_TO)), plan.nextTo, plan.live > 0 ? "1" : "0"];
}

const cases = [
  {
    name: "wallet and the live subscriptions move; the expired one stays behind",
    store: { [W_FROM]: "801", [S_FROM]: JSON.stringify([PLAN, OLD]) },
    reply: ["ok", "801"],
    after: { [W_FROM]: "0", [W_TO]: "801", [S_TO]: JSON.stringify([PLAN]) },
  },
  {
    name: "added after what the primary has, its own list kept as it was",
    store: { [W_FROM]: "1500", [W_TO]: "250", [S_FROM]: JSON.stringify([PLAN]), [S_TO]: JSON.stringify([THEIRS]) },
    reply: ["ok", "1500"],
    after: { [W_FROM]: "0", [W_TO]: "1750", [S_TO]: JSON.stringify([THEIRS, PLAN]) },
  },
  {
    name: "a second run after a lost reply adds nothing twice",
    store: { [W_FROM]: "0", [W_TO]: "801", [S_TO]: JSON.stringify([PLAN]) },
    reply: ["ok", "0"],
    after: { [W_FROM]: "0", [W_TO]: "801", [S_TO]: JSON.stringify([PLAN]) },
  },
  {
    name: "a subscription the primary already has (same id) is not added again",
    store: { [S_FROM]: JSON.stringify([PLAN]), [S_TO]: JSON.stringify([PLAN]) },
    reply: ["ok", "0"],
    after: { [S_TO]: JSON.stringify([PLAN]) },
  },
  {
    name: "a negative primary wallet (a charge rolling back) still receives",
    store: { [W_FROM]: "300", [W_TO]: "-200" },
    reply: ["ok", "300"],
    after: { [W_FROM]: "0", [W_TO]: "100" },
  },
  {
    name: "a wallet that is not whole cents: refused, nothing written",
    store: { [W_FROM]: "12.5", [S_FROM]: JSON.stringify([PLAN]) },
    reply: ["bad_wallet_from"],
    after: { [W_FROM]: "12.5", [S_FROM]: JSON.stringify([PLAN]) },
  },
  {
    name: "a negative source wallet: refused",
    store: { [W_FROM]: "-5" },
    reply: ["bad_wallet_from"],
    after: { [W_FROM]: "-5" },
  },
  {
    name: "a primary wallet that is not a number: refused",
    store: { [W_FROM]: "100", [W_TO]: "abc" },
    reply: ["bad_wallet_to"],
    after: { [W_FROM]: "100", [W_TO]: "abc" },
  },
];

function expectedStore(c) {
  const out = new Map(Object.entries(c.store));
  for (const [k, v] of Object.entries(c.after)) out.set(k, v);
  if (c.reply[0] === "ok" && argsFor(new Map(Object.entries(c.store)))[3] === "1") out.delete(S_FROM);
  return Object.fromEntries([...out].sort(([a], [b]) => a.localeCompare(b)));
}
const sorted = (m) => Object.fromEntries([...m].sort(([a], [b]) => a.localeCompare(b)));

describe("MOVE_MONEY_LUA and its twin", () => {
  for (const c of cases) {
    const store = new Map(Object.entries(c.store));
    const args = argsFor(store);

    test(`twin: ${c.name}`, () => {
      const r = runTwin(moveMoneyTwin, store, KEYS, args);
      assert.deepEqual(r.reply, c.reply);
      assert.deepEqual(sorted(r.store), expectedStore(c));
    });

    test(`lua: ${c.name}`, { skip: !luaAvailable() && "no lua on PATH" }, () => {
      const r = runLua(MOVE_MONEY_LUA, { store, keys: KEYS, args });
      assert.deepEqual(r.reply, c.reply);
      assert.deepEqual(sorted(r.store), expectedStore(c));
    });
  }

  const changed = {
    name: "a list changed since it was read: conflict, nothing written",
    store: new Map([
      [W_FROM, "801"],
      [S_FROM, JSON.stringify([PLAN])],
      [S_TO, JSON.stringify([THEIRS])],
    ]),
    // What the app read before a grant slipped THEIRS into the primary's list.
    args: [`v${JSON.stringify([PLAN])}`, "n", JSON.stringify([PLAN]), "1"],
  };
  test(`twin: ${changed.name}`, () => {
    const r = runTwin(moveMoneyTwin, changed.store, KEYS, changed.args);
    assert.deepEqual(r.reply, ["conflict"]);
    assert.deepEqual(sorted(r.store), sorted(changed.store));
  });
  test(`lua: ${changed.name}`, { skip: !luaAvailable() && "no lua on PATH" }, () => {
    const r = runLua(MOVE_MONEY_LUA, { store: changed.store, keys: KEYS, args: changed.args });
    assert.deepEqual(r.reply, ["conflict"]);
    assert.deepEqual(sorted(r.store), sorted(changed.store));
  });
});

describe("READ_RAW_LUA and its twin", () => {
  const store = new Map([
    [W_FROM, "801"],
    [S_FROM, JSON.stringify([PLAN])],
  ]);
  const expected = ["v801", "n", `v${JSON.stringify([PLAN])}`, "n"];

  test("twin: raw values with a prefix, n for a missing key", () => {
    assert.deepEqual(runTwin(readRawTwin, store, KEYS, []).reply, expected);
  });
  test("lua: raw values with a prefix, n for a missing key", { skip: !luaAvailable() && "no lua on PATH" }, () => {
    const r = runLua(READ_RAW_LUA, { store, keys: KEYS, args: [] });
    assert.deepEqual(r.reply, expected);
    assert.deepEqual(sorted(r.store), sorted(store), "reads write nothing");
  });
});

describe("parsing", () => {
  test("parseMoveReply takes the Upstash-parsed number and the raw string", () => {
    assert.deepEqual(parseMoveReply(["ok", 801]), { kind: "ok", cents: 801 });
    assert.deepEqual(parseMoveReply(["ok", "801"]), { kind: "ok", cents: 801 });
    assert.deepEqual(parseMoveReply(["conflict"]), { kind: "conflict" });
    assert.deepEqual(parseMoveReply(["bad_wallet_to"]), { kind: "bad_wallet", side: "to" });
    for (const bad of [null, [], ["ok"], ["ok", -1], ["ok", "1.5"], ["what"], "ok"]) {
      assert.throws(() => parseMoveReply(bad), /unexpected script reply/);
    }
  });

  test("parseWalletCents reads exactly what the script accepts", () => {
    assert.equal(parseWalletCents(null), 0);
    assert.equal(parseWalletCents("0"), 0);
    assert.equal(parseWalletCents("801"), 801);
    assert.equal(parseWalletCents("-5", true), -5);
    for (const bad of ["-5", "007", "1.5", "", " 1", "1e3", "1234567890123456"]) {
      assert.equal(parseWalletCents(bad), null, bad);
    }
  });

  test("parseSubsRaw refuses anything that is not a list of subscriptions", () => {
    assert.deepEqual(parseSubsRaw(null), []);
    assert.deepEqual(parseSubsRaw(JSON.stringify([PLAN])), [PLAN]);
    for (const bad of ["{", "{}", "[1]", JSON.stringify([{ ...PLAN, id: "" }]), JSON.stringify([{ ...PLAN, slots: 1.5 }])]) {
      assert.equal(parseSubsRaw(bad), null, bad);
    }
  });
});
