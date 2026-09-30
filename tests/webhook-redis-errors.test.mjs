// tests/webhook-redis-errors.test.mjs — run: npm test
//
// KM-07: the Cashera, Platega and CryptoBot webhooks answered 200 when Redis
// failed. Reserving the dedup key (and, in CryptoBot, the wallet credit after
// it) sat in a try whose catch only logged: the provider stopped retrying, the
// paid order was never credited, the key stayed held so even a manual resend
// was dropped as a duplicate, and nobody was told. Reading the order record
// or the transaction pointer swallowed Redis errors as "missing", which
// dropped the payment the same way.
//
// Now, before the money step: release the key, answer 503/500, alert the
// admin with the transaction id; the provider's retry then pays out exactly
// once. The webhooks run against an in-memory Redis with failures injected;
// fetch is stubbed and records Telegram messages. Keys, secrets and ids are
// made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";

process.env.CASHERA_API_KEY = ["test", "cashera", "key"].join("-");
process.env.CASHERA_API_SECRET = ["test", "cashera", "secret"].join("-");
process.env.PLATEGA_MERCHANT_ID = ["test", "merchant"].join("-");
process.env.PLATEGA_SECRET = ["test", "platega", "secret"].join("-");
process.env.CRYPTOBOT_API_TOKEN = ["12345", "TESTcryptobotTOKEN"].join(":");
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { ADMIN_TG_ID } = await import("../src/lib/bot-owner.ts");
const { POST: casheraWebhook } = await import("../src/app/api/cashera/webhook/route.ts");
const { POST: plategaWebhook } = await import("../src/app/api/platega/webhook/route.ts");
const { POST: cryptobotWebhook } = await import("../src/app/api/payment/cryptobot-webhook/route.ts");

const DAY = 86_400_000;
const USER = "tg_100000001";
const subs = () => JSON.parse(mem.store.get(`subs:${USER}`) ?? "[]");
const walletCents = () => Number(mem.store.get(`balance_usd:${USER}`) ?? 0);
const daysOfAccess = () => Math.round((Math.max(0, ...subs().map((s) => s.expiresAt)) - Date.now()) / DAY);

let messages;
const adminAlerts = () => messages.filter((m) => String(m.chat_id) === ADMIN_TG_ID).map((m) => m.text);
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  messages = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith("https://api.telegram.org/")) throw new Error(`unexpected fetch in test: ${u}`);
    messages.push(init.body ? JSON.parse(init.body) : {});
    return Response.json({ ok: true, result: { message_id: 1 } });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("Cashera", () => {
  const TX = "0a1b2c3d-0000-4000-8000-0000000000e1";
  const PLAN_ORDER = `sub_plan1_1_${USER}_1790000000000`;
  const TOPUP_ORDER = `topup_${USER}_1790000000001`;
  const AMOUNT = 46_000;

  beforeEach(() => {
    mem.store.set(
      `cashera_order:${PLAN_ORDER}`,
      JSON.stringify({ userId: USER, kind: "plan1", term: 1, amountUsd: 5, amountMinor: AMOUNT, currency: "RUB", rubPerUsd: 92, createdAt: 1 }),
    );
    mem.store.set(
      `cashera_order:${TOPUP_ORDER}`,
      JSON.stringify({ userId: USER, kind: "topup", amountUsd: 5, amountMinor: AMOUNT, currency: "RUB", rubPerUsd: 92, createdAt: 1 }),
    );
  });

  const paid = (externalId = PLAN_ORDER) =>
    casheraWebhook(
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
            uuid: TX,
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

  test("the dedup key cannot be reserved: 503 and an alert; the retry grants once", async () => {
    mem.failNext("set", { key: `cashera_payment_done:${TX}:paid` });
    const first = await paid();
    assert.equal(first.status, 503);
    assert.deepEqual(subs(), []);
    assert.ok(adminAlerts().some((t) => t.includes(TX)), "the admin gets the transaction id");
    assert.equal((await paid()).status, 200);
    assert.equal(daysOfAccess(), 30);
    assert.equal((await paid()).status, 200, "a third delivery is a duplicate");
    assert.equal(subs().length, 1);
  });

  test("the order record cannot be read: 500, key released, no 'order missing' drop", async () => {
    mem.failNext("get", { key: `cashera_order:${PLAN_ORDER}` });
    const first = await paid();
    assert.equal(first.status, 500);
    assert.equal(mem.store.has(`cashera_payment_done:${TX}:paid`), false);
    assert.ok(!adminAlerts().some((t) => t.includes("order record missing")));
    assert.ok(adminAlerts().some((t) => t.includes(TX)));
    assert.equal((await paid()).status, 200);
    assert.equal(subs().length, 1);
  });

  test("a top-up whose owner lookup fails: 500, key released; the retry credits once", async () => {
    mem.failNext("get", { key: `alias:${USER}` });
    const first = await paid(TOPUP_ORDER);
    assert.equal(first.status, 500);
    assert.equal(walletCents(), 0);
    assert.equal((await paid(TOPUP_ORDER)).status, 200);
    assert.equal((await paid(TOPUP_ORDER)).status, 200);
    assert.equal(walletCents(), 500);
  });

  test("the grant fails and so does releasing the key: still 500, never 200, and the admin is told", async () => {
    mem.failNext("set", { key: `subs:${USER}` });
    mem.failNext("del", { key: `cashera_payment_done:${TX}:paid` });
    const first = await paid();
    assert.equal(first.status, 500);
    assert.ok(adminAlerts().some((t) => t.includes("grant failed") && t.includes(TX)));
  });
});

describe("Platega", () => {
  const TX = "tx-test-0000-00e2";
  const ORDER = `sub_plan1_1_${USER}_1790000000002`;

  beforeEach(() => {
    mem.store.set(`platega_tx:${TX}`, ORDER);
    mem.store.set(
      `platega_order:${ORDER}`,
      JSON.stringify({
        userId: USER,
        kind: "plan1",
        term: 1,
        amountUsd: 5,
        amountCharged: 5,
        amountMinor: 500,
        currency: "USD",
        fxRate: 1,
        method: 13,
        createdAt: 1,
      }),
    );
  });

  const confirmed = () =>
    plategaWebhook(
      new NextRequest("https://kovra.test/api/platega/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-merchantid": process.env.PLATEGA_MERCHANT_ID,
          "x-secret": process.env.PLATEGA_SECRET,
        },
        body: JSON.stringify({ id: TX, amount: 5, currency: "USD", status: "CONFIRMED", paymentMethod: 13 }),
      }),
    );

  test("the dedup key cannot be reserved: 503 and an alert; the retry grants once", async () => {
    mem.failNext("set", { key: `platega_done:${TX}:CONFIRMED` });
    assert.equal((await confirmed()).status, 503);
    assert.deepEqual(subs(), []);
    assert.ok(adminAlerts().some((t) => t.includes(TX)));
    assert.equal((await confirmed()).status, 200);
    assert.equal((await confirmed()).status, 200);
    assert.equal(subs().length, 1);
  });

  for (const key of [`platega_tx:${TX}`, `platega_order:${ORDER}`]) {
    test(`${key.split(":")[0]} cannot be read: 500 and the key released, not "order record missing"`, async () => {
      mem.failNext("get", { key });
      assert.equal((await confirmed()).status, 500);
      assert.equal(mem.store.has(`platega_done:${TX}:CONFIRMED`), false);
      assert.ok(!adminAlerts().some((t) => t.includes("order record missing")));
      assert.equal((await confirmed()).status, 200);
      assert.equal(daysOfAccess(), 30);
    });
  }
});

describe("CryptoBot", () => {
  const INVOICE = "700001";

  function paidUpdate() {
    const body = JSON.stringify({
      update_type: "invoice_paid",
      payload: {
        invoice_id: Number(INVOICE),
        status: "paid",
        amount: "8.00",
        payload: JSON.stringify({ userId: USER, amountUsd: 8 }),
      },
    });
    const secret = createHash("sha256").update(process.env.CRYPTOBOT_API_TOKEN).digest();
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    return cryptobotWebhook(
      new NextRequest("https://kovra.test/api/payment/cryptobot-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "crypto-pay-api-signature": sig },
        body,
      }),
    );
  }

  test("the credit fails: 500, the key is released, the admin is told; the retry credits once", async () => {
    mem.failNext("incrby", { key: `balance_usd:${USER}` });
    const first = await paidUpdate();
    assert.equal(first.status, 500);
    assert.equal(walletCents(), 0);
    assert.equal(mem.store.has(`cryptobot_paid:${INVOICE}`), false);
    assert.ok(adminAlerts().some((t) => t.includes(INVOICE)));
    const retry = await paidUpdate();
    assert.equal(retry.status, 200);
    assert.equal(walletCents(), 800);
    const again = await paidUpdate();
    assert.deepEqual(await again.json(), { ok: true, ignored: "duplicate" });
    assert.equal(walletCents(), 800);
  });

  test("the dedup key cannot be reserved: 503 and an alert; nothing credited", async () => {
    mem.failNext("set", { key: `cryptobot_paid:${INVOICE}` });
    assert.equal((await paidUpdate()).status, 503);
    assert.equal(walletCents(), 0);
    assert.ok(adminAlerts().some((t) => t.includes(INVOICE)));
  });

  test("a bad signature is refused before any Redis access", async () => {
    const res = await cryptobotWebhook(
      new NextRequest("https://kovra.test/api/payment/cryptobot-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "crypto-pay-api-signature": "00".repeat(32) },
        body: "{}",
      }),
    );
    assert.equal(res.status, 401);
    assert.equal(mem.calls.size, 0);
  });
});
