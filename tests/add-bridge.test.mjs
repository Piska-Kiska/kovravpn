// tests/add-bridge.test.mjs — run: npm test
//
// The /add/<token> bridge (the bot's "Add to Happ" button) only offers tokens
// that exist, hands Happ the plain subscription link, and renders in the
// language the bot passes. Tokens are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");
const { isSubTokenShape, subTokenExists, plainSubUrl } = await import("../src/lib/sub-token-lookup.ts");
const { addLangOf, ADD_DICTS } = await import("../src/app/add/[token]/add-i18n.ts");

describe("the /add bridge", () => {
  beforeEach(() => mem.reset());

  test("token shape", () => {
    assert.equal(isSubTokenShape("c0ffee00c0ffee00c0ffee00c0ffee00"), true);
    for (const t of ["", "short", "has/slash0000000000", "a".repeat(129), null, 7]) assert.equal(isSubTokenShape(t), false, String(t));
  });

  test("only existing tokens, per device or per user", async () => {
    mem.store.set("sub_prof:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", JSON.stringify({ userId: "tg_1", uuid: "u" }));
    mem.store.set("sub_token:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "tg_2");
    assert.equal(await subTokenExists("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
    assert.equal(await subTokenExists("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), true);
    assert.equal(await subTokenExists("cccccccccccccccccccccccccccccccc"), false);
    assert.equal(await subTokenExists("../../x"), false);
  });

  test("the plain link Happ imports", () => {
    assert.equal(plainSubUrl("abc0123456789abcdef"), "https://kovravpn.com/api/sub/abc0123456789abcdef");
  });

  test("page language from ?lang, English otherwise", () => {
    assert.equal(addLangOf("de"), "de");
    assert.equal(addLangOf(["fr", "ru"]), "fr");
    for (const v of [undefined, "", "pt", "EN", ["xx"]]) assert.equal(addLangOf(v), "en");
    for (const d of Object.values(ADD_DICTS)) assert.deepEqual(Object.keys(d).sort(), Object.keys(ADD_DICTS.en).sort());
  });
});
