// tests/webhook-alias.test.mjs — run: npm test
//
// A plan or device add-on ordered as tg_X (sub_… / dev_… order id) and paid
// after tg_X was linked to an e-mail account used to land on subs:tg_X, which
// nothing reads after the link: paid, and invisible. The payment webhooks now
// resolve the alias for plan and device grants, as they already did for
// wallet top-ups, so the purchase lands on the account the person uses.
//
// Cashera, Platega, NOWPayments and Freekassa run end to end against an
// in-memory Redis (lava.top takes the same one-line change; its route needs
// the provider API and is not run here). Keys, secrets and ids are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

process.env.CASHERA_API_KEY = ["test", "cashera", "key"].join("-");
process.env.CASHERA_API_SECRET = ["test", "cashera", "secret"].join("-");
process.env.PLATEGA_MERCHANT_ID = ["test", "merchant"].join("-");
process.env.PLATEGA_SECRET = ["test", "platega", "secret"].join("-");
process.env.NOWPAYMENTS_IPN_SECRET = ["test", "ipn", "secret"].join("-");
process.env.FREEKASSA_SHOP_ID = "90001";
process.env.FREEKASSA_SECRET2 = ["fk", "test", "secret2"].join("-");
delete process.env.FREEKASSA_DISABLE_IP_CHECK;
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { POST: cashera } = await import("../src/app/api/cashera/webhook/route.ts");
const { POST: platega } = await import("../src/app/api/platega/webhook/route.ts");
const { POST: nowpayments } = await import("../src/app/api/payment/crypto-webhook/route.ts");
const { POST: freekassa } = await import("../src/app/api/freekassa/notify/route.ts");
const { FK_IPS } = await import("../src/lib/freekassa.ts");

const TG = "tg_100000001";
const EM = "em_buyer@example.test";
const ORDER = `sub_plan1_1_${TG}_1790000000000`;
const DEV_ORDER = `dev_${TG}_1790000000001`;

const subsOf = (uid) => JSON.parse(mem.store.get(`subs:${uid}`) ?? "[]");
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  globalThis.fetch = async (url) => {
    if (String(url).startsWith("https://api.telegram.org/")) return Response.json({ ok: true, result: { message_id: 1 } });
    throw new Error(`unexpected fetch in test: ${url}`);
  };
  // tg_X was linked to the e-mail account after the order was made.
  mem.store.set(`alias:${TG}`, EM);
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function assertOnPrimary(kind = "plan1") {
  assert.deepEqual(subsOf(EM).map((s) => s.kind), [kind], "granted to the linked account");
  assert.deepEqual(subsOf(TG), [], "nothing on the id nothing reads");
}

describe("a plan paid after the link lands on the linked account", () => {
  test("Cashera", async () => {
    const TX = "0a1b2c3d-0000-4000-8000-0000000000f1";
    mem.store.set(`cashera_order:${ORDER}`, JSON.stringify({ userId: TG, kind: "plan1", term: 1, amountUsd: 5, amountMinor: 46000, currency: "RUB", rubPerUsd: 92, createdAt: 1 }));
    const res = await cashera(
      new NextRequest("https://kovra.test/api/cashera/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.CASHERA_API_KEY, "x-secret": process.env.CASHERA_API_SECRET },
        body: JSON.stringify({
          event: "transaction.status_updated",
          transaction: { uuid: TX, external_id: ORDER, status: "paid", type: "payment", amount: 46000, gross_amount: 46000, net_amount: 46000, currency: "RUB", payment_method: "card", paid_at: null },
        }),
      }),
    );
    assert.equal(res.status, 200);
    assertOnPrimary();
  });

  test("Platega", async () => {
    const TX = "tx-test-0000-00f2";
    mem.store.set(`platega_tx:${TX}`, ORDER);
    mem.store.set(`platega_order:${ORDER}`, JSON.stringify({ userId: TG, kind: "plan1", term: 1, amountUsd: 5, amountCharged: 5, amountMinor: 500, currency: "USD", fxRate: 1, method: 13, createdAt: 1 }));
    const res = await platega(
      new NextRequest("https://kovra.test/api/platega/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-merchantid": process.env.PLATEGA_MERCHANT_ID, "x-secret": process.env.PLATEGA_SECRET },
        body: JSON.stringify({ id: TX, amount: 5, currency: "USD", status: "CONFIRMED", paymentMethod: 13 }),
      }),
    );
    assert.equal(res.status, 200);
    assertOnPrimary();
  });

  test("NOWPayments", async () => {
    const payload = { payment_id: 5550009, payment_status: "finished", order_id: ORDER, price_amount: 5, price_currency: "usd", pay_amount: 5, pay_currency: "usdttrc20", actually_paid: 5 };
    const sorted = Object.fromEntries(Object.keys(payload).sort().map((k) => [k, payload[k]]));
    const sig = createHmac("sha512", process.env.NOWPAYMENTS_IPN_SECRET).update(JSON.stringify(sorted)).digest("hex");
    const res = await nowpayments(
      new NextRequest("https://kovra.test/api/payment/crypto-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-nowpayments-sig": sig },
        body: JSON.stringify(payload),
      }),
    );
    assert.equal(res.status, 200);
    assertOnPrimary();
  });

  test("Freekassa, a device add-on", async () => {
    const md5 = (s) => createHash("md5").update(s).digest("hex");
    const amount = "5.00";
    const form = new URLSearchParams({
      MERCHANT_ID: process.env.FREEKASSA_SHOP_ID,
      AMOUNT: amount,
      MERCHANT_ORDER_ID: DEV_ORDER,
      intid: "5550099",
      CUR_ID: "32",
      SIGN: md5(`${process.env.FREEKASSA_SHOP_ID}:${amount}:${process.env.FREEKASSA_SECRET2}:${DEV_ORDER}`),
    });
    const res = await freekassa(
      new Request("https://kovra.test/api/freekassa/notify", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": [...FK_IPS][0] },
        body: form,
      }),
    );
    assert.equal(await res.text(), "YES");
    assertOnPrimary("device");
  });

  test("no alias: the order's own account, as before", async () => {
    mem.store.delete(`alias:${TG}`);
    const TX = "tx-test-0000-00f3";
    mem.store.set(`platega_tx:${TX}`, ORDER);
    mem.store.set(`platega_order:${ORDER}`, JSON.stringify({ userId: TG, kind: "plan1", term: 1, amountUsd: 5, amountCharged: 5, amountMinor: 500, currency: "USD", fxRate: 1, method: 13, createdAt: 1 }));
    await platega(
      new NextRequest("https://kovra.test/api/platega/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-merchantid": process.env.PLATEGA_MERCHANT_ID, "x-secret": process.env.PLATEGA_SECRET },
        body: JSON.stringify({ id: TX, amount: 5, currency: "USD", status: "CONFIRMED", paymentMethod: 13 }),
      }),
    );
    assert.deepEqual(subsOf(TG).map((s) => s.kind), ["plan1"]);
  });

  test("the alias cannot be read: 500 and the key released, so the retry grants on the linked account", async () => {
    const TX = "tx-test-0000-00f4";
    mem.store.set(`platega_tx:${TX}`, ORDER);
    mem.store.set(`platega_order:${ORDER}`, JSON.stringify({ userId: TG, kind: "plan1", term: 1, amountUsd: 5, amountCharged: 5, amountMinor: 500, currency: "USD", fxRate: 1, method: 13, createdAt: 1 }));
    const call = () =>
      platega(
        new NextRequest("https://kovra.test/api/platega/webhook", {
          method: "POST",
          headers: { "content-type": "application/json", "x-merchantid": process.env.PLATEGA_MERCHANT_ID, "x-secret": process.env.PLATEGA_SECRET },
          body: JSON.stringify({ id: TX, amount: 5, currency: "USD", status: "CONFIRMED", paymentMethod: 13 }),
        }),
      );
    mem.failNext("get", { key: `alias:${TG}` });
    assert.equal((await call()).status, 500);
    assert.deepEqual(subsOf(TG), []);
    assert.equal((await call()).status, 200);
    assertOnPrimary();
  });
});
