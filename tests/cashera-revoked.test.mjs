// tests/cashera-revoked.test.mjs — run: npm test
//
// KM-13: the Cashera webhook dedups on `<uuid>:<status>`, so "paid" and
// "refunded" of one transaction are processed separately. The refund branch
// only alerted and left no trace, so a "paid" that came after it (a delivery
// that failed with 500 and was retried after the refund, or plain
// reordering) was still granted. Now a refund/chargeback leaves
// `cashera_revoked:<uuid>` for 180 days and "paid" checks it before granting
// a plan, a device or a wallet top-up.
//
// POST (src/app/api/cashera/webhook/route.ts) is called directly against an
// in-memory Redis; fetch is stubbed and only records Telegram calls. Keys,
// secrets and ids are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.CASHERA_API_KEY = ["test", "cashera", "key"].join("-");
process.env.CASHERA_API_SECRET = ["test", "cashera", "secret"].join("-");
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { POST } = await import("../src/app/api/cashera/webhook/route.ts");

const DAY = 86_400_000;
const USER = "tg_100000001";
const TX = "0a1b2c3d-0000-4000-8000-0000000000c1";
const PLAN_ORDER = `sub_plan3_1_${USER}_1790000000000`;
const TOPUP_ORDER = `topup_${USER}_1790000000001`;
const AMOUNT = 110_000; // kopecks

let tgCalls;
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  tgCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith("https://api.telegram.org/")) throw new Error(`unexpected fetch in test: ${u}`);
    tgCalls.push(init.body ? JSON.parse(init.body).text : "");
    return Response.json({ ok: true, result: { message_id: 1 } });
  };
  mem.store.set(
    `cashera_order:${PLAN_ORDER}`,
    JSON.stringify({ userId: USER, kind: "plan3", term: 1, amountUsd: 11.99, amountMinor: AMOUNT, currency: "RUB", rubPerUsd: 91.7, createdAt: 1 }),
  );
  mem.store.set(
    `cashera_order:${TOPUP_ORDER}`,
    JSON.stringify({ userId: USER, kind: "topup", amountUsd: 12, amountMinor: AMOUNT, currency: "RUB", rubPerUsd: 91.7, createdAt: 1 }),
  );
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function webhook(status, { externalId = PLAN_ORDER, uuid = TX } = {}) {
  return POST(
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
          status,
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
}

const subs = () => JSON.parse(mem.store.get(`subs:${USER}`) ?? "[]");
const walletCents = () => Number(mem.store.get(`balance_usd:${USER}`) ?? 0);

describe("cashera webhook: paid after refunded/chargeback", () => {
  test("paid then refunded (the normal order): granted once, the refund is remembered", async () => {
    const paid = await webhook("paid");
    assert.equal(paid.status, 200);
    assert.equal(subs().length, 1);
    const refunded = await webhook("refunded");
    assert.equal(refunded.status, 200);
    assert.equal(mem.store.get(`cashera_revoked:${TX}`), "refunded");
    assert.deepEqual(mem.ttls.get(`cashera_revoked:${TX}`), { ex: 180 * 86400, px: undefined });
    assert.ok(tgCalls.some((t) => t.includes("Cashera refunded")));
  });

  for (const reversal of ["refunded", "chargeback"]) {
    test(`${reversal} first, then paid: nothing is granted and the admin is told`, async () => {
      assert.equal((await webhook(reversal)).status, 200);
      const paid = await webhook("paid");
      assert.equal(paid.status, 200);
      assert.deepEqual(await paid.json(), { ok: true, ignored: "revoked" });
      assert.deepEqual(subs(), []);
      assert.equal(mem.store.has(`has_topup:${USER}`), false);
      assert.ok(tgCalls.some((t) => t.includes(`paid after ${reversal}`) && t.includes("NOT granted")));
      // The "paid" delivery is settled: a further retry is a duplicate.
      assert.deepEqual(await (await webhook("paid")).json(), { ok: true, ignored: "duplicate" });
      assert.deepEqual(subs(), []);
    });
  }

  test("a paid that failed with 500, then a refund, then the paid retry: not granted", async () => {
    mem.failNext("set", { key: `subs:${USER}` });
    assert.equal((await webhook("paid")).status, 500);
    assert.deepEqual(subs(), []);
    assert.equal((await webhook("refunded")).status, 200);
    const retry = await webhook("paid");
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), { ok: true, ignored: "revoked" });
    assert.deepEqual(subs(), []);
  });

  test("a wallet top-up charged back is not credited by a later paid", async () => {
    assert.equal((await webhook("chargeback", { externalId: TOPUP_ORDER })).status, 200);
    const paid = await webhook("paid", { externalId: TOPUP_ORDER });
    assert.deepEqual(await paid.json(), { ok: true, ignored: "revoked" });
    assert.equal(walletCents(), 0);
  });

  test("a top-up paid normally is still credited", async () => {
    const paid = await webhook("paid", { externalId: TOPUP_ORDER });
    assert.deepEqual(await paid.json(), { ok: true });
    assert.equal(walletCents(), 1200);
  });

  test("the marker cannot be written: 500 and the refund can be retried", async () => {
    mem.failNext("set", { key: `cashera_revoked:${TX}` });
    const first = await webhook("refunded");
    assert.equal(first.status, 500);
    assert.equal(mem.store.has(`cashera_payment_done:${TX}:refunded`), false, "dedup released");
    assert.equal((await webhook("refunded")).status, 200);
    assert.equal(mem.store.get(`cashera_revoked:${TX}`), "refunded");
    assert.deepEqual(await (await webhook("paid")).json(), { ok: true, ignored: "revoked" });
    assert.deepEqual(subs(), []);
  });

  test("the marker cannot be read: 500, nothing granted, and the retry grants", async () => {
    mem.failNext("get", { key: `cashera_revoked:${TX}` });
    const first = await webhook("paid");
    assert.equal(first.status, 500);
    assert.deepEqual(subs(), []);
    assert.equal(mem.store.has(`cashera_payment_done:${TX}:paid`), false, "dedup released");
    const retry = await webhook("paid");
    assert.deepEqual(await retry.json(), { ok: true });
    assert.equal(subs().length, 1);
  });

  test("a refund of ANOTHER transaction does not block this one", async () => {
    await webhook("refunded", { uuid: "0a1b2c3d-0000-4000-8000-0000000000c2" });
    assert.deepEqual(await (await webhook("paid")).json(), { ok: true });
    assert.equal(subs().length, 1);
    assert.ok(Math.round((subs()[0].expiresAt - Date.now()) / DAY) === 30);
  });

  test("bad credentials are refused before any Redis access", async () => {
    const res = await POST(
      new NextRequest("https://kovra.test/api/cashera/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": "nope", "x-secret": "nope" },
        body: JSON.stringify({ event: "transaction.status_updated", transaction: { uuid: TX, status: "refunded" } }),
      }),
    );
    assert.equal(res.status, 401);
    assert.equal(mem.store.has(`cashera_revoked:${TX}`), false);
  });
});
