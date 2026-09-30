// tests/bot-invoice-rate.test.mjs — run: npm test
//
// KP-13: in the old bot interface every tap on a top-up amount created a real
// invoice at the provider (and, for Cashera and lava, a Redis record), with
// no rate limit: checkRateLimit was imported and never called. It now shares
// bot v2's budget (INVOICES_PER_MINUTE per user and minute).
//
// The Telegram webhook runs end to end against an in-memory Redis; fetch is
// stubbed: Telegram calls are recorded, NOWPayments answers with an invoice.
// Ids, keys and secrets are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const SECRET = ["kovra", "invoice", "rate", "secret"].join("-");
process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
process.env.NOWPAYMENTS_API_KEY = ["test", "nowpayments", "key"].join("-");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { POST } = await import("../src/app/api/auth/telegram/webhook/route.ts");
const { INVOICES_PER_MINUTE } = await import("../src/lib/bot-v2/controller.ts");
const { t } = await import("../src/lib/bot-i18n.ts");

const CHAT = 100000001;
const USER = `tg_${CHAT}`;

let tgCalls;
let invoices;
let updateSeq = 3000;
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  tgCalls = [];
  invoices = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.nowpayments.io/v1/invoice")) {
      invoices += 1;
      return Response.json({ id: 7000 + invoices, invoice_url: `https://nowpayments.io/payment/?iid=${7000 + invoices}` });
    }
    if (u.startsWith("https://api.telegram.org/")) {
      tgCalls.push({ method: u.split("/").pop(), body: init.body ? JSON.parse(init.body) : null });
      return Response.json({ ok: true, result: { message_id: 1 } });
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  };
  mem.store.set(`user:${USER}`, JSON.stringify({ authMethod: "telegram", createdAt: 1, telegramId: String(CHAT), lang: "en" }));
  mem.store.set(`account:${USER}`, JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 }));
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function tap(data) {
  const res = await POST(
    new NextRequest("https://kovra.test/api/auth/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
      body: JSON.stringify({
        update_id: updateSeq++,
        callback_query: {
          id: String(9_100_000 + updateSeq),
          from: { id: CHAT, first_name: "Test", language_code: "en" },
          message: { chat: { id: CHAT }, message_id: 42 },
          data,
        },
      }),
    }),
  );
  assert.equal(res.status, 200);
}

const lastEditText = () => tgCalls.filter((c) => c.method === "editMessageText").at(-1)?.body?.text ?? "";

describe("old bot interface: invoice creation is rate limited", () => {
  test(`${INVOICES_PER_MINUTE} invoices a minute, then no provider call`, async () => {
    for (let i = 0; i < INVOICES_PER_MINUTE; i += 1) await tap("tu_crypto_10");
    assert.equal(invoices, INVOICES_PER_MINUTE);
    await tap("tu_crypto_10");
    await tap("tu_crypto_25");
    assert.equal(invoices, INVOICES_PER_MINUTE, "no invoice past the limit");
    assert.equal(lastEditText(), t("topup.err", "en"));
  });

  test("the budget is shared with bot v2 (same key)", async () => {
    mem.store.set(`rl:bottopup:${USER}`, String(INVOICES_PER_MINUTE));
    await tap("tu_crypto_10");
    assert.equal(invoices, 0);
  });

  test("under the limit an invoice is created as before", async () => {
    await tap("tu_crypto_10");
    assert.equal(invoices, 1);
    assert.notEqual(lastEditText(), t("topup.err", "en"));
  });
});
