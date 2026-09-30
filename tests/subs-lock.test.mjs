// tests/subs-lock.test.mjs — run: npm test
//
// Subscription writes are serialized per user (lib/subscriptions.ts
// mutateSubscriptions): a purchase from the wallet and a payment-webhook
// grant for the same person that land together must both survive, and a
// lock left by a dead writer never refuses a grant. In-memory Redis with
// slow reads of subs:* to open the race window as Upstash round trips do.
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
const { addSubscription, applyDeviceAddon, applyPlanPurchase, resolvePlan, getSubscriptions } = await import(
  "../src/lib/subscriptions.ts"
);

const DAY = 86_400_000;
const TG = "tg_100000001";

const subsOf = (uid) => JSON.parse(mem.store.get(`subs:${uid}`) ?? "[]");
const noSideEffects = { syncExpiry: async () => {}, rewardReferrer: async () => {} };

/** Slow reads of subs:* like Upstash REST round trips, to open the race window. */
function slowSubsReads(ms = 20) {
  const realGet = mem.redis.get;
  mem.redis.get = async (key) => {
    const v = await realGet(key);
    if (String(key).startsWith("subs:")) await new Promise((r) => setTimeout(r, ms));
    return v;
  };
  return () => {
    mem.redis.get = realGet;
  };
}

beforeEach(() => mem.reset());

describe("subscription writes are serialized per user", () => {
  test("a wallet purchase and a webhook grant landing together are both kept", async () => {
    const restore = slowSubsReads();
    try {
      mem.store.set(`balance_usd:${TG}`, "10000");
      let webhook;
      const r = await purchaseFromWallet(
        { userId: TG, product: { kind: "plan3", term: 1 }, requestId: "req-race-plan3", source: "miniapp" },
        {
          ...noSideEffects,
          async grantPlan(userId, kind, term) {
            webhook = applyDeviceAddon(userId); // e.g. a card payment for +1 device
            await applyPlanPurchase(userId, resolvePlan(kind, term));
          },
        },
      );
      await webhook;
      assert.equal(r.status, "ok");
      assert.deepEqual(subsOf(TG).map((s) => s.kind).sort(), ["device", "plan3"]);
    } finally {
      restore();
    }
  });

  test("ten concurrent grants for one user: ten subscriptions", async () => {
    const restore = slowSubsReads(5);
    try {
      await Promise.all(Array.from({ length: 10 }, () => addSubscription(TG, "referral", 14, 1)));
      assert.equal(subsOf(TG).length, 10);
      assert.equal(mem.store.get(`lock:subs:${TG}`), undefined, "the lock is released");
    } finally {
      restore();
    }
  });

  test("a lock left by a dead writer never refuses a grant (it waits, then writes)", async () => {
    mem.store.set(`lock:subs:${TG}`, "t-dead-writer");
    const started = Date.now();
    await addSubscription(TG, "referral", 14, 1);
    assert.ok(Date.now() - started >= 2_500, "waited for the lock first");
    assert.equal(subsOf(TG).length, 1);
  });
});

describe("subscriptions stay readable", () => {
  test("getSubscriptions after a mutation", async () => {
    await addSubscription(TG, "plan1", 30, 1);
    await addSubscription(TG, "plan1", 30, 1);
    const s = await getSubscriptions(TG);
    assert.equal(s.length, 1, "a renewal extends the running plan");
    assert.ok(Math.abs(s[0].expiresAt - (Date.now() + 60 * DAY)) < 5_000);
  });
});
