// tests/bot-v2-gate.test.mjs — run: npm test
//
// Who sees the new bot interface (src/lib/bot-v2/gate.ts): the owner always;
// others only through the Redis set kovra:botv2:users ("*" or their chat id)
// or KOVRA_BOT_V2_ALL=1. A Redis failure means the old interface.
//
// Ids are made up, except the owner's, which the code already carries.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { isBotV2, resetBotV2Cache, BOT_V2_SET, botV2ForAll } = await import("../src/lib/bot-v2/gate.ts");
const { ADMIN_TG_ID } = await import("../src/lib/bot-owner.ts");

const SOMEONE = 100000123;
const OTHER = 100000456;
const NO_ENV = {};

beforeEach(() => {
  mem.reset();
  resetBotV2Cache();
});

describe("bot v2 gate", () => {
  test("the owner is always in, even with Redis down", async () => {
    mem.failNext("smismember", { times: 5 });
    assert.equal(await isBotV2(Number(ADMIN_TG_ID), NO_ENV), true);
    assert.equal(await isBotV2(ADMIN_TG_ID, NO_ENV), true);
    assert.equal(mem.calls.get("smismember") ?? 0, 0);
  });

  test("an empty set keeps everyone else on the old interface", async () => {
    assert.equal(await isBotV2(SOMEONE, NO_ENV), false);
  });

  test("a chat id in the set opens it for that chat only", async () => {
    await mem.redis.sadd(BOT_V2_SET, String(SOMEONE));
    assert.equal(await isBotV2(SOMEONE, NO_ENV), true);
    assert.equal(await isBotV2(OTHER, NO_ENV), false);
  });

  test('"*" in the set opens it for everyone', async () => {
    await mem.redis.sadd(BOT_V2_SET, "*");
    assert.equal(await isBotV2(SOMEONE, NO_ENV), true);
    assert.equal(await isBotV2(OTHER, NO_ENV), true);
  });

  test("KOVRA_BOT_V2_ALL=1 opens it without Redis; other values do not", async () => {
    assert.equal(await isBotV2(SOMEONE, { KOVRA_BOT_V2_ALL: "1" }), true);
    assert.equal(mem.calls.get("smismember") ?? 0, 0);
    for (const v of ["0", "true", "yes", "", " 1"]) {
      assert.equal(botV2ForAll({ KOVRA_BOT_V2_ALL: v }), false, v);
    }
  });

  test("a Redis failure means the old interface, not an error", async () => {
    mem.failNext("smismember");
    assert.equal(await isBotV2(SOMEONE, NO_ENV), false);
  });

  test("answers are cached; resetBotV2Cache applies a set change at once", async () => {
    assert.equal(await isBotV2(SOMEONE, NO_ENV), false);
    await mem.redis.sadd(BOT_V2_SET, String(SOMEONE));
    assert.equal(await isBotV2(SOMEONE, NO_ENV), false, "cached");
    resetBotV2Cache();
    assert.equal(await isBotV2(SOMEONE, NO_ENV), true);
  });

  test("malformed chat ids are never in", async () => {
    await mem.redis.sadd(BOT_V2_SET, "*");
    for (const id of [0, NaN, 1.5, "", "abc", "12 34", "*", "1e9", Number.MAX_SAFE_INTEGER + 2]) {
      assert.equal(await isBotV2(id, NO_ENV), false, String(id));
    }
  });
});
