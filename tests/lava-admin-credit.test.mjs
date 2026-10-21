// tests/lava-admin-credit.test.mjs — run: npm test
//
// 22.10.2026: a top-up was paid through lava.top, their `payment.success`
// came at once, their API showed the contract neither by id nor in the list,
// and the owner had to wait for lava.top to repeat the event while the money
// was already taken. Now the alert carries "✅ Зачислить сейчас" and the admin
// chat takes `lava <contract id>`: both build a success event from OUR record
// of the charge and hand it to the webhook handler as a trusted caller
// (lib/lava-admin-credit.ts), so the credit goes through the one money path
// and lava.top's later repeat is a duplicate. Their FAILED is not overruled;
// what lava.top sent is kept as evidence (lib/lava-pending.ts) and shown to
// the admin with the outcome.
//
// Runs against an in-memory Redis; fetch is stubbed for lava.top and
// Telegram. Keys and ids are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const HOOK_KEY = ["test", "lava", "hook"].join("-");
process.env.LAVA_API_KEY = ["test", "lava", "key"].join("-");
process.env.LAVA_OFFER_ID = "0a1b2c3d-0000-4000-8000-00000000000f";
process.env.LAVA_BUYER_EMAIL = "receipts@kovra.test";
process.env.LAVA_WEBHOOK_API_KEY = HOOK_KEY;
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
delete process.env.LAVA_WEBHOOK_BASIC_USER;
delete process.env.LAVA_WEBHOOK_BASIC_PASSWORD;
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { ADMIN_TG_ID } = await import("../src/lib/bot-owner.ts");
const { POST } = await import("../src/app/api/payment/lava-webhook/route.ts");
const { creditLavaContractByAdmin } = await import("../src/lib/lava-admin-credit.ts");
const { tryHandleAdminText, tryHandleAdminCallback } = await import("../src/lib/admin-bot.ts");

const ADMIN = Number(ADMIN_TG_ID);
const USER = "tg_100000001";
const CONTRACT = "0a1b2c3d-0000-4000-8000-0000000000a1";
const ORDER = `topup_${USER}_1790000000001`;
const DONE_KEY = `lava_payment_done:${CONTRACT}:payment.success`;
const PENDING_KEY = `lava_pending:${CONTRACT}`;
const BUTTON = `adm:lavaok:${CONTRACT}`;

const walletCents = () => Number(mem.store.get(`balance_usd:${USER}`) ?? 0);

function invoice(id = CONTRACT, over = {}) {
  return {
    id,
    status: "COMPLETED",
    receipt: { amount: 5, currency: "USD", fee: 0.4 },
    buyer: { email: "buyer@kovra.test" },
    clientUtm: { utm_source: "kovravpn", utm_medium: "checkout", utm_content: ORDER },
    ...over,
  };
}

/** What we write when the invoice is issued: the pointer and the expected sum. */
function issue(id = CONTRACT, { pointer = true, charge = true } = {}) {
  if (pointer) mem.store.set(`store:lava:contract:${id}`, ORDER);
  if (charge) {
    mem.store.set(
      `lava_charge:${id}`,
      JSON.stringify({ orderId: ORDER, userId: USER, currency: "USD", amount: 5, priceUsd: 5, label: "top-up", createdAt: 1 }),
    );
  }
}

let lava;
let messages;
const adminMessages = () => messages.filter((m) => String(m.chat_id) === ADMIN_TG_ID);
const adminAlerts = () => adminMessages().map((m) => m.text);
const buttonsOf = (m) => (m.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.callback_data);
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  messages = [];
  lava = { byId: () => new Response("{}", { status: 404 }), list: () => Response.json({ items: [], total: 0 }), byIdCalls: 0 };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.telegram.org/")) {
      messages.push(init.body ? JSON.parse(init.body) : {});
      return Response.json({ ok: true, result: { message_id: 1 } });
    }
    if (u.startsWith("https://gate.lava.top/api/v2/invoices?")) return lava.list(new URL(u));
    if (u.startsWith("https://gate.lava.top/api/v2/invoices/")) {
      lava.byIdCalls += 1;
      return lava.byId(u.slice("https://gate.lava.top/api/v2/invoices/".length));
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** lava.top delivers an event with our webhook secret. */
function deliver(over = {}) {
  return POST(
    new NextRequest("https://kovra.test/api/payment/lava-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": HOOK_KEY },
      body: JSON.stringify({ eventType: "payment.success", contractId: CONTRACT, status: "completed", amount: 5, currency: "USD", ...over }),
    }),
  );
}

/** An event the event-only path refuses: it names no sum. JSON drops undefined. */
const NO_SUM = { amount: undefined, currency: undefined };

/** A paid contract their API does not show and the event cannot credit: the 22.10 case. */
async function stuck() {
  issue();
  const res = await deliver(NO_SUM);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: "contract_not_visible" });
  assert.equal(walletCents(), 0);
  assert.equal(mem.store.has(DONE_KEY), false, "the key is released for lava's repeat");
}

describe("a paid contract their API does not show", () => {
  test("the alert carries the credit button and the event is kept as evidence", async () => {
    await stuck();
    const alert = adminMessages().find((m) => m.text.includes("их API счёт не показывает"));
    assert.ok(alert, "the admin is told");
    assert.deepEqual(buttonsOf(alert), [BUTTON]);
    assert.match(alert.text, /кнопка ниже/);
    assert.match(alert.text, /нет суммы или валюты/);

    const pending = JSON.parse(mem.store.get(PENDING_KEY));
    assert.equal(pending.auth, "ok");
    assert.match(pending.reason, /нет суммы или валюты/);
    assert.equal(pending.amount, null);
    assert.equal(pending.eventStatus, "completed");
    assert.equal(mem.ttls.get(PENDING_KEY).ex, 7 * 86_400);
  });

  test("evidence storage failing changes nothing for lava.top", async () => {
    issue();
    mem.failNext("set", { key: PENDING_KEY });
    const res = await deliver(NO_SUM);
    assert.equal(res.status, 503);
    assert.equal(mem.store.has(PENDING_KEY), false);
    const alert = adminMessages().find((m) => m.text.includes("их API счёт не показывает"));
    assert.deepEqual(buttonsOf(alert), [BUTTON]);
  });

  test("`lava <id>` credits from our record, holds the key, forgets the evidence; lava's repeat is a duplicate", async () => {
    await stuck();
    messages = [];

    const text = await creditLavaContractByAdmin(CONTRACT);
    assert.match(text, /Кошелёк пополнен/);
    assert.match(text, /\$5\.00/);
    assert.match(text, /Событие lava: .* статус <code>completed<\/code>/);
    assert.match(text, /нет суммы или валюты/);
    assert.equal(walletCents(), 500);
    assert.equal(mem.store.has(DONE_KEY), true, "the dedup key stays held");
    assert.equal(mem.store.has(PENDING_KEY), false, "the evidence has served");
    assert.equal(adminAlerts().filter((t) => t.includes("по слову админа")).length, 1);

    const res = await deliver();
    assert.deepEqual(await res.json(), { ok: true, ignored: "duplicate" });
    assert.equal(walletCents(), 500);
  });

  test("the button under the alert does the same through the admin bot", async () => {
    await stuck();
    const sends = [];
    const send = async (chatId, text, kb) => {
      sends.push({ chatId, text, kb });
    };
    const edit = async () => {
      throw new Error("the alert is not edited");
    };
    assert.equal(await tryHandleAdminCallback(ADMIN, 10, BUTTON, send, edit), true);
    assert.equal(sends.length, 1);
    assert.equal(sends[0].chatId, ADMIN);
    assert.match(sends[0].text, /Кошелёк пополнен/);
    assert.equal(walletCents(), 500);
  });

  test("the text command: admin only; the slash and the case do not matter", async () => {
    await stuck();
    const sends = [];
    const send = async (chatId, text) => {
      sends.push({ chatId, text });
    };
    assert.equal(await tryHandleAdminText(ADMIN + 1, `lava ${CONTRACT}`, send), false);
    assert.equal(sends.length, 0);
    assert.equal(walletCents(), 0);

    assert.equal(await tryHandleAdminText(ADMIN, `/LAVA ${CONTRACT.toUpperCase()} `, send), true);
    assert.equal(sends.length, 1);
    assert.match(sends[0].text, /Кошелёк пополнен/);
    assert.equal(walletCents(), 500);
  });

  test("the admin cannot credit twice", async () => {
    await stuck();
    await creditLavaContractByAdmin(CONTRACT);
    const text = await creditLavaContractByAdmin(CONTRACT);
    assert.match(text, /Уже зачислено раньше/);
    assert.match(text, /в памяти нет/);
    assert.equal(walletCents(), 500);
  });
});

describe("the admin's word is not a payment", () => {
  test("a contract already credited on the event: nothing twice", async () => {
    issue();
    assert.deepEqual(await (await deliver()).json(), { ok: true, status: "credited" });
    const text = await creditLavaContractByAdmin(CONTRACT);
    assert.match(text, /Уже зачислено раньше/);
    assert.equal(walletCents(), 500);
  });

  test("a contract we did not issue: refused before the money path", async () => {
    const text = await creditLavaContractByAdmin(CONTRACT);
    assert.match(text, /Контракт мы не выставляли/);
    assert.equal(walletCents(), 0);
    assert.equal(mem.store.has(DONE_KEY), false);
    assert.equal(lava.byIdCalls, 0);
  });

  test("their API says FAILED: not overruled, and the admin's event is not kept as evidence", async () => {
    issue();
    lava.byId = () => Response.json(invoice(CONTRACT, { status: "FAILED" }));
    const text = await creditLavaContractByAdmin(CONTRACT);
    assert.match(text, /Не зачислено/);
    assert.match(text, /FAILED/);
    assert.equal(walletCents(), 0);
    assert.equal(mem.store.has(DONE_KEY), false, "released: lava may still repeat");
    assert.equal(mem.store.has(PENDING_KEY), false);
  });

  test("a pointer without a record of the sum: refused with the reason", async () => {
    issue(CONTRACT, { charge: false });
    const text = await creditLavaContractByAdmin(CONTRACT);
    assert.match(text, /Не зачислено/);
    assert.match(text, /нет нашей записи о сумме/);
    assert.equal(walletCents(), 0);
    assert.equal(mem.store.has(PENDING_KEY), false, "the admin's own event is not evidence");
  });

  test("their API confirms COMPLETED: credited as any event would be", async () => {
    issue();
    lava.byId = () => Response.json(invoice());
    const text = await creditLavaContractByAdmin(CONTRACT);
    assert.match(text, /Кошелёк пополнен/);
    assert.equal(walletCents(), 500);
    assert.equal(adminAlerts().filter((t) => t.includes("по слову админа")).length, 0, "their API confirmed it, no proof line");
  });

  test("not a contract id", async () => {
    assert.match(await creditLavaContractByAdmin("nope"), /не номер контракта/);
    assert.match(await creditLavaContractByAdmin(""), /не номер контракта/);
    assert.equal(walletCents(), 0);
  });
});

describe("their status lags behind the event", () => {
  test("the lag alert carries the credit button and the evidence names their status", async () => {
    issue();
    lava.byId = () => Response.json(invoice(CONTRACT, { status: "IN_PROGRESS" }));
    let alert;
    for (let i = 0; i < 10 && alert === undefined; i += 1) {
      const res = await deliver(NO_SUM);
      assert.equal(res.status, 503);
      alert = adminMessages().find((m) => m.text.includes("платёж есть, подтверждения нет"));
    }
    assert.ok(alert, "the admin hears of the lag");
    assert.deepEqual(buttonsOf(alert), [BUTTON]);
    assert.match(JSON.parse(mem.store.get(PENDING_KEY)).reason, /их статус IN_PROGRESS/);
    assert.equal(walletCents(), 0);

    const text = await creditLavaContractByAdmin(CONTRACT);
    assert.match(text, /Кошелёк пополнен/);
    assert.match(text, /их статус IN_PROGRESS/);
    assert.equal(walletCents(), 500);
    assert.equal(mem.store.has(PENDING_KEY), false);
  });
});
