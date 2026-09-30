// tests/bot-v2-telegram.test.mjs — run: npm test
//
// The edit helper of the new bot interface (src/lib/bot-v2/telegram.ts):
//   • "message is not modified" is success: nothing is sent or deleted;
//   • a message that cannot be edited (a photo, a deleted or old message)
//     is replaced by a new one, and the old one deleted when it still exists;
//   • any other error (bad markup, rate limit, network) is NOT answered with
//     a resend;
//   • web_app buttons never go to a group chat.
// The Bot API is a fake here; nothing leaves the process.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";
const tg = await import("../src/lib/bot-v2/telegram.ts");

const SCREEN = { text: "<b>Hi</b>", kb: [[{ text: "Back", callback_data: "k:home" }]] };

/** A fake TelegramApi: `answers` maps a method to its result (or a function of the body). */
function fakeApi(answers) {
  const calls = [];
  const api = {
    async call(method, body) {
      calls.push({ method, body });
      const a = answers[method];
      const r = typeof a === "function" ? a(body) : a;
      return r ?? { ok: true, result: true };
    },
    async upload(method, form) {
      calls.push({ method, form });
      return answers[method] ?? { ok: true, result: { message_id: 77 } };
    },
  };
  return { api, calls };
}

const err = (description, errorCode = 400) => ({ ok: false, errorCode, description });

describe("classifyEditFailure", () => {
  test("Telegram's descriptions", () => {
    const c = tg.classifyEditFailure;
    assert.equal(
      c("Bad Request: message is not modified: specified new message content and reply markup are exactly the same"),
      "not_modified",
    );
    assert.equal(c("Bad Request: there is no text in the message to edit"), "cannot_edit");
    assert.equal(c("Bad Request: message to edit not found"), "cannot_edit");
    assert.equal(c("Bad Request: message can't be edited"), "cannot_edit");
    assert.equal(c("Bad Request: MESSAGE_ID_INVALID"), "cannot_edit");
    assert.equal(c("Bad Request: can't parse entities: Unsupported start tag"), "other");
    assert.equal(c("Too Many Requests: retry after 5"), "other");
    assert.equal(c("network: fetch failed"), "other");
  });
});

describe("editScreen", () => {
  test("a successful edit", async () => {
    const { api, calls } = fakeApi({ editMessageText: { ok: true, result: { message_id: 5 } } });
    const out = await tg.editScreen(api, 100, 5, SCREEN);
    assert.deepEqual(out, { kind: "edited", messageId: 5 });
    assert.deepEqual(calls.map((c) => c.method), ["editMessageText"]);
    assert.equal(calls[0].body.parse_mode, "HTML");
    assert.deepEqual(calls[0].body.link_preview_options, { is_disabled: true });
  });

  test('"message is not modified" is success: no resend, no delete', async () => {
    const { api, calls } = fakeApi({ editMessageText: err("Bad Request: message is not modified: specified new message content") });
    const out = await tg.editScreen(api, 100, 5, SCREEN);
    assert.deepEqual(out, { kind: "unchanged", messageId: 5 });
    assert.deepEqual(calls.map((c) => c.method), ["editMessageText"]);
  });

  test("a photo message is replaced: send new, delete old", async () => {
    const { api, calls } = fakeApi({
      editMessageText: err("Bad Request: there is no text in the message to edit"),
      sendMessage: { ok: true, result: { message_id: 9 } },
    });
    const out = await tg.editScreen(api, 100, 5, SCREEN);
    assert.deepEqual(out, { kind: "resent", messageId: 9 });
    assert.deepEqual(calls.map((c) => c.method), ["editMessageText", "sendMessage", "deleteMessage"]);
    assert.equal(calls[2].body.message_id, 5);
  });

  test("a message that is gone: send new, nothing to delete", async () => {
    const { api, calls } = fakeApi({
      editMessageText: err("Bad Request: message to edit not found"),
      sendMessage: { ok: true, result: { message_id: 9 } },
    });
    const out = await tg.editScreen(api, 100, 5, SCREEN);
    assert.deepEqual(out, { kind: "resent", messageId: 9 });
    assert.deepEqual(calls.map((c) => c.method), ["editMessageText", "sendMessage"]);
  });

  test("a markup error or a rate limit is not resent", async () => {
    for (const e of [err("Bad Request: can't parse entities: bad tag"), err("Too Many Requests: retry after 3", 429)]) {
      const { api, calls } = fakeApi({ editMessageText: e });
      const out = await tg.editScreen(api, 100, 5, SCREEN);
      assert.deepEqual(out, { kind: "failed", messageId: null });
      assert.deepEqual(calls.map((c) => c.method), ["editMessageText"]);
    }
  });

  test("a failed resend is a failure, and the old message stays", async () => {
    const { api, calls } = fakeApi({
      editMessageText: err("Bad Request: there is no text in the message to edit"),
      sendMessage: err("Forbidden: bot was blocked by the user", 403),
    });
    const out = await tg.editScreen(api, 100, 5, SCREEN);
    assert.deepEqual(out, { kind: "failed", messageId: null });
    assert.ok(!calls.some((c) => c.method === "deleteMessage"));
  });

  test("an empty keyboard is sent explicitly, so an edit removes stale buttons", async () => {
    const { api, calls } = fakeApi({});
    await tg.editScreen(api, 100, 5, { text: "…", kb: [] });
    assert.deepEqual(calls[0].body.reply_markup, { inline_keyboard: [] });
  });
});

describe("createTelegramApi", () => {
  test("a network failure becomes a result, never a throw", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    try {
      const api = tg.createTelegramApi("000:test");
      const r = await api.call("sendMessage", { chat_id: 1, text: "x" });
      assert.equal(r.ok, false);
      assert.match(r.description, /network: offline/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("no token: nothing is sent", async () => {
    const realFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async () => {
      called = true;
      return Response.json({ ok: true });
    };
    try {
      const r = await tg.createTelegramApi("").call("sendMessage", {});
      assert.equal(r.ok, false);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("sanitizeKeyboard", () => {
  const kb = [[{ text: "App", web_app: { url: "https://kovravpn.com/tg" } }], [{ text: "A", callback_data: "k:home" }], []];

  test("private chat: web_app kept, empty rows dropped", () => {
    assert.deepEqual(tg.sanitizeKeyboard(kb, 100), [kb[0], kb[1]]);
  });

  test("group chat: web_app dropped (Telegram would reject the whole keyboard)", () => {
    assert.deepEqual(tg.sanitizeKeyboard(kb, -100123), [kb[1]]);
  });
});
