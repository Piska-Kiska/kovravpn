// tests/payment-dedup-ttl.test.mjs — run: npm test
//
// Review of the hotfix: raising the Platega order record from 7 to 180 days
// broke the rule that a webhook's dedup key outlives the record it grants
// from. With the key at 90 days, a CONFIRMED repeated between day 90 and day
// 180 (a provider retry, or a notification resent from its dashboard) passed
// the dedup check, still found the order and granted the plan a second time.
// Cashera had the same 90 against 180 before the hotfix. Both keys now live
// 200 days.
//
// The webhooks run against an in-memory Redis whose TTLs follow a virtual
// clock (`elapse`), with fetch stubbed (the payment API for creating the
// Platega order, Telegram for notices). Keys, secrets and ids are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.PLATEGA_MERCHANT_ID = ["test", "merchant"].join("-");
process.env.PLATEGA_SECRET = ["test", "platega", "secret"].join("-");
process.env.CASHERA_API_KEY = ["test", "cashera", "key"].join("-");
process.env.CASHERA_API_SECRET = ["test", "cashera", "secret"].join("-");
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { createPlategaPayment, ORDER_TTL_SEC: PLATEGA_ORDER_TTL_SEC } = await import("../src/lib/platega-order.ts");
const { ORDER_TTL_SEC: CASHERA_ORDER_TTL_SEC } = await import("../src/lib/cashera-order.ts");
const { POST: plategaWebhook } = await import("../src/app/api/platega/webhook/route.ts");
const { POST: casheraWebhook } = await import("../src/app/api/cashera/webhook/route.ts");

const DAY_SEC = 86_400;
const USER = "tg_100000001";
const subs = () => JSON.parse(mem.store.get(`subs:${USER}`) ?? "[]");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Advance the virtual clock to `day` days after the start of the test. */
let today;
function goTo(day) {
  mem.elapse((day - today) * DAY_SEC);
  today = day;
}

describe("Platega: a CONFIRMED repeated while the order record lives is never granted twice", () => {
  const TX_ID = "tx-test-0000-0002";

  beforeEach(() => {
    mem.reset();
    today = 0;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.startsWith("https://app.platega.io/")) {
        return Response.json({ transactionId: TX_ID, redirect: "https://pay.platega.test/r/2" });
      }
      if (u.startsWith("https://api.telegram.org/")) return Response.json({ ok: true, result: { message_id: 1 } });
      throw new Error(`unexpected fetch in test: ${u}`);
    };
  });

  const confirmed = async () => {
    const res = await plategaWebhook(
      new NextRequest("https://kovra.test/api/platega/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-merchantid": process.env.PLATEGA_MERCHANT_ID,
          "x-secret": process.env.PLATEGA_SECRET,
        },
        body: JSON.stringify({ id: TX_ID, amount: 5, currency: "USD", status: "CONFIRMED", paymentMethod: 13 }),
      }),
    );
    assert.equal(res.status, 200);
    return res.json();
  };

  test("the dedup key outlives the order record", async () => {
    await createPlategaPayment(USER, { type: "device" }, "crypto");
    await confirmed();
    const dedup = mem.ttls.get(`platega_done:${TX_ID}:CONFIRMED`);
    assert.ok(dedup, "dedup key written with a TTL");
    assert.ok(dedup.ex > PLATEGA_ORDER_TTL_SEC, `${dedup.ex} > ${PLATEGA_ORDER_TTL_SEC}`);
  });

  test("repeats on day 150, 179 and 181: one grant", async () => {
    await createPlategaPayment(USER, { type: "device" }, "crypto");
    goTo(10);
    assert.deepEqual(await confirmed(), { ok: true });
    assert.equal(subs().length, 1);

    for (const day of [150, 179, 181]) {
      goTo(day);
      assert.deepEqual(await confirmed(), { ok: true, ignored: "duplicate" }, `day ${day}`);
      assert.equal(subs().length, 1, `day ${day}`);
    }
  });

  test("after both expired, a CONFIRMED finds no order and grants nothing", async () => {
    await createPlategaPayment(USER, { type: "device" }, "crypto");
    goTo(10);
    await confirmed();
    goTo(215);
    assert.deepEqual(await confirmed(), { ok: true, ignored: "order record missing" });
    assert.equal(subs().length, 1);
  });
});

describe("Cashera: a repeated paid while the order record lives is never granted twice", () => {
  const TX = "0a1b2c3d-0000-4000-8000-0000000000c2";
  const PLAN_ORDER = `sub_plan3_1_${USER}_1790000000000`;
  const TOPUP_ORDER = `topup_${USER}_1790000000001`;
  const AMOUNT = 110_000; // kopecks

  beforeEach(async () => {
    mem.reset();
    today = 0;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.startsWith("https://api.telegram.org/")) return Response.json({ ok: true, result: { message_id: 1 } });
      throw new Error(`unexpected fetch in test: ${u}`);
    };
    // Written the way createCardPayment writes them: 180 days.
    await mem.redis.set(
      `cashera_order:${PLAN_ORDER}`,
      JSON.stringify({ userId: USER, kind: "plan3", term: 1, amountUsd: 11.99, amountMinor: AMOUNT, currency: "RUB", rubPerUsd: 91.7, createdAt: 1 }),
      { ex: CASHERA_ORDER_TTL_SEC },
    );
    await mem.redis.set(
      `cashera_order:${TOPUP_ORDER}`,
      JSON.stringify({ userId: USER, kind: "topup", amountUsd: 12, amountMinor: AMOUNT, currency: "RUB", rubPerUsd: 91.7, createdAt: 1 }),
      { ex: CASHERA_ORDER_TTL_SEC },
    );
  });

  const paid = async (externalId, uuid = TX) => {
    const res = await casheraWebhook(
      new NextRequest("https://kovra.test/api/cashera/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.CASHERA_API_KEY,
          "x-secret": process.env.CASHERA_API_SECRET,
        },
        body: JSON.stringify({
          event: "transaction.status_updated",
          transaction: {
            uuid,
            external_id: externalId,
            status: "paid",
            type: "payment",
            amount: AMOUNT,
            gross_amount: AMOUNT,
            net_amount: AMOUNT,
            currency: "RUB",
            payment_method: "card",
            paid_at: null,
          },
        }),
      }),
    );
    assert.equal(res.status, 200);
    return res.json();
  };

  test("the dedup key outlives the order record", async () => {
    await paid(PLAN_ORDER);
    const dedup = mem.ttls.get(`cashera_payment_done:${TX}:paid`);
    assert.ok(dedup);
    assert.ok(dedup.ex > CASHERA_ORDER_TTL_SEC, `${dedup.ex} > ${CASHERA_ORDER_TTL_SEC}`);
  });

  test("a plan: repeats on day 150 and 179 grant nothing more", async () => {
    goTo(10);
    assert.deepEqual(await paid(PLAN_ORDER), { ok: true });
    const expiresAt = subs()[0].expiresAt;
    for (const day of [150, 179]) {
      goTo(day);
      assert.deepEqual(await paid(PLAN_ORDER), { ok: true, ignored: "duplicate" }, `day ${day}`);
    }
    assert.equal(subs().length, 1);
    assert.equal(subs()[0].expiresAt, expiresAt, "the plan was not extended again");
  });

  test("a wallet top-up: credited once, a repeat on day 150 adds nothing", async () => {
    const tx = "0a1b2c3d-0000-4000-8000-0000000000c3";
    goTo(10);
    assert.deepEqual(await paid(TOPUP_ORDER, tx), { ok: true });
    assert.equal(mem.store.get(`balance_usd:${USER}`), "1200");
    goTo(150);
    assert.deepEqual(await paid(TOPUP_ORDER, tx), { ok: true, ignored: "duplicate" });
    assert.equal(mem.store.get(`balance_usd:${USER}`), "1200");
  });
});
