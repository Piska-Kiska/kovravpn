// tests/support-relay.test.mjs — run: npm test
//
// Free text and screenshots a person sends to the bot, when no screen is
// waiting for input, go to the owner with a card (id, @username, account,
// language), and the owner answers with a Telegram reply that the bot copies
// back to that person (lib/support-relay.ts, approved by the owner 30.09).
// Commands, sign-in codes, group chats and the owner's own messages are never
// forwarded; one person gets at most 5 forwards per 10 minutes.
//
// The Telegram webhook runs end to end against an in-memory Redis; fetch is
// stubbed and records the Bot API calls. Ids, names and secrets are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const SECRET = ["kovra", "support", "relay", "secret"].join("-");
process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { POST } = await import("../src/app/api/auth/telegram/webhook/route.ts");
const { ADMIN_TG_ID } = await import("../src/lib/bot-owner.ts");
const { BOT_V2_SET, resetBotV2Cache } = await import("../src/lib/bot-v2/gate.ts");
const { supportCard, SUPPORT_FORWARDS_PER_WINDOW } = await import("../src/lib/support-relay.ts");
const { t } = await import("../src/lib/bot-i18n.ts");
const { V2_DICTS } = await import("../src/lib/bot-v2/i18n.ts");

const USER = 100000001;
const V2USER = 100000002;
const ADMIN = Number(ADMIN_TG_ID);

let tg;
let msgSeq = 5000;
let updateSeq = 7000;
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  resetBotV2Cache();
  tg = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith("https://api.telegram.org/")) throw new Error(`unexpected fetch in test: ${u}`);
    const method = u.split("/").pop();
    tg.push({ method, body: init.body ? JSON.parse(init.body) : {} });
    const withId = ["sendMessage", "forwardMessage", "copyMessage", "sendPhoto"].includes(method);
    return Response.json({ ok: true, result: withId ? { message_id: ++msgSeq } : true });
  };
  mem.store.set(`user:tg_${USER}`, JSON.stringify({ authMethod: "telegram", createdAt: 1, telegramId: String(USER), lang: "en" }));
  mem.store.set(`user:tg_${V2USER}`, JSON.stringify({ authMethod: "telegram", createdAt: 1, telegramId: String(V2USER), lang: "en" }));
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function hook(message) {
  const res = await POST(
    new NextRequest("https://kovra.test/api/auth/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
      body: JSON.stringify({ update_id: updateSeq++, message }),
    }),
  );
  assert.equal(res.status, 200);
}

const from = (id) => ({ id, first_name: "Test <b>", username: `user${id}`, language_code: "en" });
const say = (id, text, extra = {}) =>
  hook({ message_id: ++msgSeq, chat: { id, type: "private" }, from: from(id), text, ...extra });

const calls = (method) => tg.filter((c) => c.method === method);
const toAdmin = (method) => calls(method).filter((c) => String(c.body.chat_id) === ADMIN_TG_ID);
const lastTo = (chatId) => calls("sendMessage").filter((c) => c.body.chat_id === chatId).at(-1)?.body.text ?? "";

describe("a person's message goes to support", () => {
  test("free text: forwarded to the owner with a card, and the person is told", async () => {
    await say(USER, "Hi, nothing connects on my iPhone");
    const [fwd] = toAdmin("forwardMessage");
    assert.ok(fwd, "forwarded");
    assert.equal(fwd.body.from_chat_id, USER);
    const card = toAdmin("sendMessage").at(-1).body;
    assert.match(card.text, new RegExp(`tg <code>${USER}</code> @user${USER}`));
    assert.match(card.text, new RegExp(`account <code>tg_${USER}</code>`));
    assert.match(card.text, /lang en/);
    assert.match(card.text, /Test &lt;b&gt;/, "the name is escaped");
    assert.equal(lastTo(USER), t("support.forwarded", "en"));
  });

  test("a screenshot is forwarded too", async () => {
    await hook({ message_id: ++msgSeq, chat: { id: USER, type: "private" }, from: from(USER), photo: [{ file_id: "x" }] });
    assert.equal(toAdmin("forwardMessage").length, 1);
    assert.equal(lastTo(USER), t("support.forwarded", "en"));
  });

  test(`at most ${SUPPORT_FORWARDS_PER_WINDOW} forwards per person in 10 minutes`, async () => {
    for (let i = 0; i < SUPPORT_FORWARDS_PER_WINDOW + 2; i += 1) await say(USER, `message ${i}`);
    assert.equal(toAdmin("forwardMessage").length, SUPPORT_FORWARDS_PER_WINDOW);
    assert.equal(lastTo(USER), t("support.slow", "en"));
  });

  test("the new interface: forwarded, and the note says so", async () => {
    await mem.redis.sadd(BOT_V2_SET, String(V2USER));
    await say(V2USER, "Where is my receipt?");
    assert.equal(toAdmin("forwardMessage").length, 1);
    assert.ok(lastTo(V2USER).startsWith(V2_DICTS.en["note.forwarded"]));
  });

  test("commands, sign-in codes and group messages are not forwarded", async () => {
    await say(USER, "/whatever");
    await say(USER, "ABC123");
    await hook({ message_id: ++msgSeq, chat: { id: -100123, type: "supergroup" }, from: from(USER), text: "hello group" });
    assert.equal(toAdmin("forwardMessage").length, 0);
  });

  test("the owner's own messages are not forwarded", async () => {
    await hook({ message_id: ++msgSeq, chat: { id: ADMIN, type: "private" }, from: from(ADMIN), text: "just a note" });
    assert.equal(calls("forwardMessage").length, 0);
  });
});

describe("the owner answers with a reply", () => {
  test("a reply to the forwarded message is copied to the person", async () => {
    await say(USER, "Help please");
    assert.equal(toAdmin("forwardMessage").length, 1);
    const mapped = [...mem.store.keys()].filter((k) => k.startsWith("support:msg:"));
    assert.equal(mapped.length, 2, "the forwarded message and its card both map back");
    for (const k of mapped) assert.equal(mem.ttls.get(k).ex, 30 * 24 * 60 * 60);
    const replyTo = Number(mapped[0].split(":").pop());

    await hook({
      message_id: ++msgSeq,
      chat: { id: ADMIN, type: "private" },
      from: from(ADMIN),
      text: "Update Happ and try again",
      reply_to_message: { message_id: replyTo },
    });
    const copy = calls("copyMessage").at(-1).body;
    assert.equal(copy.chat_id, USER);
    assert.equal(String(copy.from_chat_id), ADMIN_TG_ID);
    assert.match(toAdmin("sendMessage").at(-1).body.text, /Sent to the user/);
  });

  test("a reply to any other message is left to the admin screens", async () => {
    await hook({
      message_id: ++msgSeq,
      chat: { id: ADMIN, type: "private" },
      from: from(ADMIN),
      text: "not a support thread",
      reply_to_message: { message_id: 42 },
    });
    assert.equal(calls("copyMessage").length, 0);
  });
});

describe("supportCard", () => {
  test("escapes everything the person controls", () => {
    const card = supportCard({
      chatId: 5,
      messageId: 1,
      from: { id: 5, username: "a<b", first_name: "<script>", last_name: "&", language_code: "e<n" },
      userId: "em_x<y@example.test",
      lang: "en",
    });
    assert.ok(!/<script>|a<b|x<y|e<n/.test(card));
    assert.match(card, /&lt;script&gt; &amp;/);
  });
});
