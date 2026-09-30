// tests/wallet-rules.test.mjs — run: npm test
//
// Rules of buying from the wallet added on 30.09.2026 (lib/wallet-purchase.ts,
// lib/referral-reward.ts), against the in-memory Redis:
//   • an extra device slot is sold only on top of a running plan;
//   • a purchase from the wallet rewards the referrer, once per friend.
//
// Ids, codes and tokens are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = ["333333333", "KOVRA-money-test"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { purchaseFromWallet } = await import("../src/lib/wallet-purchase.ts");
const { rewardReferrerForPurchase } = await import("../src/lib/referral-reward.ts");

const DAY = 86_400_000;
const TG = "tg_100000001";
const FRIEND = "tg_100000002";
const REFERRER = "tg_100000003";

const cents = (uid) => Number(mem.store.get(`balance_usd:${uid}`) ?? 0);
const subsOf = (uid) => JSON.parse(mem.store.get(`subs:${uid}`) ?? "[]");
const plan = (kind = "plan1", days = 20) => ({
  id: `p-${kind}-${days}`,
  kind,
  slots: kind === "plan3" ? 3 : 1,
  createdAt: Date.now() - DAY,
  expiresAt: Date.now() + days * DAY,
});
const noSideEffects = { syncExpiry: async () => {}, rewardReferrer: async () => {} };

beforeEach(() => mem.reset());

describe("an extra device slot needs a running plan", () => {
  test("without a plan: refused, nothing charged or written", async () => {
    mem.store.set(`balance_usd:${TG}`, "10000");
    const r = await purchaseFromWallet(
      { userId: TG, product: { kind: "device", term: 1 }, requestId: "req-slot-noplan", source: "bot" },
      noSideEffects,
    );
    assert.deepEqual(r, { status: "conflict", reason: "no_plan" });
    assert.equal(cents(TG), 10000);
    assert.equal(mem.store.get(`subs:${TG}`), undefined);
    assert.equal(mem.store.get(`wallet:req:${TG}:req-slot-noplan`), undefined);
  });

  test("an ended plan or a referral bonus is not a plan", async () => {
    mem.store.set(`balance_usd:${TG}`, "10000");
    mem.store.set(
      `subs:${TG}`,
      JSON.stringify([{ ...plan("plan3"), expiresAt: Date.now() - DAY }, { ...plan("plan1"), kind: "referral" }]),
    );
    const r = await purchaseFromWallet(
      { userId: TG, product: { kind: "device", term: 12 }, requestId: "req-slot-ended", source: "web" },
      noSideEffects,
    );
    assert.equal(r.status, "conflict");
    assert.equal(r.reason, "no_plan");
    assert.equal(cents(TG), 10000);
  });

  test("with a plan: sold; a replay still answers after the plan ended", async () => {
    mem.store.set(`balance_usd:${TG}`, "1000");
    mem.store.set(`subs:${TG}`, JSON.stringify([plan("plan1")]));
    const input = { userId: TG, product: { kind: "device", term: 1 }, requestId: "req-slot-ok", source: "miniapp" };
    assert.equal((await purchaseFromWallet(input, noSideEffects)).status, "ok");
    mem.store.set(`subs:${TG}`, JSON.stringify([{ ...plan("plan1"), expiresAt: Date.now() - DAY }]));
    const again = await purchaseFromWallet(input, noSideEffects);
    assert.equal(again.status, "ok");
    assert.equal(again.replayed, true);
    assert.equal(cents(TG), 500);
  });
});

describe("a purchase from the wallet rewards the referrer", () => {
  function invited(friend = FRIEND, referrer = REFERRER) {
    mem.store.set(`ref_by:${friend}`, referrer);
    mem.store.set(`ref_list:${referrer}`, JSON.stringify([{ userId: friend, registeredAt: 1, rewarded: false }]));
  }
  const quietReward = (notified) => (uid) =>
    rewardReferrerForPurchase(uid, { syncExpiry: async () => {}, notify: async (r) => notified.push(r) });

  test("the friend tops up and pays from balance twice: exactly one reward", async () => {
    invited();
    mem.store.set(`balance_usd:${FRIEND}`, "2000");
    const notified = [];
    const deps = { syncExpiry: async () => {}, rewardReferrer: quietReward(notified) };
    const buy = (rid) =>
      purchaseFromWallet({ userId: FRIEND, product: { kind: "plan1", term: 1 }, requestId: rid, source: "bot" }, deps);
    assert.equal((await buy("req-friend-1")).status, "ok");
    assert.equal((await buy("req-friend-1")).replayed, true, "a replay");
    assert.equal((await buy("req-friend-2")).status, "ok", "a renewal");
    const rewards = subsOf(REFERRER).filter((s) => s.kind === "referral");
    assert.equal(rewards.length, 1);
    assert.ok(Math.abs(rewards[0].expiresAt - (Date.now() + 14 * DAY)) < 5_000);
    assert.deepEqual(notified, [REFERRER]);
    assert.equal(JSON.parse(mem.store.get(`ref_list:${REFERRER}`))[0].rewarded, true);
  });

  test("no reward for a purchase that did not happen, or without a referrer", async () => {
    invited();
    const notified = [];
    const deps = { syncExpiry: async () => {}, rewardReferrer: quietReward(notified) };
    const short = await purchaseFromWallet(
      { userId: FRIEND, product: { kind: "plan3", term: 12 }, requestId: "req-friend-short", source: "web" },
      deps,
    );
    assert.equal(short.status, "insufficient");
    assert.equal(mem.store.get(`subs:${REFERRER}`), undefined);
    assert.equal(await rewardReferrerForPurchase("tg_100000009", { notify: async () => {}, syncExpiry: async () => {} }), null);
    assert.deepEqual(notified, []);
  });

  test("a failing reward never fails the purchase", async () => {
    mem.store.set(`balance_usd:${FRIEND}`, "1000");
    const r = await purchaseFromWallet(
      { userId: FRIEND, product: { kind: "plan1", term: 1 }, requestId: "req-friend-boom", source: "bot" },
      {
        syncExpiry: async () => {},
        rewardReferrer: async () => {
          throw new Error("boom");
        },
      },
    );
    assert.equal(r.status, "ok");
    assert.equal(cents(FRIEND), 500);
  });
});
