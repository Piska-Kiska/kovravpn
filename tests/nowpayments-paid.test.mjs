// tests/nowpayments-paid.test.mjs — run: npm test
//
// KM-09: the NOWPayments IPN handled only `finished` and never looked at what
// was actually paid. An overpayment was kept silently (21.08: 452 USDT on a
// 20 USD invoice), and `partially_paid` answered "not finished" with no
// record and no alert. Now `partially_paid` grants nothing and alerts the
// admin once per payment and amount; a `finished` whose actually_paid strays
// more than 1% from pay_amount is granted as ordered and alerts the admin.
// Redis failing before the grant asks NOWPayments to retry (KM-07).
//
// POST (src/app/api/payment/crypto-webhook/route.ts) runs against an
// in-memory Redis; fetch is stubbed and records Telegram messages. The IPN
// secret and ids are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.NOWPAYMENTS_IPN_SECRET = ["test", "ipn", "secret"].join("-");
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { ADMIN_TG_ID } = await import("../src/lib/bot-owner.ts");
const { paidDeviation } = await import("../src/lib/nowpayments.ts");
const { POST } = await import("../src/app/api/payment/crypto-webhook/route.ts");

const USER = "tg_100000001";
const PLAN_ORDER = `sub_plan1_1_${USER}_1790000000000`;
const TOPUP_ORDER = `topup_${USER}_1790000000001`;

const subs = () => JSON.parse(mem.store.get(`subs:${USER}`) ?? "[]");
const walletCents = () => Number(mem.store.get(`balance_usd:${USER}`) ?? 0);

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

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

function ipn(fields) {
  const payload = {
    payment_id: 5550001,
    payment_status: "finished",
    order_id: PLAN_ORDER,
    price_amount: 5,
    price_currency: "usd",
    pay_amount: 5.02,
    pay_currency: "usdttrc20",
    actually_paid: 5.02,
    ...fields,
  };
  const body = JSON.stringify(payload);
  const sig = createHmac("sha512", process.env.NOWPAYMENTS_IPN_SECRET).update(JSON.stringify(sortKeys(payload))).digest("hex");
  return POST(
    new NextRequest("https://kovra.test/api/payment/crypto-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-nowpayments-sig": sig },
      body,
    }),
  );
}

describe("partially_paid", () => {
  test("grants nothing and alerts the admin once per payment and amount", async () => {
    const res = await ipn({ payment_status: "partially_paid", actually_paid: 2.5 });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, ignored: "partially_paid" });
    assert.deepEqual(subs(), []);
    assert.equal(adminAlerts().length, 1);
    assert.match(adminAlerts()[0], /partially paid, NOT granted/);
    assert.match(adminAlerts()[0], /5550001/);
    assert.match(adminAlerts()[0], /actually paid 2\.5 usdttrc20/);

    await ipn({ payment_status: "partially_paid", actually_paid: 2.5 });
    assert.equal(adminAlerts().length, 1, "the same IPN again: no second alert");

    await ipn({ payment_status: "partially_paid", actually_paid: 4 });
    assert.equal(adminAlerts().length, 2, "more money arrived: the admin hears again");
  });

  test("the rest paid later: the finished IPN grants once", async () => {
    await ipn({ payment_status: "partially_paid", actually_paid: 2.5 });
    const res = await ipn({ payment_status: "finished" });
    assert.equal(res.status, 200);
    assert.equal(subs().length, 1);
  });

  test("Redis failing: 503, so NOWPayments repeats it", async () => {
    mem.failNext("set", { key: /^crypto_partial:/ });
    const res = await ipn({ payment_status: "partially_paid", actually_paid: 2.5 });
    assert.equal(res.status, 503);
  });
});

describe("finished with a different amount", () => {
  test("an overpaid plan: granted as ordered, the admin told what came in", async () => {
    const res = await ipn({ pay_amount: 20.1, actually_paid: 452 });
    assert.equal(res.status, 200);
    assert.equal(subs().length, 1);
    const alert = adminAlerts().find((t) => t.includes("paid MORE"));
    assert.ok(alert, "overpayment alert");
    assert.match(alert, /actually paid 452 usdttrc20/);
    assert.match(alert, new RegExp(PLAN_ORDER));
  });

  test("an overpaid top-up: the invoice amount is credited, the admin told", async () => {
    const res = await ipn({ order_id: TOPUP_ORDER, price_amount: 20, pay_amount: 20.1, actually_paid: 452 });
    assert.equal(res.status, 200);
    assert.equal(walletCents(), 2000, "not credited from actually_paid");
    assert.ok(adminAlerts().some((t) => t.includes("paid MORE")));
  });

  test("finished but 5% short: granted, the admin told", async () => {
    await ipn({ pay_amount: 20, actually_paid: 19 });
    assert.equal(subs().length, 1);
    assert.ok(adminAlerts().some((t) => t.includes("paid LESS")));
  });

  test("paid as asked: no alert", async () => {
    await ipn({});
    assert.equal(subs().length, 1);
    assert.deepEqual(adminAlerts(), []);
  });
});

describe("Redis failing before the grant", () => {
  test("the dedup key cannot be reserved: 503; the retry grants once", async () => {
    mem.failNext("set", { key: "crypto_payment_done:5550001" });
    assert.equal((await ipn({})).status, 503);
    assert.deepEqual(subs(), []);
    assert.equal((await ipn({})).status, 200);
    assert.equal((await ipn({})).status, 200);
    assert.equal(subs().length, 1);
  });

  test("a top-up whose owner lookup fails: 500, the key released; the retry credits once", async () => {
    mem.failNext("get", { key: `alias:${USER}` });
    assert.equal((await ipn({ order_id: TOPUP_ORDER })).status, 500);
    assert.equal(mem.store.has("crypto_payment_done:5550001"), false);
    assert.equal((await ipn({ order_id: TOPUP_ORDER })).status, 200);
    assert.equal((await ipn({ order_id: TOPUP_ORDER })).status, 200);
    assert.equal(walletCents(), 500);
  });

  test("a forged signature is refused before any Redis access", async () => {
    const res = await POST(
      new NextRequest("https://kovra.test/api/payment/crypto-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-nowpayments-sig": "ab".repeat(64) },
        body: JSON.stringify({ payment_id: 1, payment_status: "finished", order_id: PLAN_ORDER }),
      }),
    );
    assert.equal(res.status, 401);
    assert.equal(mem.calls.size, 0);
  });
});

describe("paidDeviation", () => {
  test("within 1% is no deviation; beyond it is over or under", () => {
    assert.equal(paidDeviation({ pay_amount: 100, actually_paid: 100 }), null);
    assert.equal(paidDeviation({ pay_amount: 100, actually_paid: 101 }), null);
    assert.equal(paidDeviation({ pay_amount: 100, actually_paid: 99 }), null);
    assert.equal(paidDeviation({ pay_amount: 100, actually_paid: 101.5 }), "over");
    assert.equal(paidDeviation({ pay_amount: 100, actually_paid: 98 }), "under");
  });

  test("missing or broken numbers say nothing", () => {
    for (const p of [{}, { pay_amount: 0, actually_paid: 5 }, { pay_amount: 5 }, { pay_amount: "x", actually_paid: 5 }, { pay_amount: 5, actually_paid: -1 }]) {
      assert.equal(paidDeviation(p), null, JSON.stringify(p));
    }
  });
});
