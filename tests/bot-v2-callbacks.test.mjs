// tests/bot-v2-callbacks.test.mjs — run: npm test
//
// callback_data of the new bot interface (src/lib/bot-v2/callbacks.ts):
// every action survives encode → parse, fits Telegram's 64 bytes, forged or
// malformed data parses to null, and the buttons of the old interface map
// onto new actions (the old "pay now" buttons onto an order screen, never
// onto a payment).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";
const { cb, parseCallback, isV2CallbackData, CALLBACK_MAX_BYTES } = await import("../src/lib/bot-v2/callbacks.ts");

const UUID = "0a1b2c3d-0000-4000-8000-00000000000a";

const ACTIONS = [
  { a: "home" },
  { a: "connect" },
  { a: "new", device: "android" },
  { a: "new", device: "tv" },
  { a: "devs" },
  { a: "dev", uuid: UUID },
  { a: "qr", uuid: UUID },
  { a: "qrhide" },
  { a: "del", uuid: UUID },
  { a: "delok", uuid: UUID },
  { a: "wallet" },
  { a: "plans", from: "w" },
  { a: "plans", from: "c" },
  { a: "terms", kind: "plan3", from: "c" },
  { a: "terms", kind: "plan1", from: "w" },
  { a: "slot", from: "c" },
  { a: "order", product: "plan3", term: 12, from: "c" },
  { a: "order", product: "slot", term: 6, from: "w" },
  { a: "pay", product: "plan1", term: 1, nonce: "AbC-_123", from: "w" },
  { a: "pay", product: "slot", term: 12, nonce: "zzzzzzzzzzzzzzzz", from: "c" },
  { a: "renew", from: "w" },
  { a: "renew", from: "d" },
  { a: "plans", from: "d" },
  { a: "slot", from: "d" },
  { a: "order", product: "plan3", term: 12, from: "d" },
  { a: "topup" },
  { a: "topfor", product: "plan3", term: 6, from: "c" },
  { a: "topm", method: "lava" },
  { a: "topa", method: "crypto", cents: 100_000 },
  { a: "topx", method: "card" },
  { a: "lava", cents: 2050, method: "applepay", currency: "EUR" },
  { a: "promo" },
  { a: "invite" },
  { a: "help" },
  { a: "lang" },
  { a: "setlang", lang: "de" },
];

describe("encode and parse", () => {
  test("every action round-trips and fits 64 bytes", () => {
    for (const action of ACTIONS) {
      const data = cb(action);
      assert.ok(Buffer.byteLength(data) <= CALLBACK_MAX_BYTES, data);
      assert.ok(isV2CallbackData(data), data);
      assert.deepEqual(parseCallback(data), action, data);
    }
  });

  test("forged or malformed data is null", () => {
    const bad = [
      "",
      "k:",
      "k:nope",
      "k:new:toaster",
      "k:dev:",
      "k:dev:../../etc",
      "k:dev:" + "a".repeat(65),
      "k:del:has space",
      "k:terms:plan9",
      "k:ord:plan3:3",
      "k:ord:plan3:6:x",
      "k:ord:device:6",
      "k:pay:plan3:6",
      "k:pay:plan3:6:short",
      "k:pay:plan3:6:has space!",
      "k:topa:card:50",
      "k:topa:card:100001",
      "k:topa:card:12.5",
      "k:topa:paypal:1000",
      "k:lava:2000:bancontact:EUR",
      "k:lava:2000:card:RUB",
      "k:lang:pt",
      "k:plans:c:extra",
      "k:" + "home".repeat(20),
      null,
      undefined,
      42,
    ];
    for (const data of bad) assert.equal(parseCallback(data), null, String(data));
  });

  test("an action that would not fit is a programming error", () => {
    assert.throws(() => cb({ a: "dev", uuid: "x".repeat(70) }), /64 bytes/);
  });
});

describe("buttons of the old interface", () => {
  const cases = [
    ["menu", { a: "home" }],
    ["account", { a: "wallet" }],
    ["pricing", { a: "wallet" }],
    ["profiles", { a: "devs" }],
    ["create", { a: "connect" }],
    ["guide", { a: "help" }],
    ["docs", { a: "help" }],
    ["referral", { a: "invite" }],
    ["copy_ref_ab12cd34", { a: "invite" }],
    ["topup", { a: "topup" }],
    ["topup_m_crypto", { a: "topm", method: "crypto" }],
    ["tu_card_20", { a: "topa", method: "card", cents: 2000 }],
    ["tu_lava_12.5", { a: "topa", method: "lava", cents: 1250 }],
    ["tu_cryptobot_manual", { a: "topx", method: "cryptobot" }],
    ["lv_20_paypal_USD", { a: "lava", cents: 2000, method: "paypal", currency: "USD" }],
    ["dev_windows", { a: "new", device: "windows" }],
    [`link_${UUID}`, { a: "dev", uuid: UUID }],
    [`del_${UUID}`, { a: "del", uuid: UUID }],
    [`cdel_${UUID}`, { a: "delok", uuid: UUID }],
    ["setlang_fr", { a: "setlang", lang: "fr" }],
    ["buyplan", { a: "plans", from: "w" }],
    ["buyplan_plan1", { a: "terms", kind: "plan1", from: "w" }],
    ["adddev", { a: "slot", from: "w" }],
  ];

  test("map onto the new screens", () => {
    for (const [data, action] of cases) assert.deepEqual(parseCallback(data), action, data);
  });

  test('the old one-tap purchases open the order screen, never "pay"', () => {
    assert.deepEqual(parseCallback("buyterm_plan3_6"), { a: "order", product: "plan3", term: 6, from: "w" });
    assert.deepEqual(parseCallback("adddev_12"), { a: "order", product: "slot", term: 12, from: "w" });
    for (const data of ["buyterm_plan3_6", "adddev_1", "adddev_6", "adddev_12", "buyterm_plan1_12"]) {
      assert.notEqual(parseCallback(data)?.a, "pay", data);
    }
  });

  test("malformed old data is null", () => {
    for (const data of ["dev_toaster", "link_", "cdel_a b", "setlang_xx", "buyterm_plan3_5", "adddev_2", "tu_card_x", "lv_20_bancontact_EUR", "adm:x"]) {
      assert.equal(parseCallback(data), null, data);
    }
  });
});
