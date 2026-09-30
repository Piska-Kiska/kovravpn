// tests/wallet-topup.test.mjs — run: npm test
//
// Wallet top-ups (src/lib/wallet-topup.ts, POST /api/wallet/topup, GET
// /api/wallet) against an in-memory Redis and a stubbed fetch: the invoices
// carry a topup_ order id for the webhooks to credit, amounts are exact cents
// within the bot's limits, and the return address depends on where the
// person started (bot chat / site / Mini App). No request leaves the process.
//
// Values are made up; the provider tokens only need to be non-empty.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.CRYPTOBOT_API_TOKEN = ["0000", "test-cryptobot"].join(":");
process.env.NOWPAYMENTS_API_KEY = "test-nowpayments-key";
process.env.TELEGRAM_BOT_USERNAME = "KovraTest_bot";
process.env.NEXT_PUBLIC_SITE_URL = "https://kovra.test";
delete process.env.CASHERA_PAYMENT_METHOD;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { createSession } = await import("../src/lib/session.ts");
const topup = await import("../src/lib/wallet-topup.ts");
const { botUsername, botChatUrl, miniAppUrl, KOVRA_BOT_USERNAME_FALLBACK } = await import("../src/lib/bot-link.ts");
const { POST: topupPost } = await import("../src/app/api/wallet/topup/route.ts");
const { GET: walletGet } = await import("../src/app/api/wallet/route.ts");

const USER = "tg_100000001";

/** Captured provider calls: { url, body }. */
let calls = [];
let providerStatus = 200;
let cryptoBotUrl = "https://t.me/CryptoBot/app?startapp=invoice-IVtest";
const realFetch = globalThis.fetch;

function stubFetch() {
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    if (providerStatus !== 200) return new Response(JSON.stringify({ ok: false }), { status: providerStatus });
    if (String(url).startsWith("https://pay.crypt.bot/api/createInvoice")) {
      return Response.json({
        ok: true,
        result: {
          invoice_id: 77,
          hash: "IVtest",
          bot_invoice_url: "https://t.me/CryptoBot?start=IVtest",
          mini_app_invoice_url: cryptoBotUrl,
          amount: body.amount,
          fiat: "USD",
          status: "active",
        },
      });
    }
    if (String(url).startsWith("https://api.nowpayments.io/v1/invoice")) {
      return Response.json({ id: 5555, invoice_url: "https://nowpayments.io/payment/?iid=5555" });
    }
    throw new Error(`unexpected fetch in test: ${url}`);
  };
}

let sid;
beforeEach(async () => {
  mem.reset();
  calls = [];
  providerStatus = 200;
  cryptoBotUrl = "https://t.me/CryptoBot/app?startapp=invoice-IVtest";
  stubFetch();
  sid = await createSession(USER, true);
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function post(body, { bearer = sid } = {}) {
  const headers = { "content-type": "application/json" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return new NextRequest("https://kovra.test/api/wallet/topup", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
async function callTopup(body, opts) {
  const res = await topupPost(post(body, opts));
  return { status: res.status, body: await res.json() };
}

describe("bot-link", () => {
  test("username from env, '@' stripped, junk falls back to Kovra's bot", () => {
    assert.equal(botUsername({ TELEGRAM_BOT_USERNAME: "@Some_bot" }), "Some_bot");
    assert.equal(botUsername({ NEXT_PUBLIC_BOT_USERNAME: "Other_bot" }), "Other_bot");
    assert.equal(botUsername({ TELEGRAM_BOT_USERNAME: "a b/c", NEXT_PUBLIC_BOT_USERNAME: "Other_bot" }), "Other_bot");
    assert.equal(botUsername({}), KOVRA_BOT_USERNAME_FALLBACK);
    assert.equal(KOVRA_BOT_USERNAME_FALLBACK.toLowerCase(), "kovravpn_bot");
  });

  test("links; payloads are checked", () => {
    const env = { TELEGRAM_BOT_USERNAME: "KovraTest_bot" };
    assert.equal(botChatUrl(undefined, env), "https://t.me/KovraTest_bot");
    assert.equal(botChatUrl("paid", env), "https://t.me/KovraTest_bot?start=paid");
    assert.equal(miniAppUrl("paid", env), "https://t.me/KovraTest_bot?startapp=paid");
    assert.equal(miniAppUrl(undefined, env), "https://t.me/KovraTest_bot?startapp");
    assert.throws(() => miniAppUrl("a&b=c", env), /invalid startapp payload/);
  });
});

describe("createWalletTopupInvoice", () => {
  test("bot return keeps the bot's own addresses (with Kovra's bot, not another)", async () => {
    const r = await topup.createWalletTopupInvoice({ userId: USER, method: "cryptobot", amountUsd: 10, returnTo: "bot" });
    assert.equal(r.ok, true);
    assert.equal(calls[0].body.paid_btn_url, "https://t.me/KovraTest_bot?start=paidcryptobot");

    const n = await topup.createWalletTopupInvoice({ userId: USER, method: "crypto", amountUsd: 10, returnTo: "bot" });
    assert.equal(n.ok, true);
    assert.equal(calls[1].body.success_url, "https://t.me/KovraTest_bot?start=paid");
  });

  test("amounts are exact cents within the per-method minimum and the maximum", async () => {
    const r = await topup.createWalletTopupInvoice({ userId: USER, method: "crypto", amountUsd: 12.345, returnTo: "web" });
    assert.equal(r.ok, true);
    assert.equal(r.amountCents, 1235);
    assert.equal(calls[0].body.price_amount, 12.35);

    for (const [method, amountUsd] of [["crypto", 7.99], ["cryptobot", 4.99], ["cryptobot", 1000.01], ["cryptobot", NaN], ["cryptobot", -5]]) {
      const bad = await topup.createWalletTopupInvoice({ userId: USER, method, amountUsd, returnTo: "web" });
      assert.equal(bad.ok, false, `${method} ${amountUsd}`);
      assert.equal(bad.error, "invalid_amount");
    }
    assert.equal(calls.length, 1, "no provider call for a bad amount");
  });

  test("a provider answering with a non-https URL is a provider error", async () => {
    cryptoBotUrl = "javascript:alert(1)";
    const r = await topup.createWalletTopupInvoice({ userId: USER, method: "cryptobot", amountUsd: 10, returnTo: "web" });
    assert.deepEqual(r, { ok: false, error: "provider_error" });
  });

  test("config lists every method with its minimum and whether it is configured", () => {
    const cfg = topup.walletTopupConfig();
    assert.equal(cfg.maxUsd, 1000);
    assert.deepEqual(cfg.quickUsd, [10, 20, 50, 100]);
    const byId = Object.fromEntries(cfg.methods.map((m) => [m.id, m]));
    assert.deepEqual(byId.cryptobot, { id: "cryptobot", minUsd: 5, enabled: true });
    assert.deepEqual(byId.crypto, { id: "crypto", minUsd: 8, enabled: true });
    assert.deepEqual(byId.card, { id: "card", minUsd: 5, enabled: false });
    assert.equal(byId.lava.minUsd, 5);
  });

  test("lava choices never offer a method that needs the buyer's full name", () => {
    const ids = topup.lavaTopupChoices(50, "EUR").map((c) => c.id);
    assert.ok(ids.includes("sepa"));
    assert.ok(!ids.includes("bancontact"));
  });
});

describe("POST /api/wallet/topup", () => {
  test("Mini App: CryptoBot invoice returns to the Mini App with startapp=paid", async () => {
    const r = await callTopup({ method: "cryptobot", amountUsd: 10, returnTo: "miniapp" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      ok: true,
      method: "cryptobot",
      amountUsd: 10,
      amountCents: 1000,
      payUrl: "https://t.me/CryptoBot/app?startapp=invoice-IVtest",
      chargeLabel: "$10.00",
    });
    const sent = calls[0].body;
    assert.equal(sent.paid_btn_url, "https://t.me/KovraTest_bot?startapp=paid");
    assert.equal(sent.amount, "10.00");
    const payload = JSON.parse(sent.payload);
    assert.equal(payload.userId, USER);
    assert.match(payload.orderId, new RegExp(`^topup_${USER}_\\d+$`));
  });

  test("web: NOWPayments invoice returns to /dashboard?paid=1 with a topup_ order id", async () => {
    const r = await callTopup({ method: "crypto", amountUsd: 25, returnTo: "web" });
    assert.equal(r.status, 200);
    const sent = calls[0].body;
    assert.equal(sent.success_url, "https://kovra.test/dashboard?paid=1");
    assert.equal(sent.cancel_url, "https://kovra.test/dashboard");
    assert.match(sent.order_id, new RegExp(`^topup_${USER}_\\d+$`));
    assert.equal(sent.price_amount, 25);
    assert.equal(sent.ipn_callback_url, "https://kovra.test/api/payment/crypto-webhook");
  });

  test("Mini App: NOWPayments cancel reopens the Mini App without a parameter", async () => {
    await callTopup({ method: "crypto", amountUsd: 25, returnTo: "miniapp" });
    assert.equal(calls[0].body.success_url, "https://t.me/KovraTest_bot?startapp=paid");
    assert.equal(calls[0].body.cancel_url, "https://t.me/KovraTest_bot?startapp");
  });

  test("lines without keys answer 503 and call nobody", async () => {
    assert.deepEqual(await callTopup({ method: "card", amountUsd: 10, returnTo: "web" }), {
      status: 503,
      body: { ok: false, error: "unavailable" },
    });
    assert.equal((await callTopup({ method: "lava", amountUsd: 10, returnTo: "web", lavaMethod: "card" })).status, 503);
    assert.equal(calls.length, 0);
  });

  test("provider failure: 502", async () => {
    providerStatus = 500;
    const r = await callTopup({ method: "cryptobot", amountUsd: 10, returnTo: "web" });
    assert.deepEqual(r, { status: 502, body: { ok: false, error: "provider_error" } });
  });

  test("bad requests: 400 and no provider call", async () => {
    const cases = [
      ["{nope", "invalid_request"],
      [[], "invalid_request"],
      [{ method: "paypal", amountUsd: 10, returnTo: "web" }, "invalid_method"],
      [{ method: "cryptobot", amountUsd: 10 }, "invalid_request"],
      [{ method: "cryptobot", amountUsd: 10, returnTo: "bot" }, "invalid_request"],
      [{ method: "cryptobot", amountUsd: "10", returnTo: "web" }, "invalid_amount"],
      [{ method: "cryptobot", amountUsd: 4, returnTo: "web" }, "invalid_amount"],
      [{ method: "cryptobot", amountUsd: 5000, returnTo: "web" }, "invalid_amount"],
      [{ method: "lava", amountUsd: 10, returnTo: "web", lavaMethod: "cash" }, "invalid_method"],
      [{ method: "lava", amountUsd: 10, returnTo: "web", lavaCurrency: "RUB" }, "invalid_method"],
    ];
    for (const [body, error] of cases) {
      const r = await callTopup(body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.error, error, JSON.stringify(body));
    }
    // Ten calls used the per-user budget; start a fresh window for the last one.
    for (const k of [...mem.store.keys()]) if (k.startsWith("rl:")) mem.store.delete(k);
    const low = await callTopup({ method: "crypto", amountUsd: 5, returnTo: "web" });
    assert.equal(low.body.minUsd, 8);
    assert.equal(low.body.maxUsd, 1000);
    assert.equal(calls.length, 0);
  });

  test("no session: 401; rate limited per user: 429", async () => {
    assert.equal((await callTopup({ method: "cryptobot", amountUsd: 10, returnTo: "web" }, { bearer: null })).status, 401);
    for (let i = 0; i < 10; i++) await callTopup({ method: "cryptobot", amountUsd: 10, returnTo: "web" });
    assert.equal((await callTopup({ method: "cryptobot", amountUsd: 10, returnTo: "web" })).status, 429);
  });
});

describe("GET /api/wallet", () => {
  test("balance in cents and the top-up form config", async () => {
    mem.store.set(`balance_usd:${USER}`, "4321");
    const res = await walletGet(
      new NextRequest("https://kovra.test/api/wallet", { headers: { authorization: `Bearer ${sid}` } }),
    );
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.equal(body.balanceUsdCents, 4321);
    assert.equal(body.topup.maxUsd, 1000);
    assert.equal(body.topup.methods.length, 4);
  });

  test("no session: 401", async () => {
    const res = await walletGet(new NextRequest("https://kovra.test/api/wallet"));
    assert.equal(res.status, 401);
  });
});
