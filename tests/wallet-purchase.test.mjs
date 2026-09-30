// tests/wallet-purchase.test.mjs — run: npm test
//
// Buying from the prepaid USD wallet (src/lib/wallet-purchase.ts) against an
// in-memory Redis: exact cents, charge-then-grant, refund on a failed grant,
// idempotency by requestId, one purchase at a time per user, and what is left
// behind when Redis fails half-way. Races are simulated sequentially: a grant
// that re-enters the purchase for the same user while it holds the lock.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const {
  purchaseFromWallet,
  parseWalletProduct,
  productPriceCents,
  isValidRequestId,
} = await import("../src/lib/wallet-purchase.ts");
const {
  usdToCents,
  getBalanceCents,
  addBalanceCents,
  chargeBalanceCents,
  getBalanceUsd,
  addBalanceUsd,
  chargeBalanceUsd,
} = await import("../src/lib/bot-wallet.ts");

const USER = "tg_100000001";
const DAY = 86_400_000;
const BAL = `balance_usd:${USER}`;

let syncCalls = 0;
const deps = (extra = {}) => ({
  syncExpiry: async () => {
    syncCalls += 1;
  },
  ...extra,
});

function setBalance(cents) {
  mem.store.set(BAL, String(cents));
}
function subs() {
  const raw = mem.store.get(`subs:${USER}`);
  return raw ? JSON.parse(raw) : [];
}
function reqRecord(id) {
  const raw = mem.store.get(`wallet:req:${USER}:${id}`);
  return raw ? JSON.parse(raw) : undefined;
}
const buy = (product, requestId, extra = {}) =>
  purchaseFromWallet({ userId: USER, product, requestId, source: "miniapp" }, deps(extra));

beforeEach(() => {
  mem.reset();
  syncCalls = 0;
});

describe("cents helpers (bot-wallet)", () => {
  test("usdToCents is exact on every catalogue price and rejects junk", () => {
    assert.equal(usdToCents(11.99), 1199);
    assert.equal(usdToCents(53.94), 5394);
    assert.equal(usdToCents(79.08), 7908);
    assert.equal(usdToCents(22.5), 2250);
    assert.equal(usdToCents(0.1 + 0.2), 30);
    for (const bad of [0, -1, NaN, Infinity, "5", null, 1e9]) assert.equal(usdToCents(bad), null, String(bad));
  });

  test("charge refuses to go below zero and restores the balance", async () => {
    setBalance(500);
    assert.deepEqual(await chargeBalanceCents(USER, 500), { ok: true, balanceCents: 0 });
    assert.deepEqual(await chargeBalanceCents(USER, 1), { ok: false, balanceCents: 0 });
    assert.equal(await getBalanceCents(USER), 0);
  });

  test("two racing charges for one balance: exactly one wins", async () => {
    setBalance(700);
    const [a, b] = await Promise.all([chargeBalanceCents(USER, 500), chargeBalanceCents(USER, 500)]);
    assert.equal([a.ok, b.ok].filter(Boolean).length, 1);
    assert.equal(await getBalanceCents(USER), 200);
  });

  test("cents functions refuse non-integer or non-positive amounts", async () => {
    await assert.rejects(addBalanceCents(USER, 1.5), /invalid cents/);
    await assert.rejects(addBalanceCents(USER, 0), /invalid cents/);
    await assert.rejects(chargeBalanceCents(USER, -100), /invalid cents/);
    assert.equal(mem.store.has(BAL), false);
  });

  test("the dollar wrappers keep the bot's old behaviour", async () => {
    assert.equal(await getBalanceUsd(USER), 0);
    assert.equal(await addBalanceUsd(USER, 10.005), 10.01);
    assert.equal(await addBalanceUsd(USER, -3), 10.01);
    assert.equal(await chargeBalanceUsd(USER, 20), false);
    assert.equal(await chargeBalanceUsd(USER, 10.01), true);
    assert.equal(await getBalanceUsd(USER), 0);
  });

  test("a balance read back as a number (Upstash parsing) is understood", async () => {
    mem.store.set(BAL, "1234");
    assert.equal(await getBalanceCents(USER), 1234);
  });
});

describe("parseWalletProduct / productPriceCents", () => {
  test("only what we sell, with server prices in cents", () => {
    assert.deepEqual(parseWalletProduct("plan1", 1), { kind: "plan1", term: 1 });
    assert.deepEqual(parseWalletProduct("plan3", "12"), { kind: "plan3", term: 12 });
    assert.deepEqual(parseWalletProduct("device", 6), { kind: "device", term: 6 });
    for (const [k, t] of [["plan2", 1], ["plan1", 3], ["device", 0], ["plan1", "1.0"], [null, 1], ["plan1", 1.5]]) {
      assert.equal(parseWalletProduct(k, t), null, `${k}/${t}`);
    }
    assert.equal(productPriceCents({ kind: "plan1", term: 1 }), 500);
    assert.equal(productPriceCents({ kind: "plan3", term: 6 }), 5394);
    assert.equal(productPriceCents({ kind: "plan3", term: 12 }), 7908);
    assert.equal(productPriceCents({ kind: "device", term: 12 }), 6000);
  });

  test("request ids", () => {
    assert.equal(isValidRequestId("abcDEF12"), true);
    assert.equal(isValidRequestId("tgcb-4386012345678901234"), true);
    for (const bad of ["short", "x".repeat(81), "has space 123", "semi;colon12", 12345678, null]) {
      assert.equal(isValidRequestId(bad), false, String(bad));
    }
  });
});

describe("purchaseFromWallet", () => {
  test("plan purchase: charges exact cents, grants, records, syncs expiry once", async () => {
    setBalance(1000);
    const r = await buy({ kind: "plan1", term: 1 }, "req-plan1-a");
    assert.deepEqual(r, {
      status: "ok",
      product: { kind: "plan1", term: 1 },
      priceCents: 500,
      balanceCents: 500,
      replayed: false,
    });
    assert.equal(await getBalanceCents(USER), 500);
    const s = subs();
    assert.equal(s.length, 1);
    assert.equal(s[0].kind, "plan1");
    assert.equal(s[0].slots, 1);
    assert.equal(reqRecord("req-plan1-a").state, "done");
    assert.equal(syncCalls, 1);
    assert.equal(mem.store.has(`lock:wallet:${USER}`), false, "lock released");
  });

  test("the whole balance can be spent to the cent", async () => {
    setBalance(7908);
    const r = await buy({ kind: "plan3", term: 12 }, "req-plan3-12");
    assert.equal(r.status, "ok");
    assert.equal(r.balanceCents, 0);
  });

  test("insufficient: nothing written, and the same requestId works after a top-up", async () => {
    setBalance(499);
    const r = await buy({ kind: "plan1", term: 1 }, "req-short-1");
    assert.deepEqual(r, {
      status: "insufficient",
      product: { kind: "plan1", term: 1 },
      priceCents: 500,
      balanceCents: 499,
      needCents: 1,
    });
    assert.equal(await getBalanceCents(USER), 499);
    assert.equal(reqRecord("req-short-1"), undefined);
    assert.deepEqual(subs(), []);
    assert.equal(syncCalls, 0);

    await addBalanceCents(USER, 1);
    const again = await buy({ kind: "plan1", term: 1 }, "req-short-1");
    assert.equal(again.status, "ok");
    assert.equal(await getBalanceCents(USER), 0);
  });

  test("an empty wallet is insufficient with the full price needed", async () => {
    const r = await buy({ kind: "device", term: 1 }, "req-empty-1");
    assert.equal(r.status, "insufficient");
    assert.equal(r.needCents, 500);
  });

  test("a repeat of a finished request is replayed, not charged again", async () => {
    setBalance(2000);
    let grants = 0;
    const counting = { grantPlan: async () => { grants += 1; } };
    const first = await buy({ kind: "plan1", term: 1 }, "req-replay-1", counting);
    const second = await buy({ kind: "plan1", term: 1 }, "req-replay-1", counting);
    assert.equal(first.status, "ok");
    assert.deepEqual(second, { ...first, replayed: true });
    assert.equal(grants, 1);
    assert.equal(await getBalanceCents(USER), 1500);
    assert.equal(syncCalls, 1);
  });

  test("the same requestId for another product is refused", async () => {
    setBalance(2000);
    await buy({ kind: "plan1", term: 1 }, "req-reuse-1");
    const r = await buy({ kind: "device", term: 1 }, "req-reuse-1");
    assert.deepEqual(r, { status: "conflict", reason: "request_reused" });
    assert.equal(await getBalanceCents(USER), 1500);
  });

  test("two different requests are two purchases", async () => {
    setBalance(1000);
    assert.equal((await buy({ kind: "device", term: 1 }, "req-two-a")).status, "ok");
    assert.equal((await buy({ kind: "device", term: 1 }, "req-two-b")).status, "ok");
    assert.equal(await getBalanceCents(USER), 0);
    assert.equal(subs().length, 2);
  });

  test("race: a second purchase while the first holds the lock is busy and changes nothing", async () => {
    setBalance(1000);
    let inner;
    const r = await buy({ kind: "plan1", term: 1 }, "req-race-outer", {
      grantPlan: async () => {
        // The first purchase has charged and is granting: a double tap lands now.
        inner = await buy({ kind: "plan1", term: 1 }, "req-race-inner");
      },
    });
    assert.equal(r.status, "ok");
    assert.deepEqual(inner, { status: "conflict", reason: "busy" });
    assert.equal(await getBalanceCents(USER), 500);
    assert.equal(reqRecord("req-race-inner"), undefined);
  });

  test("race: the same request re-entering while claimed answers in_progress", async () => {
    setBalance(1000);
    // Lock free but the claim already exists (e.g. a crashed earlier attempt).
    mem.store.set(
      `wallet:req:${USER}:req-claimed-1`,
      JSON.stringify({ state: "pending", product: { kind: "plan1", term: 1 }, priceCents: 500, source: "web", at: 1 }),
    );
    const r = await buy({ kind: "plan1", term: 1 }, "req-claimed-1");
    assert.deepEqual(r, { status: "conflict", reason: "in_progress" });
    assert.equal(await getBalanceCents(USER), 1000);
  });

  test("a lock held elsewhere: busy, nothing read or written", async () => {
    setBalance(1000);
    mem.store.set(`lock:wallet:${USER}`, "tsomeoneelse");
    const r = await buy({ kind: "plan1", term: 1 }, "req-locked-1");
    assert.deepEqual(r, { status: "conflict", reason: "busy" });
    assert.equal(await getBalanceCents(USER), 1000);
    assert.equal(mem.store.get(`lock:wallet:${USER}`), "tsomeoneelse", "someone else's lock untouched");
  });

  test("grant failure: full refund, claim released, same requestId can retry", async () => {
    setBalance(2000);
    const r = await buy({ kind: "plan3", term: 1 }, "req-grantfail-1", {
      grantPlan: async () => {
        throw new Error("subs write failed");
      },
    });
    assert.deepEqual(r, { status: "error", reason: "grant_failed", refunded: true });
    assert.equal(await getBalanceCents(USER), 2000);
    assert.equal(reqRecord("req-grantfail-1"), undefined);
    assert.equal(syncCalls, 0);
    assert.equal(mem.store.has(`lock:wallet:${USER}`), false);

    const retry = await buy({ kind: "plan3", term: 1 }, "req-grantfail-1");
    assert.equal(retry.status, "ok");
    assert.equal(await getBalanceCents(USER), 2000 - 1199);
  });

  test("grant failure AND refund failure: evidence kept, replay says not refunded", async () => {
    setBalance(1000);
    // First incrby is the charge, second is the refund: fail the second.
    let n = 0;
    const r = await buy({ kind: "plan1", term: 1 }, "req-refundfail-1", {
      grantPlan: async () => {
        n += 1;
        mem.failNext("incrby", { key: BAL });
        throw new Error("subs write failed");
      },
    });
    assert.equal(n, 1);
    assert.deepEqual(r, { status: "error", reason: "grant_failed", refunded: false });
    assert.equal(await getBalanceCents(USER), 500, "charged, not refunded: needs a person");
    const rec = reqRecord("req-refundfail-1");
    assert.equal(rec.state, "failed");
    assert.equal(rec.priceCents, 500);
    const replay = await buy({ kind: "plan1", term: 1 }, "req-refundfail-1");
    assert.deepEqual(replay, { status: "error", reason: "grant_failed", refunded: false });
    assert.equal(await getBalanceCents(USER), 500);
  });

  test("charge call fails: internal error, claim kept as pending, balance untouched", async () => {
    setBalance(1000);
    mem.failNext("incrby", { key: BAL });
    const r = await buy({ kind: "plan1", term: 1 }, "req-chargefail-1");
    assert.deepEqual(r, { status: "error", reason: "internal" });
    assert.equal(await getBalanceCents(USER), 1000);
    assert.equal(reqRecord("req-chargefail-1").state, "pending");
    assert.deepEqual(await buy({ kind: "plan1", term: 1 }, "req-chargefail-1"), {
      status: "conflict",
      reason: "in_progress",
    });
    assert.equal(mem.store.has(`lock:wallet:${USER}`), false);
  });

  test("Redis down before the claim: internal error, no money moved", async () => {
    setBalance(1000);
    mem.failNext("get", { key: BAL });
    const r = await buy({ kind: "plan1", term: 1 }, "req-readfail-1");
    assert.deepEqual(r, { status: "error", reason: "internal" });
    assert.equal(await getBalanceCents(USER), 1000);
    assert.equal(reqRecord("req-readfail-1"), undefined);
    assert.equal(mem.store.has(`lock:wallet:${USER}`), false);
  });

  test("lock cannot be taken (Redis down): internal error", async () => {
    mem.failNext("set", { key: `lock:wallet:${USER}` });
    assert.deepEqual(await buy({ kind: "plan1", term: 1 }, "req-lockfail-1"), { status: "error", reason: "internal" });
  });

  test("while plan3 runs, plan1 is refused; plan3 renews; a device is always allowed", async () => {
    setBalance(10_000);
    assert.equal((await buy({ kind: "plan3", term: 1 }, "req-p3-first")).status, "ok");
    const until = subs().find((s) => s.kind === "plan3").expiresAt;

    const other = await buy({ kind: "plan1", term: 1 }, "req-p1-while-p3");
    assert.deepEqual(other, { status: "conflict", reason: "other_plan_active", activePlan: "plan3" });
    assert.equal(await getBalanceCents(USER), 10_000 - 1199);

    assert.equal((await buy({ kind: "plan3", term: 1 }, "req-p3-renew")).status, "ok");
    const renewed = subs().filter((s) => s.kind === "plan3");
    assert.equal(renewed.length, 1, "renewal extends, not duplicates");
    assert.ok(Math.abs(renewed[0].expiresAt - (until + 30 * DAY)) < 1000);

    assert.equal((await buy({ kind: "device", term: 1 }, "req-dev-while-p3")).status, "ok");
  });

  test("a device add-on for 6 months is ONE slot for 180 days at $30", async () => {
    setBalance(3000);
    const before = Date.now();
    const r = await buy({ kind: "device", term: 6 }, "req-dev6-1");
    assert.equal(r.status, "ok");
    assert.equal(r.priceCents, 3000);
    const s = subs();
    assert.equal(s.length, 1);
    assert.equal(s[0].kind, "device");
    assert.equal(s[0].slots, 1);
    assert.ok(Math.abs(s[0].expiresAt - (before + 180 * DAY)) < 5000);
  });

  test("invalid input: refused before any Redis call", async () => {
    setBalance(1000);
    const cases = [
      { userId: USER, product: { kind: "plan1", term: 1 }, requestId: "short" },
      { userId: USER, product: { kind: "plan9", term: 1 }, requestId: "req-valid-01" },
      { userId: USER, product: { kind: "plan1", term: 2 }, requestId: "req-valid-01" },
      { userId: USER, product: null, requestId: "req-valid-01" },
      { userId: "", product: { kind: "plan1", term: 1 }, requestId: "req-valid-01" },
      { userId: "tg 1", product: { kind: "plan1", term: 1 }, requestId: "req-valid-01" },
    ];
    mem.calls.clear();
    for (const c of cases) {
      assert.deepEqual(await purchaseFromWallet({ ...c, source: "web" }, deps()), {
        status: "error",
        reason: "invalid_request",
      });
    }
    assert.equal([...mem.calls.values()].reduce((a, b) => a + b, 0), 0);
    assert.equal(await getBalanceCents(USER), 1000);
  });

  test("expiry sync failing does not undo a paid purchase", async () => {
    setBalance(500);
    const r = await purchaseFromWallet(
      { userId: USER, product: { kind: "plan1", term: 1 }, requestId: "req-syncfail-1", source: "bot" },
      { syncExpiry: async () => { throw new Error("panel down"); } },
    );
    assert.equal(r.status, "ok");
    assert.equal(await getBalanceCents(USER), 0);
  });
});
