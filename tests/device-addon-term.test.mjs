// tests/device-addon-term.test.mjs — run: npm test
//
// KM-01 / KP-01: the bot sold "+1 device" for 6 and 12 months ($30 / $60) but
// applied the 30-day add-on `term` times, so the buyer got `term` slots that
// all ended after 30 days. A multi-month add-on must be ONE slot for
// term × 30 days. Main fixed it with applyDeviceAddonTerm; these tests hold
// it there, directly and through purchaseFromWallet (the path the bot, the
// Mini App and the cabinet use). Ported from fix/kovra-money-hotfix.
// Ids are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = ["333333333", "KOVRA-money-test"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { applyDeviceAddonTerm, summarize, DEVICE_ADDON_DAYS } = await import("../src/lib/subscriptions.ts");
const { purchaseFromWallet } = await import("../src/lib/wallet-purchase.ts");

const DAY = 86_400_000;
const USER = "tg_100000001";

const subsOf = (userId) => JSON.parse(mem.store.get(`subs:${userId}`) ?? "[]");
/** Whole days from `from` to `until`, rounded (tolerates the ms the call takes). */
const daysBetween = (from, until) => Math.round((until - from) / DAY);

beforeEach(() => mem.reset());

describe("applyDeviceAddonTerm", () => {
  for (const term of [1, 6, 12]) {
    test(`term ${term}: one slot for ${term * 30} days`, async () => {
      const before = Date.now();
      await applyDeviceAddonTerm(USER, term);
      const subs = subsOf(USER);
      assert.equal(subs.length, 1);
      assert.equal(subs[0].kind, "device");
      assert.equal(subs[0].slots, 1);
      assert.equal(daysBetween(before, subs[0].expiresAt), term * DEVICE_ADDON_DAYS);
      assert.equal(summarize(subs).activeSlots, 1);
    });
  }

  test("a second add-on is a second, independent slot", async () => {
    await applyDeviceAddonTerm(USER, 12);
    await applyDeviceAddonTerm(USER, 1);
    const subs = subsOf(USER);
    assert.equal(subs.length, 2);
    assert.equal(summarize(subs).activeSlots, 2);
  });

  for (const bad of [0, 2, 3, 24, -1, 1.5, Number.NaN]) {
    test(`term ${bad} is refused and writes nothing`, async () => {
      await assert.rejects(() => applyDeviceAddonTerm(USER, bad), /invalid device add-on term/);
      assert.equal(mem.store.has(`subs:${USER}`), false);
    });
  }
});

describe("purchaseFromWallet: a device for 6 / 12 months", () => {
  const noSideEffects = { syncExpiry: async () => {}, rewardReferrer: async () => {} };
  const runningPlan = () => ({
    id: "p-plan1",
    kind: "plan1",
    slots: 1,
    createdAt: Date.now() - DAY,
    expiresAt: Date.now() + 20 * DAY,
  });

  for (const [term, priceCents] of [
    [6, 3000],
    [12, 6000],
  ]) {
    test(`${term} months for $${priceCents / 100}: one slot for ${term * 30} days, charged once`, async () => {
      mem.store.set(`balance_usd:${USER}`, String(priceCents));
      mem.store.set(`subs:${USER}`, JSON.stringify([runningPlan()]));
      const before = Date.now();
      const r = await purchaseFromWallet(
        { userId: USER, product: { kind: "device", term }, requestId: `req-dev-${term}`, source: "bot" },
        noSideEffects,
      );
      assert.equal(r.status, "ok");
      assert.equal(mem.store.get(`balance_usd:${USER}`), "0");
      const devices = subsOf(USER).filter((s) => s.kind === "device");
      assert.equal(devices.length, 1, "one subscription, not one per month");
      assert.equal(devices[0].slots, 1);
      assert.equal(daysBetween(before, devices[0].expiresAt), term * DEVICE_ADDON_DAYS);
    });
  }
});
