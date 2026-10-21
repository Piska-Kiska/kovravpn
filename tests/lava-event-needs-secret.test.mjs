// tests/lava-event-needs-secret.test.mjs — run: npm test
//
// A success their API does not confirm is credited on the event itself only
// when the event carried our webhook secret (route.ts, 22.10.2026). Without a
// secret in the environment every request passes as "unconfigured", so the
// body could be anyone's: the event alone credits nothing and the old way
// stays — a retry and a message to the admin that names the reason.
//
// Its own file because lib/lava.ts reads the secret once, when it is imported.

import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.LAVA_API_KEY = ["test", "lava", "key"].join("-");
process.env.LAVA_OFFER_ID = "0a1b2c3d-0000-4000-8000-00000000000f";
process.env.LAVA_BUYER_EMAIL = "receipts@kovra.test";
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
delete process.env.LAVA_WEBHOOK_API_KEY;
delete process.env.LAVA_WEBHOOK_BASIC_USER;
delete process.env.LAVA_WEBHOOK_BASIC_PASSWORD;
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { ADMIN_TG_ID } = await import("../src/lib/bot-owner.ts");
const { POST } = await import("../src/app/api/payment/lava-webhook/route.ts");

const USER = "tg_100000001";
const CONTRACT = "0a1b2c3d-0000-4000-8000-0000000000a1";
const ORDER = `topup_${USER}_1790000000001`;

let messages;
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  messages = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.telegram.org/")) {
      messages.push(init.body ? JSON.parse(init.body) : {});
      return Response.json({ ok: true, result: { message_id: 1 } });
    }
    if (u.startsWith("https://gate.lava.top/api/v2/invoices?")) return Response.json({ items: [], total: 0 });
    if (u.startsWith("https://gate.lava.top/api/v2/invoices/")) return new Response("{}", { status: 404 });
    throw new Error(`unexpected fetch in test: ${u}`);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("without a webhook secret the event alone credits nothing", async () => {
  mem.store.set(`store:lava:contract:${CONTRACT}`, ORDER);
  mem.store.set(
    `lava_charge:${CONTRACT}`,
    JSON.stringify({ orderId: ORDER, userId: USER, currency: "USD", amount: 5, priceUsd: 5, label: "top-up", createdAt: 1 }),
  );
  const res = await POST(
    new NextRequest("https://kovra.test/api/payment/lava-webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType: "payment.success", contractId: CONTRACT, status: "completed", amount: 5, currency: "USD" }),
    }),
  );
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "contract_not_visible" });
  assert.equal(Number(mem.store.get(`balance_usd:${USER}`) ?? 0), 0);
  assert.equal(mem.store.has(`lava_payment_done:${CONTRACT}:payment.success`), false);
  const alerts = messages.filter((m) => String(m.chat_id) === ADMIN_TG_ID).map((m) => m.text);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /секрет вебхука не задан \(LAVA_WEBHOOK_API_KEY\)/);
});
