// tests/platega-order-ttl.test.mjs — run: npm test
//
// KM-13 (second half): Platega kept platega_order:{externalId} and
// platega_tx:{transactionId} for 7 days, the TTL that lost a Cashera payment
// on 26.08.2026. A CONFIRMED arriving after that is refused ("order record
// missing"). Both records now live 180 days, like Cashera's.
//
// createPlategaPayment (src/lib/platega-order.ts) runs against an in-memory
// Redis with fetch stubbed; the crypto method needs no exchange rate. The
// merchant id, secret and transaction ids are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.PLATEGA_MERCHANT_ID = ["test", "merchant"].join("-");
process.env.PLATEGA_SECRET = ["test", "platega", "secret"].join("-");

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { createPlategaPayment } = await import("../src/lib/platega-order.ts");
const { PlategaError } = await import("../src/lib/platega.ts");

const USER = "tg_100000001";
const TX_ID = "tx-test-0000-0001";
const TTL_180D = { ex: 180 * 86400, px: undefined };

let reply;
let requests;
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  requests = [];
  reply = () => Response.json({ transactionId: TX_ID, redirect: "https://pay.platega.test/r/1" });
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith("https://app.platega.io/")) throw new Error(`unexpected fetch in test: ${u}`);
    requests.push({ url: u, body: init.body ? JSON.parse(init.body) : null });
    return reply();
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("createPlategaPayment", () => {
  test("the order record and the tx pointer both live 180 days", async () => {
    const r = await createPlategaPayment(USER, { type: "device" }, "crypto");
    assert.equal(r.transactionId, TX_ID);
    assert.equal(r.currency, "USD");
    assert.equal(r.amountCharged, 5);

    const orderKey = [...mem.store.keys()].find((k) => k.startsWith("platega_order:dev_"));
    assert.ok(orderKey, "order record written");
    assert.deepEqual(mem.ttls.get(orderKey), TTL_180D);
    assert.equal(mem.store.get(`platega_tx:${TX_ID}`), orderKey.slice("platega_order:".length));
    assert.deepEqual(mem.ttls.get(`platega_tx:${TX_ID}`), TTL_180D);
    assert.equal(JSON.parse(mem.store.get(orderKey)).amountMinor, 500);
  });

  test("a plan is recorded the same way", async () => {
    await createPlategaPayment(USER, { type: "plan", kind: "plan3", term: 12 }, "crypto");
    const orderKey = [...mem.store.keys()].find((k) => k.startsWith("platega_order:sub_plan3_12_"));
    assert.ok(orderKey);
    assert.deepEqual(mem.ttls.get(orderKey), TTL_180D);
    assert.equal(JSON.parse(mem.store.get(orderKey)).amountMinor, 7908);
  });

  test("Platega refusing the payment throws a PlategaError with the HTTP status, and no tx pointer", async () => {
    reply = () => new Response("upstream says no", { status: 502 });
    await assert.rejects(
      () => createPlategaPayment(USER, { type: "device" }, "crypto"),
      (err) => err instanceof PlategaError && err.status === 502 && err.name === "PlategaError",
    );
    assert.equal([...mem.store.keys()].some((k) => k.startsWith("platega_tx:")), false);
  });

  test("an invalid plan is refused before anything is written or sent", async () => {
    await assert.rejects(() => createPlategaPayment(USER, { type: "plan", kind: "plan3", term: 3 }, "crypto"), /invalid plan/);
    assert.equal(mem.store.size, 0);
    assert.deepEqual(requests, []);
  });
});
