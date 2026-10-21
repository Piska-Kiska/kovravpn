// tests/lava-invoice.test.mjs — run: npm test
//
// Creating a lava.top invoice (src/lib/lava.ts, createInvoice): what goes
// out, and what the error carries when the gateway refuses.
//
// 22.10.2026: production got "500 Something went wrong" from gate.lava.top
// for every top-up while the same request from another machine was accepted,
// and the log line had neither their request id nor what we had sent. Now
// LavaError carries their `x-request-id`, and a refused request is logged
// without the key and without the buyer's address, so the next failure can
// be compared with a probe and handed to lava.top support by number.
//
// fetch is stubbed; no request leaves the process. Keys and ids are made up.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const API_KEY = ["test", "lava", "key"].join("-");
process.env.LAVA_API_KEY = API_KEY;
process.env.LAVA_OFFER_ID = "0a1b2c3d-0000-4000-8000-00000000000f";
process.env.LAVA_BUYER_EMAIL = "receipts@kovra.test";
delete process.env.LAVA_PAYMENT_PROVIDER;
delete process.env.LAVA_PAYMENT_METHOD;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const { createInvoice, LavaError, lavaConfigured } = await import("../src/lib/lava.ts");

const ENDPOINT = "https://gate.lava.top/api/v3/invoice";
const CONTRACT = "0a1b2c3d-0000-4000-8000-0000000000a1";
const REQUEST_ID = "0cf8862c-b013-488e-b956-0b966fc21db7";
const INPUT = {
  orderId: "topup_tg_100000001_1790000000001",
  amount: 5,
  currency: "USD",
  methodId: "card",
  locale: "ru",
  successUrl: "https://kovra.test/dashboard?paid=1",
  failUrl: "https://kovra.test/dashboard",
};

/** Captured requests: { url, headers, body }. */
let calls = [];
/** Queue of answers, one factory per expected request. */
let answers = [];
/** console.error lines, joined. */
let errors = [];
const realFetch = globalThis.fetch;
const realError = console.error;
const realWarn = console.warn;

const created = (over = {}) =>
  Response.json(
    {
      id: CONTRACT,
      paymentUrl: `https://app.lava.top/pay/${CONTRACT}`,
      amountTotal: { amount: 5, currency: "USD" },
      ...over,
    },
    { status: 201 },
  );
const refused = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const THEIR_500 = {
  error: "Something went wrong",
  details: {},
  timestamp: "2026-10-22T00:29:55+03:00",
};

beforeEach(() => {
  calls = [];
  answers = [];
  errors = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      headers: init.headers ?? {},
      body: typeof init.body === "string" ? JSON.parse(init.body) : null,
    });
    const next = answers.shift();
    if (next === undefined) throw new Error(`unexpected fetch in test: ${url}`);
    return next();
  };
  console.error = (...parts) => {
    errors.push(parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" "));
  };
  console.warn = () => {};
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
  console.warn = realWarn;
});

describe("lava.top invoice", () => {
  test("the test env configures the line", () => {
    assert.equal(lavaConfigured, true);
  });

  test("a created invoice: one POST with the buyer's choice, our order id and the return addresses", async () => {
    answers = [created];
    const r = await createInvoice(INPUT);
    assert.deepEqual(r, { contractId: CONTRACT, paymentUrl: `https://app.lava.top/pay/${CONTRACT}` });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, ENDPOINT);
    assert.equal(calls[0].headers["X-Api-Key"], API_KEY);
    assert.deepEqual(calls[0].body, {
      email: "receipts@kovra.test",
      offerId: process.env.LAVA_OFFER_ID,
      currency: "USD",
      amount: 5,
      buyerLanguage: "RU",
      clientUtm: { utm_source: "kovravpn", utm_medium: "checkout", utm_content: INPUT.orderId },
      paymentProvider: "UNLIMINT",
      paymentMethod: "CARD",
      successful_return_url: INPUT.successUrl,
      failure_return_url: INPUT.failUrl,
      cancel_return_url: INPUT.failUrl,
    });
    assert.deepEqual(errors, []);
  });

  test("their 500: the error carries their request id, a POST is never repeated, the refused request is logged without secrets", async () => {
    answers = [() => refused(500, THEIR_500, { "x-request-id": REQUEST_ID })];
    await assert.rejects(createInvoice(INPUT), (e) => {
      assert.ok(e instanceof LavaError);
      assert.equal(e.status, 500);
      assert.equal(e.requestId, REQUEST_ID);
      assert.match(e.message, /^lava\.top 500: \{"error":"Something went wrong"/);
      assert.ok(e.message.endsWith(`[x-request-id ${REQUEST_ID}]`));
      return true;
    });
    assert.equal(calls.length, 1, "a POST without an idempotency key is never retried");

    assert.equal(errors.length, 1);
    const line = errors[0];
    assert.ok(line.startsWith("[lava] invoice refused:"), line);
    for (const expected of [
      `"orderId":"${INPUT.orderId}"`,
      '"paymentProvider":"UNLIMINT"',
      '"paymentMethod":"CARD"',
      '"buyerLanguage":"RU"',
      '"currency":"USD"',
      '"amount":5',
      `"successUrl":"${INPUT.successUrl}"`,
      `"failUrl":"${INPUT.failUrl}"`,
      '"email":"*@kovra.test"',
      '"offerId":"0a1b2c3d…"',
      "Something went wrong",
      REQUEST_ID,
    ]) {
      assert.ok(line.includes(expected), `${expected} missing from: ${line}`);
    }
    assert.ok(!line.includes(API_KEY), "the API key never reaches the log");
    assert.ok(!line.includes("receipts@"), "the buyer's address never reaches the log");
    assert.ok(!line.includes(process.env.LAVA_OFFER_ID), "the full offer id is not logged");
  });

  test("no request id header: requestId is null and the message is the old one", async () => {
    answers = [() => refused(502, { error: "bad gateway" })];
    await assert.rejects(createInvoice(INPUT), (e) => {
      assert.ok(e instanceof LavaError);
      assert.equal(e.requestId, null);
      assert.equal(e.message, 'lava.top 502: {"error":"bad gateway"}');
      return true;
    });
    assert.equal(errors.length, 1);
  });

  test("a request id that is not an id is dropped, not logged", async () => {
    const odd = "<script>alert(1)</script>";
    answers = [() => refused(500, THEIR_500, { "x-request-id": odd })];
    await assert.rejects(createInvoice(INPUT), (e) => e instanceof LavaError && e.requestId === null);
    assert.equal(errors.length, 1);
    assert.ok(!errors[0].includes(odd));
  });

  test("400 about the buyer's address: one retry with the fallback address, nothing logged as refused", async () => {
    answers = [() => refused(400, { error: "Incorrect email to purchase" }), created];
    const r = await createInvoice({ ...INPUT, email: "buyer@kovra.test" });
    assert.equal(r.contractId, CONTRACT);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.email, "buyer@kovra.test");
    assert.equal(calls[1].body.email, "receipts@kovra.test");
    assert.deepEqual(errors, []);
  });

  test("any other 400: no retry, logged once with their text", async () => {
    answers = [() => refused(400, { error: "Restricted payment method type" })];
    await assert.rejects(createInvoice(INPUT), (e) => e instanceof LavaError && e.status === 400);
    assert.equal(calls.length, 1);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("Restricted payment method type"));
  });

  test("a network failure is logged with its text and the same request summary", async () => {
    answers = [
      () => {
        throw new TypeError("fetch failed");
      },
    ];
    await assert.rejects(createInvoice(INPUT), (e) => e instanceof TypeError && e.message === "fetch failed");
    assert.equal(calls.length, 1);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("fetch failed"));
    assert.ok(errors[0].includes(`"orderId":"${INPUT.orderId}"`));
  });

  test("a contract on a different total is refused after the POST and not logged as a gateway refusal", async () => {
    answers = [() => created({ amountTotal: { amount: 9.99, currency: "USD" } })];
    await assert.rejects(createInvoice(INPUT), /9\.99 вместо 5/);
    assert.equal(calls.length, 1);
    assert.deepEqual(errors, []);
  });
});
