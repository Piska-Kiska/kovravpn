// tests/lava-unknown-contract.test.mjs — run: npm test
//
// On 11–12.10.2026 lava.top's lookup by id (GET /api/v2/invoices/{id}) answered
// 404 for contracts whose `payment.success` their own sender had just
// delivered. The webhook read a 404 as "not our contract" and confirmed the
// event with 200; lava.top never repeats a confirmed event, so the payment was
// dropped, the dedup key stayed held and nobody was told (seen on ProxysVPN,
// which shares this code path).
//
// Now a 404 by id is not a verdict on the payment:
//   • a success is looked up in the list of executed contracts of the same key
//     and handled as usual when found there; the admin hears of it once a day;
//   • a contract we issued that neither read shows is answered 503 with the
//     key released, so lava.top repeats the event, and the admin is told once;
//   • a contract that is not ours is confirmed as before, with the key released.
//
// Since 22.10.2026 a success their API does not confirm is credited on the
// event itself when the event carried our webhook secret, the contract is
// ours and the sum is the one we recorded (lib/lava-lookup.ts, paidByEvent).
// The cases above that expect a retry send an event that fails that check.
//
// POST (src/app/api/payment/lava-webhook/route.ts) runs against an in-memory
// Redis; fetch is stubbed for lava.top and Telegram. Keys and ids are made up.

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
const { findCompletedInvoice, listCompletedInvoices } = await import("../src/lib/lava.ts");
const { listDate, paidByEvent, readCompletedPage } = await import("../src/lib/lava-lookup.ts");
const { POST } = await import("../src/app/api/payment/lava-webhook/route.ts");

const USER = "tg_100000001";
const CONTRACT = "0a1b2c3d-0000-4000-8000-0000000000a1";
const OTHER = "0a1b2c3d-0000-4000-8000-0000000000b2";
const ORDER = `topup_${USER}_1790000000001`;
const DONE_KEY = `lava_payment_done:${CONTRACT}:payment.success`;

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

/** Their API in this test: what the lookup by id and the list answer. */
let lava;
let messages;
const adminAlerts = () => messages.filter((m) => String(m.chat_id) === ADMIN_TG_ID).map((m) => m.text);
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  messages = [];
  lava = { byId: () => new Response("{}", { status: 404 }), list: () => Response.json({ items: [], total: 0 }), byIdCalls: 0, listCalls: 0 };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.telegram.org/")) {
      messages.push(init.body ? JSON.parse(init.body) : {});
      return Response.json({ ok: true, result: { message_id: 1 } });
    }
    if (u.startsWith("https://gate.lava.top/api/v2/invoices?")) {
      lava.listCalls += 1;
      return lava.list(new URL(u));
    }
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

function deliver(contractId = CONTRACT, eventType = "payment.success", over = {}) {
  return POST(
    new NextRequest("https://kovra.test/api/payment/lava-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": HOOK_KEY },
      body: JSON.stringify({ eventType, contractId, status: "completed", amount: 5, currency: "USD", ...over }),
    }),
  );
}

/** An event the event-only path refuses: its sum is not the one we recorded. */
const OFF_SUM = { amount: 4 };

describe("their lookup by id answers 404 for a paid contract", () => {
  test("the contract is taken from the list and credited; the admin hears of the lookup once", async () => {
    issue();
    lava.list = () => Response.json({ items: [invoice()], total: 1 });

    const res = await deliver();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, status: "credited" });
    assert.equal(walletCents(), 500);
    assert.deepEqual([lava.byIdCalls, lava.listCalls], [1, 1]);
    const alerts = adminAlerts();
    assert.equal(alerts.filter((t) => t.includes("взят из списка")).length, 1);
    assert.equal(alerts.filter((t) => t.includes("пополнение кошелька через lava.top")).length, 1);

    // A second paid contract the same day: credited, and no second note.
    issue(OTHER);
    lava.list = () => Response.json({ items: [invoice(), invoice(OTHER)], total: 2 });
    assert.deepEqual(await (await deliver(OTHER)).json(), { ok: true, status: "credited" });
    assert.equal(walletCents(), 1000);
    assert.equal(adminAlerts().filter((t) => t.includes("взят из списка")).length, 1);
  });

  test("the same event again is a duplicate and credits nothing", async () => {
    issue();
    lava.list = () => Response.json({ items: [invoice()], total: 1 });
    await deliver();
    const again = await deliver();
    assert.deepEqual(await again.json(), { ok: true, ignored: "duplicate" });
    assert.equal(walletCents(), 500);
  });

  test("a status in lower case in the list is still an executed contract", async () => {
    issue();
    lava.list = () => Response.json([invoice(CONTRACT, { status: "completed" })]);
    assert.deepEqual(await (await deliver()).json(), { ok: true, status: "credited" });
    assert.equal(walletCents(), 500);
  });

  test("our contract that neither read shows asks for a retry, frees the key and tells the admin once", async () => {
    issue();

    const first = await deliver(CONTRACT, "payment.success", OFF_SUM);
    assert.equal(first.status, 503);
    assert.deepEqual(await first.json(), { error: "contract_not_visible" });
    assert.equal(walletCents(), 0);
    assert.equal(mem.store.has(DONE_KEY), false, "a held key would turn the retry into a duplicate");
    assert.equal(adminAlerts().length, 1);
    assert.match(adminAlerts()[0], /оплата пришла, а их API счёт не показывает/);
    assert.match(adminAlerts()[0], new RegExp(CONTRACT));
    assert.match(adminAlerts()[0], /По самому событию не зачислено: в событии 4 USD, а счёт был на 5 USD/);

    // lava.top repeats the event: the same answer, and no second message.
    assert.equal((await deliver(CONTRACT, "payment.success", OFF_SUM)).status, 503);
    assert.equal(adminAlerts().length, 1);

    // Their list catches up: the repeat is credited exactly once.
    lava.list = () => Response.json({ items: [invoice()], total: 1 });
    assert.deepEqual(await (await deliver(CONTRACT, "payment.success", OFF_SUM)).json(), { ok: true, status: "credited" });
    assert.equal(walletCents(), 500);
  });

  test("a contract known only by its expected sum is ours too", async () => {
    issue(CONTRACT, { pointer: false });
    const res = await deliver(CONTRACT, "payment.success", OFF_SUM);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "contract_not_visible" });
    assert.equal(mem.store.has(DONE_KEY), false);
  });

  test("a contract that is not ours is confirmed in silence and its key is released", async () => {
    const res = await deliver();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, ignored: "unknown contract" });
    assert.equal(mem.store.has(DONE_KEY), false, "nothing was done, so a resend must not be a duplicate");
    assert.deepEqual(adminAlerts(), []);
    assert.equal(walletCents(), 0);
  });

  test("a failed payment is not looked up in the list and is confirmed", async () => {
    issue();
    const res = await deliver(CONTRACT, "payment.failed");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, ignored: "unknown contract" });
    assert.equal(lava.listCalls, 0);
    assert.deepEqual(adminAlerts(), []);
  });

  test("a list that cannot be read asks for a retry and frees the key", async () => {
    issue();
    lava.list = () => Response.json({ error: "Forbidden" }, { status: 403 });
    const res = await deliver(CONTRACT, "payment.success", OFF_SUM);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "upstream_unavailable" });
    assert.equal(mem.store.has(DONE_KEY), false);
    assert.equal(walletCents(), 0);
  });

  test("a list answer with no list in it is a failed read, not an unknown contract", async () => {
    issue();
    lava.list = () => Response.json({ message: "ok" });
    const res = await deliver(CONTRACT, "payment.success", OFF_SUM);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "upstream_unavailable" });
  });

  test("Redis failing while we look for our own record asks for a retry, never 'unknown'", async () => {
    issue();
    mem.failNext("get", { key: `store:lava:contract:${CONTRACT}` });
    const res = await deliver();
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "storage_unavailable" });
    assert.equal(mem.store.has(DONE_KEY), false);
    assert.deepEqual(adminAlerts(), []);
  });

  test("a contract in the list that belongs to another project is not credited here", async () => {
    issue();
    lava.list = () =>
      Response.json({ items: [invoice(CONTRACT, { clientUtm: { utm_source: "proxysvpn", utm_content: ORDER } })], total: 1 });
    const res = await deliver();
    assert.deepEqual(await res.json(), { ok: true, ignored: "another project" });
    assert.equal(walletCents(), 0);
  });

  test("a sum in the list that differs from the invoice is refused as before", async () => {
    issue();
    lava.list = () => Response.json({ items: [invoice(CONTRACT, { receipt: { amount: 1, currency: "USD" } })], total: 1 });
    const res = await deliver();
    assert.deepEqual(await res.json(), { ok: true, status: "amount_mismatch" });
    assert.equal(walletCents(), 0);
  });
});

describe("their lookup by id works", () => {
  test("the contract is credited without a read of the list and without the note", async () => {
    issue();
    lava.byId = () => Response.json(invoice());
    const res = await deliver();
    assert.deepEqual(await res.json(), { ok: true, status: "credited" });
    assert.equal(walletCents(), 500);
    assert.equal(lava.listCalls, 0);
    assert.equal(adminAlerts().filter((t) => t.includes("взят из списка")).length, 0);
  });
});

describe("the list of executed contracts", () => {
  test("asks for the window without milliseconds and reads pages until one brings nothing new", async () => {
    const asked = [];
    lava.list = (url) => {
      asked.push(url);
      const page = Number(url.searchParams.get("page"));
      // No `total`: the end is a page with no new contract.
      if (page === 1) return Response.json({ items: [invoice(CONTRACT), invoice(OTHER, { status: "FAILED" })] });
      return Response.json({ items: [invoice(CONTRACT)] });
    };
    const begin = Date.UTC(2026, 9, 10, 0, 0, 0, 123);
    const end = Date.UTC(2026, 9, 12, 12, 28, 21, 851);
    const list = await listCompletedInvoices(begin, end);
    assert.deepEqual(list.items.map((i) => i.id), [CONTRACT]);
    assert.equal(list.truncated, false);
    assert.equal(asked.length, 2);
    assert.equal(asked[0].searchParams.get("beginDate"), "2026-10-10T00:00:00Z");
    assert.equal(asked[0].searchParams.get("endDate"), "2026-10-12T12:28:21Z");
    assert.equal(asked[0].searchParams.get("size"), "100");
  });

  test("stops at their total", async () => {
    lava.list = () => Response.json({ items: [invoice(CONTRACT)], total: 1 });
    await listCompletedInvoices(1, 2_000_000);
    assert.equal(lava.listCalls, 1);
  });

  test("reports a window longer than it reads as truncated", async () => {
    let n = 0;
    lava.list = () => {
      n += 1;
      const id = `0a1b2c3d-0000-4000-8000-${String(n).padStart(12, "0")}`;
      return Response.json({ items: [invoice(id)], total: 1000 });
    };
    const list = await listCompletedInvoices(1, 2_000_000);
    assert.equal(list.truncated, true);
    assert.equal(list.items.length, 10);
  });

  test("refuses a window that is not one and an id that is not one", async () => {
    await assert.rejects(listCompletedInvoices(5, 5), /invalid window/);
    await assert.rejects(listCompletedInvoices(Number.NaN, 5), /invalid window/);
    await assert.rejects(findCompletedInvoice("not-a-uuid"), /invalid contract id/);
    assert.equal(lava.listCalls, 0);
  });

  test("finds a contract by id, and gives null for one the window does not hold", async () => {
    lava.list = () => Response.json({ items: [invoice(CONTRACT)], total: 1 });
    assert.equal((await findCompletedInvoice(CONTRACT))?.id, CONTRACT);
    assert.equal(await findCompletedInvoice(OTHER), null);
  });

  test("a page is read whatever shape it comes in; no list at all is a broken read", () => {
    const seen = new Set();
    const page = readCompletedPage({ items: [null, "x", {}, { id: "nope", status: "COMPLETED" }, invoice(CONTRACT)], total: "5" }, seen);
    assert.deepEqual(page.completed.map((i) => i.id), [CONTRACT]);
    assert.equal(page.fresh, 1);
    assert.equal(page.rows, 5);
    assert.equal(page.total, null);
    assert.deepEqual(readCompletedPage([invoice(CONTRACT)], seen).completed, [], "seen on an earlier page");
    for (const raw of [null, undefined, {}, { items: "none" }, "ok", 42]) {
      assert.throws(() => readCompletedPage(raw, new Set()), /no items/);
    }
    assert.equal(listDate(0), "1970-01-01T00:00:00Z");
  });
});

describe("a success their API does not confirm is credited on the event (22.10.2026)", () => {
  const credited = () => adminAlerts().filter((t) => t.includes("пополнение кошелька через lava.top"));

  test("neither read shows the contract: credited at once, the admin's message says how, a repeat is a duplicate", async () => {
    issue();
    const res = await deliver();
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, status: "credited" });
    assert.equal(walletCents(), 500);
    assert.equal(mem.store.has(DONE_KEY), true, "the key stays held: a repeat must not credit twice");
    assert.equal(credited().length, 1);
    assert.match(credited()[0], /зачислено по событию lava: их API оплату не подтвердил \(unknown\)/);
    assert.equal(adminAlerts().filter((t) => t.includes("не показывает")).length, 0);

    assert.deepEqual(await (await deliver()).json(), { ok: true, ignored: "duplicate" });
    assert.equal(walletCents(), 500);
  });

  test("their API cannot be read at all: credited on the event", async () => {
    issue();
    lava.byId = () => Response.json({ error: "down" }, { status: 502 });
    assert.deepEqual(await (await deliver()).json(), { ok: true, status: "credited" });
    assert.equal(walletCents(), 500);
    assert.match(credited()[0], /\(failed\)/);
  });

  test("their API still says IN_PROGRESS: credited on the event instead of waiting", async () => {
    issue();
    lava.byId = () => Response.json(invoice(CONTRACT, { status: "IN_PROGRESS" }));
    assert.deepEqual(await (await deliver()).json(), { ok: true, status: "credited" });
    assert.equal(walletCents(), 500);
    assert.match(credited()[0], /\(IN_PROGRESS\)/);
  });

  test("their API says FAILED: the event does not overrule it", async () => {
    issue();
    lava.byId = () => Response.json(invoice(CONTRACT, { status: "FAILED" }));
    const res = await deliver();
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "status_lag", theirStatus: "FAILED" });
    assert.equal(walletCents(), 0);
    assert.equal(mem.store.has(DONE_KEY), false);
  });

  test("their API confirms: the event path is not taken and the message has no event line", async () => {
    issue();
    lava.byId = () => Response.json(invoice());
    assert.deepEqual(await (await deliver()).json(), { ok: true, status: "credited" });
    assert.doesNotMatch(credited()[0], /по событию/);
  });

  test("another currency or another sum in the event: nothing credited, a retry, the admin is told why", async () => {
    issue();
    const res = await deliver(CONTRACT, "payment.success", { currency: "EUR" });
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "contract_not_visible" });
    assert.equal(walletCents(), 0);
    assert.match(adminAlerts()[0], /в событии 5 EUR, а счёт был на 5 USD/);
  });

  test("a contract we did not issue is not credited on the event", async () => {
    const res = await deliver();
    assert.deepEqual(await res.json(), { ok: true, ignored: "unknown contract" });
    assert.equal(walletCents(), 0);
  });

  test("our pointer and our record naming different orders: nothing credited", async () => {
    issue();
    mem.store.set(`store:lava:contract:${CONTRACT}`, `topup_${USER}_1790000000999`);
    const res = await deliver();
    assert.equal(res.status, 503);
    assert.equal(walletCents(), 0);
    assert.match(adminAlerts()[0], /указатель и запись счёта называют разные заказы/);
  });

  test("a pointer without the record of the charge: nothing credited on the event", async () => {
    issue(CONTRACT, { charge: false });
    const res = await deliver();
    assert.equal(res.status, 503);
    assert.equal(walletCents(), 0);
    assert.match(adminAlerts()[0], /нет нашей записи о сумме счёта/);
  });

  test("Redis failing while the record is read asks for a retry and credits nothing", async () => {
    issue();
    mem.failNext("get", { key: `lava_charge:${CONTRACT}` });
    const res = await deliver();
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { error: "storage_unavailable" });
    assert.equal(walletCents(), 0);
    assert.equal(mem.store.has(DONE_KEY), false);
  });

  test("an event without our webhook secret never reaches the check", async () => {
    issue();
    const res = await POST(
      new NextRequest("https://kovra.test/api/payment/lava-webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": "wrong" },
        body: JSON.stringify({ eventType: "payment.success", contractId: CONTRACT, status: "completed", amount: 5, currency: "USD" }),
      }),
    );
    assert.equal(res.status, 401);
    assert.equal(walletCents(), 0);
  });

  test("paidByEvent: what an event must carry", () => {
    const rec = { amount: 5, currency: "USD" };
    const ev = { eventType: "payment.success", contractId: CONTRACT, status: "completed", amount: 5, currency: "USD" };
    assert.deepEqual(paidByEvent(ev, CONTRACT, rec), {
      kind: "paid",
      invoice: { id: CONTRACT, status: "COMPLETED", receipt: { amount: 5, currency: "USD" } },
    });
    // Spellings their sender might use.
    assert.equal(paidByEvent({ ...ev, status: "COMPLETED", amount: "5.00", currency: "usd" }, CONTRACT, rec).kind, "paid");
    assert.equal(paidByEvent({ ...ev, status: undefined }, CONTRACT, rec).kind, "paid");
    assert.equal(paidByEvent({ ...ev, amount: 5.004 }, CONTRACT, rec).kind, "paid");
    // Refusals, each with its reason.
    const why = (payload, recorded = rec) => {
      const proof = paidByEvent(payload, CONTRACT, recorded);
      return proof.kind === "refused" ? proof.reason : "paid";
    };
    assert.equal(why({ ...ev, eventType: "payment.failed" }), "это не событие об успешной оплате");
    assert.equal(why({ ...ev, contractId: OTHER }), "в теле события другой контракт");
    assert.equal(why({ ...ev, status: "failed" }), "статус в событии: failed");
    assert.equal(why({ ...ev, status: 7 }), "статус в событии: 7");
    assert.equal(why(ev, null), "нет нашей записи о сумме счёта");
    assert.equal(why(ev, { amount: "x", currency: "USD" }), "запись о сумме счёта повреждена");
    assert.equal(why(ev, { amount: 5, currency: "dollars" }), "запись о сумме счёта повреждена");
    for (const amount of [undefined, null, "", "abc", 0, -5, Number.NaN, Infinity]) {
      assert.equal(why({ ...ev, amount }), "в событии нет суммы или валюты", String(amount));
    }
    assert.equal(why({ ...ev, currency: "US" }), "в событии нет суммы или валюты");
    assert.equal(why({ ...ev, amount: 5.02 }), "в событии 5.02 USD, а счёт был на 5 USD");
    assert.equal(why({ ...ev, currency: "RUB" }), "в событии 5 RUB, а счёт был на 5 USD");
  });
});
