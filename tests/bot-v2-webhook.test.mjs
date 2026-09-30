// tests/bot-v2-webhook.test.mjs — run: npm test
//
// The new bot interface end to end through the real webhook
// (src/app/api/auth/telegram/webhook/route.ts), against the in-memory Redis
// and a fake Bot API. Nothing reaches Telegram, Redis or a payment provider.
//
//   • the gate: the new screens only for gated chats, the old ones otherwise;
//   • ownership: a forged device uuid shows, sends and deletes nothing;
//   • paying: one charge per order screen (its nonce), even on a double tap;
//     the old one-tap buttons open the order instead of charging;
//   • "Connect" without a plan offers plans instead of a dead end;
//   • one live message: a command replaces the previous screen;
//   • "message is not modified" is not answered with a resend;
//   • /whoami is the owner's only;
//   • notices from the payment webhooks: localized with buttons for gated
//     chats, the old text for everyone else.
//
// Ids, tokens and codes are made up (the owner's id is the one in the code).

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_WEBHOOK_SECRET = ["kovra", "v2", "test", "secret"].join("-");
process.env.TELEGRAM_BOT_TOKEN = ["222222222", "KOVRA-v2-test-token"].join(":");
process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://kovra.test";
process.env.INTERNAL_API_KEY = "kovra-test-internal";
delete process.env.KOVRA_STATIC_PANELS;
delete process.env.KOVRA_BOT_V2_ALL;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { POST } = await import("../src/app/api/auth/telegram/webhook/route.ts");
const { resetBotV2Cache, BOT_V2_SET } = await import("../src/lib/bot-v2/gate.ts");
const { notifyUser } = await import("../src/lib/bot-v2/notify.ts");
const { V2_DICTS } = await import("../src/lib/bot-v2/i18n.ts");
const { ADMIN_TG_ID } = await import("../src/lib/bot-owner.ts");
const { t: oldT } = await import("../src/lib/bot-i18n.ts");

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const USER = 100000011;
const OTHER = 100000022;
const OLD_UI = 100000033;
const U_UUID = "0a1b2c3d-0000-4000-8000-0000000000a1";
const O_UUID = "0a1b2c3d-0000-4000-8000-0000000000b2";
const DE = V2_DICTS.de;

let tg = [];
let createCalls = 0;
let editAnswer = null;
let msgSeq = 1000;
let lastSentId = 0;
let updateSeq = 5000;
const realFetch = globalThis.fetch;

beforeEach(async () => {
  mem.reset();
  resetBotV2Cache();
  tg = [];
  createCalls = 0;
  editAnswer = null;
  await mem.redis.sadd(BOT_V2_SET, String(USER), String(OTHER));
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith("https://api.telegram.org/")) {
      const method = u.split("/").pop();
      const body = init.body instanceof FormData ? { form: true, caption: init.body.get("caption") } : JSON.parse(init.body ?? "{}");
      tg.push({ method, body });
      if (method === "editMessageText" && editAnswer) return Response.json(editAnswer, { status: editAnswer.ok ? 200 : 400 });
      if (method === "sendMessage" || method === "sendPhoto") lastSentId = ++msgSeq;
      return Response.json({ ok: true, result: method.startsWith("send") ? { message_id: lastSentId } : true });
    }
    if (u === "https://kovra.test/api/vpn/create") {
      createCalls += 1;
      const { userId, deviceType } = JSON.parse(init.body);
      assert.equal(init.headers["X-Internal-Key"], "kovra-test-internal");
      const list = JSON.parse(mem.store.get(`profiles:${userId}`) ?? "[]");
      const subToken = "c0ffee00c0ffee00c0ffee00c0ffee00";
      list.push({ uuid: "0a1b2c3d-0000-4000-8000-0000000000c3", clientEmail: "x", vlessUrl: "", createdAt: 1, deviceType, subToken });
      mem.store.set(`profiles:${userId}`, JSON.stringify(list));
      return Response.json({ success: true, subToken });
    }
    throw new Error(`unexpected fetch in test: ${u}`);
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const from = (id, lang = "de") => ({ id, first_name: "Test", username: `u${id}`, language_code: lang });

async function hook(update) {
  const res = await POST(
    new NextRequest("https://kovra.test/api/auth/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
      body: JSON.stringify({ update_id: updateSeq++, ...update }),
    }),
  );
  assert.equal(res.status, 200);
}
const tap = (id, data, cbId = `cb${updateSeq}`) =>
  hook({ callback_query: { id: cbId, from: from(id), data, message: { chat: { id }, message_id: 42 } } });
const say = (id, text) => hook({ message: { message_id: 7, chat: { id }, from: from(id), text } });

const calls = (method) => tg.filter((c) => c.method === method);
const last = (method) => calls(method).at(-1)?.body;
const buttons = (body) => (body?.reply_markup?.inline_keyboard ?? []).flat();

function profile(uuid, deviceType = "iphone") {
  return { uuid, clientEmail: `c_${uuid.slice(-2)}`, vlessUrl: "vless://x", createdAt: 1, deviceType, subToken: `tok${uuid.replace(/-/g, "")}` };
}
function activePlan(userId, kind = "plan3", slots = 3) {
  mem.store.set(
    `subs:${userId}`,
    JSON.stringify([{ id: "s1", kind, slots, startsAt: Date.now() - 1000, expiresAt: Date.now() + 30 * 86_400_000, createdAt: 1 }]),
  );
}

describe("the gate", () => {
  test("a gated chat gets the new menu, with the Mini App button", async () => {
    await tap(USER, "menu");
    const body = last("editMessageText");
    assert.ok(body.text.includes("Kovra"));
    const app = buttons(body).find((b) => b.web_app);
    assert.equal(app.web_app.url, "https://kovravpn.com/tg?lang=de");
    assert.equal(app.text, DE["btn.open"]);
    assert.ok(buttons(body).length <= 6);
  });

  test("any other chat keeps the old interface, byte for byte", async () => {
    await tap(OLD_UI, "menu");
    const body = last("editMessageText");
    assert.equal(body.text, oldT("menu.title", "de"));
    assert.ok(!buttons(body).some((b) => b.web_app));
  });

  test("a new-interface button in a chat that is back on the old one shows the old menu", async () => {
    await tap(OLD_UI, "k:wallet");
    assert.equal(last("editMessageText").text, oldT("menu.title", "de"));
  });

  test("every v2 callback is answered exactly once", async () => {
    await tap(USER, "k:help", "cb-help-1");
    const answers = calls("answerCallbackQuery").filter((c) => c.body.callback_query_id === "cb-help-1");
    assert.equal(answers.length, 1);
  });
});

describe("devices belong to their owner", () => {
  beforeEach(() => {
    activePlan(`tg_${USER}`);
    activePlan(`tg_${OTHER}`);
    mem.store.set(`profiles:tg_${USER}`, JSON.stringify([profile(U_UUID)]));
    mem.store.set(`profiles:tg_${OTHER}`, JSON.stringify([profile(O_UUID, "android")]));
  });

  test("a forged dev/qr/del/delok for someone else's uuid shows, sends and deletes nothing", async () => {
    const before = mem.store.get(`profiles:tg_${OTHER}`);
    for (const data of [`k:dev:${O_UUID}`, `k:qr:${O_UUID}`, `k:del:${O_UUID}`, `k:delok:${O_UUID}`, `cdel_${O_UUID}`, `link_${O_UUID}`]) {
      await tap(USER, data);
    }
    assert.equal(mem.store.get(`profiles:tg_${OTHER}`), before);
    assert.equal(calls("sendPhoto").length, 0);
    for (const e of calls("editMessageText")) {
      assert.ok(!e.body.text.includes(`tok${O_UUID.replace(/-/g, "")}`), "the other user's key leaked");
    }
    assert.ok(calls("editMessageText").some((e) => e.body.text.includes(DE["devs.notFound"].replace(/<[^>]+>/g, ""))));
  });

  test("the owner's own device: key, one-tap import, QR, removal", async () => {
    const token = `tok${U_UUID.replace(/-/g, "")}`;
    await tap(USER, `k:dev:${U_UUID}`);
    const screen = last("editMessageText");
    assert.ok(screen.text.includes(`https://kovravpn.com/api/sub/${token}`));
    assert.ok(buttons(screen).some((b) => b.url === `https://kovravpn.com/add/${token}?lang=de`));

    await tap(USER, `k:qr:${U_UUID}`);
    assert.equal(calls("sendPhoto").length, 1);

    await tap(USER, `k:del:${U_UUID}`);
    assert.ok(buttons(last("editMessageText")).some((b) => b.callback_data === `k:delok:${U_UUID}`));
    assert.ok(buttons(last("editMessageText")).some((b) => b.callback_data === `k:dev:${U_UUID}`), "Back to the device");
    await tap(USER, `k:delok:${U_UUID}`);
    assert.deepEqual(JSON.parse(mem.store.get(`profiles:tg_${USER}`)), []);
    assert.ok(mem.store.get(`profiles:tg_${OTHER}`).includes(O_UUID));
  });
});

describe("connecting a device", () => {
  test("without a plan: the plan choice, and nothing is created", async () => {
    await tap(USER, "k:connect");
    assert.equal(createCalls, 0);
    const kb = buttons(last("editMessageText")).map((b) => b.callback_data);
    assert.ok(kb.includes("k:terms:plan1:c") && kb.includes("k:terms:plan3:c"));
    // A forged "new device" without a plan creates nothing either.
    await tap(USER, "k:new:iphone");
    assert.equal(createCalls, 0);
  });

  test("with a free slot: one short progress edit, then the new device", async () => {
    activePlan(`tg_${USER}`);
    await tap(USER, "k:new:tv");
    assert.equal(createCalls, 1);
    const edits = calls("editMessageText");
    // The progress frame is never a dead end: Back to the devices (harmless while it runs).
    assert.deepEqual(
      edits.at(-2).body.reply_markup.inline_keyboard.flat().map((b) => b.callback_data),
      ["k:devs"],
      "the progress edit has only Back",
    );
    assert.ok(edits.at(-1).body.text.includes("c0ffee00c0ffee00c0ffee00c0ffee00"));
    assert.equal(calls("sendChatAction").length, 1);
  });

  test("all slots used: an extra slot is offered, nothing is created", async () => {
    activePlan(`tg_${USER}`, "plan1", 1);
    mem.store.set(`profiles:tg_${USER}`, JSON.stringify([profile(U_UUID)]));
    await tap(USER, "k:new:mac");
    assert.equal(createCalls, 0);
    assert.ok(buttons(last("editMessageText")).some((b) => b.callback_data === "k:slot:c"));
  });
});

describe("paying from the balance", () => {
  test("one charge per order screen, even when Pay is tapped twice", async () => {
    mem.store.set(`balance_usd:tg_${USER}`, "1000");
    await tap(USER, "k:ord:plan1:1");
    const pay = buttons(last("editMessageText")).find((b) => b.callback_data?.startsWith("k:pay:"));
    assert.ok(pay, "a Pay button");
    await tap(USER, pay.callback_data, "cb-pay-1");
    await tap(USER, pay.callback_data, "cb-pay-2");
    assert.equal(mem.store.get(`balance_usd:tg_${USER}`), "500");
    const subs = JSON.parse(mem.store.get(`subs:tg_${USER}`));
    assert.equal(subs.length, 1);
    assert.equal(subs[0].kind, "plan1");
  });

  test("not enough money: nothing charged, the missing amount and a top-up", async () => {
    mem.store.set(`balance_usd:tg_${USER}`, "100");
    await tap(USER, "k:pay:plan3:6:abcdefgh");
    assert.equal(mem.store.get(`balance_usd:tg_${USER}`), "100");
    assert.equal(mem.store.get(`subs:tg_${USER}`), undefined);
    assert.ok(buttons(last("editMessageText")).some((b) => b.callback_data === "k:topfor:plan3:6"));
  });

  test("an old one-tap purchase button now opens the order and charges nothing", async () => {
    activePlan(`tg_${USER}`, "plan1", 1);
    mem.store.set(`balance_usd:tg_${USER}`, "5000");
    await tap(USER, "buyterm_plan1_1");
    await tap(USER, "adddev_1");
    assert.equal(mem.store.get(`balance_usd:tg_${USER}`), "5000");
    assert.ok(buttons(last("editMessageText")).some((b) => b.callback_data?.startsWith("k:pay:slot:1:")));
  });

  test("while one tier runs, the other cannot be bought", async () => {
    activePlan(`tg_${USER}`, "plan3", 3);
    mem.store.set(`balance_usd:tg_${USER}`, "5000");
    await tap(USER, "k:pay:plan1:1:abcdefgh");
    assert.equal(mem.store.get(`balance_usd:tg_${USER}`), "5000");
  });
});

describe("messages and commands", () => {
  test("/start sends the menu as a new message and removes the previous screen", async () => {
    mem.store.set(`kovra:bot:live:${USER}`, "321");
    await say(USER, "/start");
    assert.equal(calls("sendMessage").length, 1);
    assert.deepEqual(last("deleteMessage"), { chat_id: USER, message_id: 321 });
    assert.equal(mem.store.get(`kovra:bot:live:${USER}`), String(lastSentId));
  });

  test('"message is not modified" is not answered with a new message', async () => {
    editAnswer = { ok: false, error_code: 400, description: "Bad Request: message is not modified: specified new message content" };
    await tap(USER, "k:help");
    await tap(USER, "k:help");
    assert.equal(calls("sendMessage").length, 0);
    assert.equal(calls("deleteMessage").length, 0);
  });

  test("/whoami is the owner's only", async () => {
    await say(OLD_UI, "/whoami");
    await say(USER, "/whoami");
    for (const m of calls("sendMessage")) assert.ok(!m.body.text.includes("Ваш профиль"));
    tg = [];
    await say(Number(ADMIN_TG_ID), "/whoami");
    assert.ok(last("sendMessage").text.includes("Ваш профиль"));
  });

  test("a promo code typed after the Promo button is redeemed into the wallet", async () => {
    mem.store.set("promo:WELCOME5", JSON.stringify({ code: "WELCOME5", amount: 5, maxUses: 0, usedCount: 0, expiresAt: 0, createdAt: 1 }));
    await tap(USER, "k:promo");
    await say(USER, "welcome5");
    assert.equal(mem.store.get(`balance_usd:tg_${USER}`), "500");
    assert.ok(last("sendMessage").text.includes("$5.00"));
    // Only once: the prompt is gone, and a second try is "already used".
    await tap(USER, "k:promo");
    await say(USER, "WELCOME5");
    assert.equal(mem.store.get(`balance_usd:tg_${USER}`), "500");
    // A refused code keeps the prompt open for the next try.
    assert.equal(mem.store.get(`promo_await:${USER}`), "1");
  });

  test("a typed top-up amount out of range asks again", async () => {
    await tap(USER, "k:topx:crypto");
    await say(USER, "3");
    assert.ok(last("sendMessage").text.includes(DE["topx.bad"].replace("{min}", "$8").replace("{max}", "$1000")));
    assert.equal(mem.store.get(`topup_usd_await:${USER}`), "crypto");
  });

  test("the language button switches the whole interface", async () => {
    await tap(USER, "k:lang:ru");
    assert.equal(JSON.parse(mem.store.get(`user:tg_${USER}`)).lang, "ru");
    assert.ok(buttons(last("editMessageText")).some((b) => b.text === V2_DICTS.ru["btn.help"]));
  });
});

describe("notices from the payment webhooks", () => {
  const LEGACY = "✅ <b>Balance topped up</b>";

  test("a gated chat: its language, with buttons", async () => {
    mem.store.set(`user:tg_${USER}`, JSON.stringify({ authMethod: "telegram", createdAt: 1, lang: "fr" }));
    assert.equal(await notifyUser(`tg_${USER}`, { kind: "topup", amountCents: 2000, balanceCents: 2500 }, LEGACY), true);
    const body = last("sendMessage");
    assert.ok(body.text.startsWith(V2_DICTS.fr["nt.topup"].split(" ·")[0]));
    assert.ok(buttons(body).some((b) => b.web_app?.url === "https://kovravpn.com/tg?lang=fr"));
  });

  test("a top-up made for an order offers to pay it", async () => {
    mem.store.set(`balance_usd:tg_${USER}`, "6000");
    mem.store.set(`kovra:bot:order:tg_${USER}`, JSON.stringify({ product: "plan3", term: 6, from: "w" }));
    await notifyUser(`tg_${USER}`, { kind: "topup", amountCents: 5000, balanceCents: 6000 }, LEGACY);
    assert.ok(buttons(last("sendMessage")).some((b) => b.callback_data === "k:ord:plan3:6"));
  });

  test("any other chat: exactly the old text, no buttons", async () => {
    await notifyUser(`tg_${OLD_UI}`, { kind: "topup", amountCents: 2000, balanceCents: 2500 }, LEGACY);
    const body = last("sendMessage");
    assert.equal(body.text, LEGACY);
    assert.equal(body.reply_markup, undefined);
  });

  test("an account without Telegram: nothing sent", async () => {
    assert.equal(await notifyUser("em_someone", { kind: "expired" }, "x"), false);
    assert.equal(tg.length, 0);
  });
});

describe("review fixes of 30.09", () => {
  const home = (body) => buttons(body).some((b) => b.callback_data === "k:connect");

  test("/start with an unknown parameter opens the menu, never a dead end", async () => {
    await say(USER, "/start tiktok");
    const body = last("sendMessage");
    assert.ok(home(body), "the menu");
    assert.ok(!body.text.includes(oldT("auth.notfound", "de")));
  });

  test("/start with an expired sign-in code: the menu, saying so", async () => {
    await say(USER, "/start ABCDEF");
    const body = last("sendMessage");
    assert.ok(home(body));
    assert.ok(body.text.startsWith(DE["note.codeGone"]));
  });

  test("a sign-in code confirmed in a v2 chat is a v2 screen, and the old menu goes", async () => {
    mem.store.set("auth:QWERTY", JSON.stringify({ verified: false }));
    mem.store.set(`kovra:bot:live:${USER}`, "321");
    await say(USER, "/start QWERTY");
    assert.equal(JSON.parse(mem.store.get("auth:QWERTY")).verified, true);
    const body = last("sendMessage");
    assert.ok(body.text.startsWith(DE["note.authOk"]));
    assert.ok(home(body));
    assert.deepEqual(last("deleteMessage"), { chat_id: USER, message_id: 321 });
  });

  test("a link code typed as a message in a v2 chat: the v2 menu with the note", async () => {
    mem.store.set("link_tg:ZXCVBN", JSON.stringify({ userId: "em_x@example.test", verified: false }));
    await say(USER, "zxcvbn");
    assert.ok(last("sendMessage").text.startsWith(DE["note.authLinked"]));
  });

  test("a question typed into the chat gets Help with the support address", async () => {
    await say(USER, "my vpn does not work, help please");
    const body = last("sendMessage");
    assert.ok(body.text.startsWith(DE["note.support"]));
    assert.ok(body.text.includes("support@kovravpn.com"));
  });

  test("a screenshot sent to the bot is answered too", async () => {
    await hook({ message: { message_id: 8, chat: { id: USER, type: "private" }, from: from(USER), photo: [{ file_id: "x" }] } });
    assert.ok(last("sendMessage").text.startsWith(DE["note.support"]));
  });

  test("an unknown command gets the menu with the hint", async () => {
    await say(USER, "/foo");
    assert.ok(last("sendMessage").text.startsWith(DE["note.unknown"]));
  });

  test("the promo prompt does not swallow a sentence, and closes", async () => {
    await tap(USER, "k:promo");
    await say(USER, "how?");
    assert.ok(last("sendMessage").text.startsWith(DE["note.support"]));
    assert.equal(mem.store.get(`promo_await:${USER}`), undefined);
  });

  test("a code that is not found keeps the prompt for a corrected one", async () => {
    await tap(USER, "k:promo");
    await say(USER, "NOSUCHCODE");
    assert.equal(mem.store.get(`promo_await:${USER}`), "1");
  });

  test("no plan: no extra-slot button, and a forged slot order says a plan comes first", async () => {
    mem.store.set(`balance_usd:tg_${USER}`, "10000");
    await tap(USER, "k:wallet");
    assert.ok(!buttons(last("editMessageText")).some((b) => b.callback_data?.startsWith("k:slot")));
    await tap(USER, "k:ord:slot:1");
    assert.equal(last("editMessageText").text, DE["pay.noPlan"]);
    await tap(USER, "k:pay:slot:1:abcdefgh");
    assert.equal(mem.store.get(`balance_usd:tg_${USER}`), "10000");
    assert.equal(mem.store.get(`subs:tg_${USER}`), undefined);
  });

  test("Renew from a device and a slot from the devices come back to the devices", async () => {
    mem.store.set(`profiles:tg_${USER}`, JSON.stringify([profile(U_UUID)]));
    mem.store.set(`subs:tg_${USER}`, JSON.stringify([{ id: "s0", kind: "plan1", slots: 1, createdAt: 1, expiresAt: Date.now() - 86_400_000 }]));
    await tap(USER, `k:dev:${U_UUID}`);
    const renew = buttons(last("editMessageText")).find((b) => b.callback_data?.startsWith("k:renew"));
    assert.equal(renew.callback_data, "k:renew:d");
    await tap(USER, renew.callback_data);
    // The plan ended: its terms, Back to the plan choice (a tier can change), Back to the devices.
    const toPlans = buttons(last("editMessageText")).find((b) => b.text === DE["btn.back"]);
    assert.equal(toPlans.callback_data, "k:plans:d");
    await tap(USER, toPlans.callback_data);
    assert.ok(buttons(last("editMessageText")).some((b) => b.text === DE["btn.back"] && b.callback_data === "k:devs"));

    activePlan(`tg_${USER}`, "plan1", 1);
    await tap(USER, "k:devs");
    const slot = buttons(last("editMessageText")).find((b) => b.callback_data?.startsWith("k:slot"));
    assert.equal(slot.callback_data, "k:slot:d");
    await tap(USER, slot.callback_data);
    assert.ok(buttons(last("editMessageText")).some((b) => b.text === DE["btn.back"] && b.callback_data === "k:devs"));
  });

  test("a button on a notice makes it the live screen; the old menu goes", async () => {
    mem.store.set(`kovra:bot:live:${USER}`, "321");
    await hook({ callback_query: { id: "cb-notice", from: from(USER), data: "k:wallet", message: { chat: { id: USER }, message_id: 555 } } });
    assert.deepEqual(last("deleteMessage"), { chat_id: USER, message_id: 321 });
    assert.equal(mem.store.get(`kovra:bot:live:${USER}`), "555");
  });

  test("a friend's link is recorded at /start, before any purchase", async () => {
    mem.store.set("ref_lookup:abcd1234", "tg_100000099");
    await say(USER, "/start ref_abcd1234");
    assert.equal(mem.store.get(`ref_by:tg_${USER}`), "tg_100000099");
    assert.equal(JSON.parse(mem.store.get("ref_list:tg_100000099"))[0].userId, `tg_${USER}`);
  });

  test("the payment return does not claim the money arrived", async () => {
    await say(USER, "/start paid");
    const text = last("sendMessage").text;
    assert.ok(text.startsWith(DE["note.paid"]));
    assert.ok(!/erhalten/i.test(DE["note.paid"]));
  });

  test("the TV instructions lead to the TV part of the guide", async () => {
    activePlan(`tg_${USER}`);
    mem.store.set(`profiles:tg_${USER}`, JSON.stringify([profile(U_UUID, "tv")]));
    await tap(USER, `k:dev:${U_UUID}`);
    assert.ok(buttons(last("editMessageText")).some((b) => b.url === "https://kovravpn.com/guides/how-to-set-up-vpn-on-android#tv"));
  });
});
