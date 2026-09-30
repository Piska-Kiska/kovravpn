// tests/bot-webhook.test.mjs — run: npm test
//
// The Telegram webhook (src/app/api/auth/telegram/webhook/route.ts) end to
// end against an in-memory Redis, with fetch stubbed so no request reaches
// api.telegram.org:
//   • the secret header is compared in constant time and must match exactly;
//   • a forged `cdel_<uuid>` / `del_<uuid>` for someone else's device changes
//     nothing (it used to remove the victim's client from the panels);
//   • buying from the wallet goes through lib/wallet-purchase.ts, keyed by
//     the callback id;
//   • the identity and first-contact language are both written.
//
// Ids, tokens and secrets are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const SECRET = ["kovra", "webhook", "test", "secret"].join("-");
process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
process.env.TELEGRAM_BOT_TOKEN = ["111111111", "KOVRA-test-token"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { POST } = await import("../src/app/api/auth/telegram/webhook/route.ts");
const { safeEqual } = await import("../src/lib/safe-compare.ts");
const { t } = await import("../src/lib/bot-i18n.ts");
// The callbacks below come from a Telegram client set to German.
const NOT_FOUND = t("link.notfound", "de");

const ATTACKER = 100000001;
const VICTIM = 100000002;
const V_UUID = "0a1b2c3d-0000-4000-8000-00000000000b";
const A_UUID = "0a1b2c3d-0000-4000-8000-00000000000a";

let tgCalls = [];
const realFetch = globalThis.fetch;
let updateSeq = 1000;

beforeEach(() => {
  mem.reset();
  tgCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith("https://api.telegram.org/")) throw new Error(`unexpected fetch in test: ${u}`);
    tgCalls.push({ method: u.split("/").pop(), body: init.body ? JSON.parse(init.body) : null });
    return Response.json({ ok: true, result: { message_id: 1 } });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function profile(uuid) {
  return { uuid, clientEmail: `kovra_${uuid.slice(-4)}`, vlessUrl: "vless://x", createdAt: 1, deviceType: "android" };
}

function callbackUpdate(from, data, cbId = String(9_000_000 + updateSeq)) {
  return {
    update_id: updateSeq++,
    callback_query: {
      id: cbId,
      from: { id: from, first_name: "Test", username: `user${from}`, language_code: "de" },
      message: { chat: { id: from }, message_id: 42 },
      data,
    },
  };
}

async function hook(update, secret = SECRET) {
  const headers = { "content-type": "application/json" };
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  const res = await POST(
    new NextRequest("https://kovra.test/api/auth/telegram/webhook", {
      method: "POST",
      headers,
      body: JSON.stringify(update),
    }),
  );
  return res.status;
}

const lastEditText = () => {
  const edits = tgCalls.filter((c) => c.method === "editMessageText");
  return edits.length ? edits[edits.length - 1].body.text : null;
};

describe("safeEqual", () => {
  test("equal strings only", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", "abcd"), false);
    assert.equal(safeEqual("", "abc"), false);
    assert.equal(safeEqual(undefined, "abc"), false);
  });
});

describe("webhook secret", () => {
  test("missing, wrong, prefix or longer secret: 403 and nothing done", async () => {
    for (const s of [null, "", "wrong", SECRET.slice(0, -1), `${SECRET}x`, SECRET.toUpperCase()]) {
      assert.equal(await hook(callbackUpdate(ATTACKER, "menu"), s), 403, String(s));
    }
    assert.equal(tgCalls.length, 0);
    assert.equal([...mem.store.keys()].length, 0);
  });

  test("the exact secret: 200", async () => {
    assert.equal(await hook(callbackUpdate(ATTACKER, "menu")), 200);
  });
});

describe("device deletion is scoped to the caller", () => {
  beforeEach(() => {
    mem.store.set(`profiles:tg_${VICTIM}`, JSON.stringify([profile(V_UUID)]));
    mem.store.set(`profiles:tg_${ATTACKER}`, JSON.stringify([profile(A_UUID)]));
  });

  test("a forged cdel_ for another user's device changes nothing", async () => {
    const before = new Map(mem.store);
    assert.equal(await hook(callbackUpdate(ATTACKER, `cdel_${V_UUID}`)), 200);
    assert.deepEqual(JSON.parse(mem.store.get(`profiles:tg_${VICTIM}`)).map((p) => p.uuid), [V_UUID]);
    assert.deepEqual(JSON.parse(mem.store.get(`profiles:tg_${ATTACKER}`)).map((p) => p.uuid), [A_UUID]);
    assert.equal(mem.store.get(`profiles:tg_${VICTIM}`), before.get(`profiles:tg_${VICTIM}`));
    assert.equal(lastEditText(), NOT_FOUND);
  });

  test("a forged del_ does not even offer the confirmation", async () => {
    await hook(callbackUpdate(ATTACKER, `del_${V_UUID}`));
    assert.equal(lastEditText(), NOT_FOUND);
    const kb = tgCalls.at(-1).body.reply_markup.inline_keyboard.flat();
    assert.ok(!kb.some((b) => String(b.callback_data).startsWith("cdel_")));
  });

  test("deleting one's own device still works", async () => {
    await hook(callbackUpdate(ATTACKER, `cdel_${A_UUID}`));
    assert.deepEqual(JSON.parse(mem.store.get(`profiles:tg_${ATTACKER}`)), []);
    assert.deepEqual(JSON.parse(mem.store.get(`profiles:tg_${VICTIM}`)).map((p) => p.uuid), [V_UUID]);
  });
});

describe("buying from the wallet in the bot", () => {
  test("buyterm charges the wallet once per callback id and grants the plan", async () => {
    mem.store.set(`balance_usd:tg_${ATTACKER}`, "700");
    const u = callbackUpdate(ATTACKER, "buyterm_plan1_1", "5550001112223334445");
    await hook(u);
    assert.equal(mem.store.get(`balance_usd:tg_${ATTACKER}`), "200");
    const subs = JSON.parse(mem.store.get(`subs:tg_${ATTACKER}`));
    assert.equal(subs.length, 1);
    assert.equal(subs[0].kind, "plan1");
    assert.match(lastEditText(), /\$2\.00|2\.00/);

    // Telegram re-delivers the same update: deduped by update_id.
    await hook(u);
    // The same callback id arriving in another update: replayed, not charged.
    await hook({ ...u, update_id: updateSeq++ });
    assert.equal(mem.store.get(`balance_usd:tg_${ATTACKER}`), "200");
    assert.equal(JSON.parse(mem.store.get(`subs:tg_${ATTACKER}`))[0].kind, "plan1");
  });

  test("not enough money shows how much to top up and charges nothing", async () => {
    mem.store.set(`balance_usd:tg_${ATTACKER}`, "100");
    await hook(callbackUpdate(ATTACKER, "adddev_6"));
    assert.equal(mem.store.get(`balance_usd:tg_${ATTACKER}`), "100");
    assert.match(lastEditText(), /29\.00/);
  });
});

describe("identity sync", () => {
  test("username and first-contact language are both stored", async () => {
    await hook(callbackUpdate(ATTACKER, "menu"));
    const user = JSON.parse(mem.store.get(`user:tg_${ATTACKER}`));
    assert.equal(user.tgUsername, `user${ATTACKER}`);
    assert.equal(user.lang, "de");
  });
});
