// tests/lava-buyer-email.test.mjs — run: npm test
//
// lava.top asked that every client pays with THEIR OWN e-mail. The shared
// LAVA_BUYER_EMAIL fallback is gone: createInvoice refuses a missing or bad
// address with a typed error, a gateway 400 about the e-mail is never retried
// with another address, the routes answer 400 {error: email_*}, the address is
// saved per account after an invoice, and both bots ask for it first.
//
// The lava hold was lifted on 17.11.2026 (`LAVA_ON_HOLD = false`), so the
// module is loaded as is. fetch is stubbed, Redis is in memory, keys and
// addresses are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.LAVA_API_KEY = ["test", "lava", "key"].join("-");
process.env.LAVA_OFFER_ID = "0a1b2c3d-0000-4000-8000-00000000000f";
// Still set in production at the time of writing: it must be refused as an answer.
process.env.LAVA_BUYER_EMAIL = "receipts@kovra.test";
delete process.env.LAVA_PAYMENT_PROVIDER;
delete process.env.LAVA_PAYMENT_METHOD;
process.env.NEXT_PUBLIC_SITE_URL = "https://kovra.test";
process.env.TELEGRAM_BOT_USERNAME = "KovraTest_bot";
const SECRET = ["kovra", "lava", "email", "secret"].join("-");
process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { createSession } = await import("../src/lib/session.ts");
const { createInvoice, LavaEmailError, lavaOffered } = await import("../src/lib/lava.ts");
const { checkPaymentEmail, maskEmail, isPaymentEmailCode } = await import("../src/lib/payment-email.ts");
const { readSavedPaymentEmail, defaultPaymentEmail } = await import("../src/lib/payment-email-store.ts");
const { POST: lavaPost } = await import("../src/app/api/subscribe/lava/route.ts");
const { POST: topupPost } = await import("../src/app/api/wallet/topup/route.ts");
const { POST: webhook } = await import("../src/app/api/auth/telegram/webhook/route.ts");
const { handleV2Callback, handleV2Reply } = await import("../src/lib/bot-v2/controller.ts");
const { cb } = await import("../src/lib/bot-v2/callbacks.ts");
const { t } = await import("../src/lib/bot-i18n.ts");
const { tr } = await import("../src/lib/bot-v2/i18n.ts");

const CHAT = 100000001;
const USER = `tg_${CHAT}`;
const CONTRACT = "0a1b2c3d-0000-4000-8000-0000000000a1";
const SHARED = "receipts@kovra.test";

/** lava.top requests: { url, body }. */
let lavaCalls;
/** Telegram requests: { method, body }. */
let tgCalls;
/** Next answers for lava, one factory each; the default is a created invoice. */
let lavaAnswers;
let logs;
let seq = 5000;
const realFetch = globalThis.fetch;
const realWarn = console.warn;
const realError = console.error;
const realInfo = console.info;

const created = (amount) => () =>
  Response.json(
    { id: CONTRACT, paymentUrl: `https://app.lava.top/pay/${CONTRACT}`, amountTotal: { amount, currency: "USD" } },
    { status: 201 },
  );
const refused400 = () => Response.json({ error: "Incorrect email to purchase" }, { status: 400 });

beforeEach(async () => {
  mem.reset();
  lavaCalls = [];
  tgCalls = [];
  lavaAnswers = [];
  logs = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://gate.lava.top/")) {
      const body = JSON.parse(init.body);
      lavaCalls.push({ url: u, body });
      const next = lavaAnswers.shift() ?? created(body.amount);
      return next();
    }
    if (u.startsWith("https://api.telegram.org/")) {
      tgCalls.push({ method: u.split("/").pop(), body: init.body ? JSON.parse(init.body) : null });
      return Response.json({ ok: true, result: { message_id: 1 } });
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  };
  const keep = (...p) => logs.push(p.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
  console.warn = keep;
  console.error = keep;
  console.info = keep;
  mem.store.set(`user:${USER}`, JSON.stringify({ authMethod: "telegram", createdAt: 1, telegramId: String(CHAT), lang: "en" }));
  mem.store.set(`account:${USER}`, JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 }));
});
afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
  console.error = realError;
  console.info = realInfo;
});

const INPUT = {
  orderId: "topup_tg_100000001_1790000000001",
  amount: 10,
  currency: "USD",
  methodId: "card",
  locale: "en",
  successUrl: "https://kovra.test/dashboard?paid=1",
  failUrl: "https://kovra.test/dashboard",
};

describe("checkPaymentEmail", () => {
  test("trims, keeps the local part, lower-cases the domain", () => {
    assert.deepEqual(checkPaymentEmail("  Buyer.Name@KOVRA.Test "), { ok: true, email: "Buyer.Name@kovra.test" });
  });

  test("missing: not a string, empty, blanks", () => {
    for (const v of [undefined, null, 5, {}, "", "   "]) {
      assert.deepEqual(checkPaymentEmail(v), { ok: false, code: "email_required" }, String(v));
    }
  });

  test("malformed: no @, no dot, spaces, two @, longer than 254", () => {
    for (const v of ["nope", "a@b", "a b@c.com", "a@@c.com", "@c.com", "a@c.", `${"a".repeat(250)}@x.com`]) {
      assert.deepEqual(checkPaymentEmail(v), { ok: false, code: "email_invalid" }, v);
    }
  });

  test("the old shared address is refused, in any case and with blanks", () => {
    for (const v of [SHARED, ` ${SHARED.toUpperCase()} `]) {
      assert.deepEqual(checkPaymentEmail(v), { ok: false, code: "email_rejected" }, v);
    }
  });

  test("masking keeps only the domain; codes are recognised", () => {
    assert.equal(maskEmail("buyer@kovra.test"), "*@kovra.test");
    assert.equal(maskEmail(undefined), "none");
    assert.ok(isPaymentEmailCode("email_rejected"));
    assert.ok(!isPaymentEmailCode("provider_error"));
  });
});

describe("createInvoice", () => {
  test("the line is configured without LAVA_BUYER_EMAIL", () => {
    assert.equal(lavaOffered, true, "lava.top is offered again (hold reopened 17.11.2026)");
  });

  test("no e-mail: email_required, nothing is sent, the shared address is never used", async () => {
    await assert.rejects(createInvoice(INPUT), (e) => e instanceof LavaEmailError && e.code === "email_required");
    assert.equal(lavaCalls.length, 0);
  });

  test("a bad e-mail: email_invalid, nothing is sent", async () => {
    await assert.rejects(createInvoice({ ...INPUT, email: "nope" }), (e) => e instanceof LavaEmailError && e.code === "email_invalid");
    assert.equal(lavaCalls.length, 0);
  });

  test("the shared address typed by a customer: email_rejected, nothing is sent", async () => {
    await assert.rejects(createInvoice({ ...INPUT, email: SHARED }), (e) => e instanceof LavaEmailError && e.code === "email_rejected");
    assert.equal(lavaCalls.length, 0);
  });

  test("the customer's address goes out, domain lower-cased, and the log never carries it", async () => {
    await createInvoice({ ...INPUT, email: "Buyer@KOVRA.test" });
    assert.equal(lavaCalls[0].body.email, "Buyer@kovra.test");
    assert.ok(!logs.join("\n").includes("Buyer@"), logs.join("\n"));
  });

  test("lava 400 about the e-mail: email_rejected, exactly one request, no retry on another address", async () => {
    lavaAnswers = [refused400];
    await assert.rejects(createInvoice({ ...INPUT, email: "buyer@kovra.test" }), (e) => e instanceof LavaEmailError && e.code === "email_rejected");
    assert.equal(lavaCalls.length, 1);
    assert.equal(lavaCalls[0].body.email, "buyer@kovra.test");
    const text = logs.join("\n");
    assert.ok(!text.includes("buyer@kovra.test"), "a full address never reaches the log");
    assert.ok(!text.includes(SHARED));
  });

  test("any other 400 stays a gateway error, not an e-mail one", async () => {
    lavaAnswers = [() => Response.json({ error: "Restricted payment method type" }, { status: 400 })];
    await assert.rejects(createInvoice({ ...INPUT, email: "buyer@kovra.test" }), (e) => !(e instanceof LavaEmailError));
    assert.equal(lavaCalls.length, 1);
  });
});

async function session() {
  return createSession(USER, true);
}
function postTo(handler, url, body, sid) {
  return handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${sid}` },
      body: JSON.stringify(body),
    }),
  );
}
const PLAN = { what: "plan", kind: "plan1", term: 1, method: "card" };
const TOPUP = { method: "lava", amountUsd: 10, returnTo: "web", lavaMethod: "card" };

describe("POST /api/subscribe/lava", () => {
  test("no e-mail, a bad one, the shared one: 400 with the code, no invoice", async () => {
    const sid = await session();
    for (const [body, code] of [
      [PLAN, "email_required"],
      [{ ...PLAN, email: "" }, "email_required"],
      [{ ...PLAN, email: "nope" }, "email_invalid"],
      [{ ...PLAN, email: SHARED }, "email_rejected"],
    ]) {
      const res = await postTo(lavaPost, "https://kovra.test/api/subscribe/lava", body, sid);
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: code });
    }
    assert.equal(lavaCalls.length, 0);
  });

  test("a good e-mail: the invoice carries it and it is saved for the account, not as the login e-mail", async () => {
    const sid = await session();
    const res = await postTo(lavaPost, "https://kovra.test/api/subscribe/lava", { ...PLAN, email: " Pay@Own.Test " }, sid);
    assert.equal(res.status, 200, JSON.stringify(logs));
    assert.equal(lavaCalls.length, 1);
    assert.equal(lavaCalls[0].body.email, "Pay@own.test");
    assert.equal(await readSavedPaymentEmail(USER), "Pay@own.test");
    assert.ok(!String(mem.store.get(`user:${USER}`)).includes("own.test"), "the login record is untouched");
  });

  test("the gateway refuses the address: 400 email_rejected, one request, nothing saved", async () => {
    const sid = await session();
    lavaAnswers = [refused400];
    const res = await postTo(lavaPost, "https://kovra.test/api/subscribe/lava", { ...PLAN, email: "pay@own.test" }, sid);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "email_rejected" });
    assert.equal(lavaCalls.length, 1);
    assert.equal(await readSavedPaymentEmail(USER), null);
  });
});

describe("POST /api/wallet/topup (lava)", () => {
  test("no e-mail, a bad one, the shared one: 400 with the code, no invoice", async () => {
    const sid = await session();
    for (const [body, code] of [
      [TOPUP, "email_required"],
      [{ ...TOPUP, email: "x" }, "email_invalid"],
      [{ ...TOPUP, email: SHARED }, "email_rejected"],
    ]) {
      const res = await postTo(topupPost, "https://kovra.test/api/wallet/topup", body, sid);
      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { ok: false, error: code });
    }
    assert.equal(lavaCalls.length, 0);
  });

  test("a good e-mail: 200, the invoice carries it, it is saved", async () => {
    const sid = await session();
    const res = await postTo(topupPost, "https://kovra.test/api/wallet/topup", { ...TOPUP, email: "me@own.test" }, sid);
    assert.equal(res.status, 200, JSON.stringify(logs));
    assert.equal(lavaCalls[0].body.email, "me@own.test");
    assert.equal(await readSavedPaymentEmail(USER), "me@own.test");
  });

  test("the gateway refuses it: 400 email_rejected and one request", async () => {
    const sid = await session();
    lavaAnswers = [refused400];
    const res = await postTo(topupPost, "https://kovra.test/api/wallet/topup", { ...TOPUP, email: "me@own.test" }, sid);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { ok: false, error: "email_rejected" });
    assert.equal(lavaCalls.length, 1);
  });

  test("other methods do not ask for an e-mail", async () => {
    const sid = await session();
    const res = await postTo(topupPost, "https://kovra.test/api/wallet/topup", { method: "card", amountUsd: 10, returnTo: "web" }, sid);
    assert.notEqual((await res.json()).error, "email_required");
  });
});

describe("saved payment e-mail", () => {
  test("prefill: the saved address, else the account's own, else nothing", async () => {
    assert.equal(await defaultPaymentEmail(USER), null);
    mem.store.set(`user:${USER}`, JSON.stringify({ authMethod: "email", createdAt: 1, email: "login@own.test" }));
    assert.equal(await defaultPaymentEmail(USER), "login@own.test");
    mem.store.set(`lava_email:${USER}`, "paid@own.test");
    assert.equal(await defaultPaymentEmail(USER), "paid@own.test");
  });

  test("the shared address is never offered as a prefill", async () => {
    mem.store.set(`lava_email:${USER}`, SHARED);
    assert.equal(await defaultPaymentEmail(USER), null);
  });
});

// ─── The old bot interface ─────────────────────────────────────────────────

async function hook(update) {
  const res = await webhook(
    new NextRequest("https://kovra.test/api/auth/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
      body: JSON.stringify({ update_id: seq++, ...update }),
    }),
  );
  assert.equal(res.status, 200);
}
const from = { id: CHAT, first_name: "Test", language_code: "en" };
const tap = (data) =>
  hook({ callback_query: { id: String(seq), from, data, message: { chat: { id: CHAT }, message_id: 42 } } });
const say = (text) => hook({ message: { message_id: 7, chat: { id: CHAT, type: "private" }, from, text } });
const lastText = () => tgCalls.filter((c) => c.method === "editMessageText" || c.method === "sendMessage").at(-1)?.body?.text ?? "";
const lastButtons = () =>
  (tgCalls.filter((c) => c.method === "editMessageText" || c.method === "sendMessage").at(-1)?.body?.reply_markup?.inline_keyboard ?? []).flat();

describe("old bot: lava top-up", () => {
  test("no saved address: the method button asks for the e-mail and creates nothing", async () => {
    await tap("lv_10_card_USD");
    assert.equal(lastText(), t("lava.emailAsk", "en"));
    assert.equal(lavaCalls.length, 0);
  });

  test("a bad answer asks again, a good one creates the invoice with it and saves it", async () => {
    await tap("lv_10_card_USD");
    await say("not an email");
    assert.equal(lavaCalls.length, 0);
    assert.ok(lastText().startsWith(t("lava.emailInvalid", "en")));
    await say(SHARED);
    assert.equal(lavaCalls.length, 0, "the shared address is not accepted from a customer either");
    await say("Me@Own.Test");
    assert.equal(lavaCalls.length, 1);
    assert.equal(lavaCalls[0].body.email, "Me@own.test");
    assert.ok(lastButtons().some((b) => typeof b.url === "string" && b.url.startsWith("https://app.lava.top/")));
    assert.equal(await readSavedPaymentEmail(USER), "Me@own.test");
    assert.ok(!logs.join("\n").includes("Me@Own"), "no full address in the logs");
  });

  test("a refused address by the gateway: asked again, no second request", async () => {
    lavaAnswers = [refused400];
    await tap("lv_10_card_USD");
    await say("me@own.test");
    assert.equal(lavaCalls.length, 1);
    assert.ok(lastText().startsWith(t("lava.emailRejected", "en")));
    assert.equal(await readSavedPaymentEmail(USER), null);
  });

  test("a saved address is shown with Pay and Change buttons; Pay uses it, Change asks again", async () => {
    mem.store.set(`lava_email:${USER}`, "saved@own.test");
    await tap("lv_10_card_USD");
    assert.ok(lastText().includes("saved@own.test"));
    assert.equal(lavaCalls.length, 0);
    const texts = lastButtons().map((b) => b.text);
    assert.ok(texts.includes(t("lava.emailPay", "en")) && texts.includes(t("lava.emailChange", "en")));
    await tap("lvc_10_card_USD");
    assert.equal(lastText(), t("lava.emailAsk", "en"));
    assert.equal(lavaCalls.length, 0);
    await tap("lvp_10_card_USD");
    assert.equal(lavaCalls.length, 1);
    assert.equal(lavaCalls[0].body.email, "saved@own.test");
  });

  test("a button press closes the pending prompt: the next text is not read as an e-mail", async () => {
    await tap("lv_10_card_USD");
    await tap("topup");
    await say("me@own.test");
    assert.equal(lavaCalls.length, 0);
  });
});

// ─── The new bot interface ─────────────────────────────────────────────────

const v2tap = (action) =>
  handleV2Callback({ chatId: CHAT, messageId: 42, callbackId: String(seq++), data: cb(action) });
const PICK = { cents: 1000, method: "card", currency: "USD" };

describe("bot v2: lava top-up", () => {
  test("no saved address: asks, validates, then creates the invoice with the typed address", async () => {
    await v2tap({ a: "lava", ...PICK });
    assert.equal(lastText(), tr("lava.emailAsk", "en"));
    assert.equal(lavaCalls.length, 0);

    assert.equal(await handleV2Reply(CHAT, "nope"), true);
    assert.equal(lavaCalls.length, 0);
    assert.ok(lastText().startsWith(tr("lava.emailInvalid", "en")));

    assert.equal(await handleV2Reply(CHAT, " v2@Own.Test "), true);
    assert.equal(lavaCalls.length, 1);
    assert.equal(lavaCalls[0].body.email, "v2@own.test");
    assert.equal(await readSavedPaymentEmail(USER), "v2@own.test");
    assert.ok(!logs.join("\n").includes("v2@"), "no full address in the logs");
    assert.equal(await handleV2Reply(CHAT, "hello"), false, "the prompt is closed after the invoice");
  });

  test("a saved address: confirm screen, Pay uses it, Change asks for another", async () => {
    mem.store.set(`lava_email:${USER}`, "saved@own.test");
    await v2tap({ a: "lava", ...PICK });
    assert.ok(lastText().includes("saved@own.test"));
    assert.equal(lavaCalls.length, 0);
    await v2tap({ a: "lavc", ...PICK });
    assert.equal(lastText(), tr("lava.emailAsk", "en"));
    await v2tap({ a: "lavp", ...PICK });
    assert.equal(lavaCalls.length, 1);
    assert.equal(lavaCalls[0].body.email, "saved@own.test");
  });

  test("the gateway refuses the address: the prompt reopens with the rejection text, one request", async () => {
    lavaAnswers = [refused400];
    await v2tap({ a: "lava", ...PICK });
    await handleV2Reply(CHAT, "v2@own.test");
    assert.equal(lavaCalls.length, 1);
    assert.ok(lastText().startsWith(tr("lava.emailRejected", "en")));
    assert.equal(await readSavedPaymentEmail(USER), null);
    // And the prompt is open again for a different address.
    assert.equal(await handleV2Reply(CHAT, "other@own.test"), true);
    assert.equal(lavaCalls.length, 2);
    assert.equal(lavaCalls[1].body.email, "other@own.test");
  });

  test("any other button closes the prompt", async () => {
    await v2tap({ a: "lava", ...PICK });
    await v2tap({ a: "topup" });
    assert.equal(await handleV2Reply(CHAT, "v2@own.test"), false);
    assert.equal(lavaCalls.length, 0);
  });
});
