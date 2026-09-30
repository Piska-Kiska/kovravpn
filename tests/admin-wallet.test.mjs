// tests/admin-wallet.test.mjs
//
// 30.09.2026 the owner credited a user from the admin bot and nothing
// arrived: «💰 Изменить баланс» still edited the old rouble field
// `account.balance` (audit KM-08) while money lives in `balance_usd:{userId}`.
// The admin change now moves the real wallet, in dollars, under the wallet
// purchase lock, with an audit record.
//
// Run: npm test

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { parseAdminWalletInput, applyAdminWalletChange, formatUsdCents, ADMIN_MAX_CENTS } = await import("../src/lib/admin-wallet.ts");

const USER = "tg_100000002";
const BAL = `balance_usd:${USER}`;
const LOG = `wallet_admin_log:${USER}`;
const ADMIN = "100000001";

beforeEach(() => mem.reset());

describe("parseAdminWalletInput", () => {
  test("signed dollar amounts, with cents, a comma or a dollar sign", () => {
    assert.deepEqual(parseAdminWalletInput("+10"), { op: "+", cents: 1000 });
    assert.deepEqual(parseAdminWalletInput("-5.50"), { op: "-", cents: 550 });
    assert.deepEqual(parseAdminWalletInput("=0"), { op: "=", cents: 0 });
    assert.deepEqual(parseAdminWalletInput(" = 12,5 "), { op: "=", cents: 1250 });
    assert.deepEqual(parseAdminWalletInput("+$25"), { op: "+", cents: 2500 });
    assert.deepEqual(parseAdminWalletInput("+ 0.01"), { op: "+", cents: 1 });
  });

  test("no sign, junk, zero moves, too many decimals and over the cap are refused", () => {
    for (const bad of ["10", "", "abc", "+", "+0", "-0", "+1.234", "+-5", "+1e3", "=10001", "+10000.01", "=₽5", "+5 руб"]) {
      assert.equal(parseAdminWalletInput(bad), null, bad);
    }
    assert.deepEqual(parseAdminWalletInput(`=${ADMIN_MAX_CENTS / 100}`), { op: "=", cents: ADMIN_MAX_CENTS });
  });

  test("formatUsdCents", () => {
    assert.equal(formatUsdCents(0), "$0.00");
    assert.equal(formatUsdCents(1250), "$12.50");
    assert.equal(formatUsdCents(5), "$0.05");
  });
});

describe("applyAdminWalletChange", () => {
  test("+ credits the real wallet and records who did it", async () => {
    mem.store.set(BAL, "300");
    const r = await applyAdminWalletChange(USER, { op: "+", cents: 1000 }, ADMIN);
    assert.deepEqual(r, { ok: true, beforeCents: 300, afterCents: 1300 });
    assert.equal(mem.store.get(BAL), "1300");
    const log = mem.lists.get(LOG);
    assert.equal(log.length, 1);
    const rec = JSON.parse(log[0]);
    assert.equal(rec.by, ADMIN);
    assert.equal(rec.beforeCents, 300);
    assert.equal(rec.afterCents, 1300);
  });

  test("- larger than the balance empties it and never goes below zero", async () => {
    mem.store.set(BAL, "400");
    const r = await applyAdminWalletChange(USER, { op: "-", cents: 1000 }, ADMIN);
    assert.deepEqual(r, { ok: true, beforeCents: 400, afterCents: 0 });
    assert.equal(mem.store.get(BAL), "0");
  });

  test("= sets the balance from either side, and = the same value changes nothing", async () => {
    mem.store.set(BAL, "400");
    assert.deepEqual(await applyAdminWalletChange(USER, { op: "=", cents: 2500 }, ADMIN), { ok: true, beforeCents: 400, afterCents: 2500 });
    assert.deepEqual(await applyAdminWalletChange(USER, { op: "=", cents: 100 }, ADMIN), { ok: true, beforeCents: 2500, afterCents: 100 });
    assert.deepEqual(await applyAdminWalletChange(USER, { op: "=", cents: 100 }, ADMIN), { ok: true, beforeCents: 100, afterCents: 100 });
    assert.equal(mem.lists.get(LOG).length, 3);
  });

  test("a wallet with no key yet starts at zero", async () => {
    const r = await applyAdminWalletChange(USER, { op: "+", cents: 500 }, ADMIN);
    assert.deepEqual(r, { ok: true, beforeCents: 0, afterCents: 500 });
  });

  test("a purchase holding the wallet lock makes the admin change wait, not interleave", async () => {
    mem.store.set(BAL, "1000");
    mem.store.set(`lock:wallet:${USER}`, "tsomeone");
    const r = await applyAdminWalletChange(USER, { op: "=", cents: 0 }, ADMIN);
    assert.deepEqual(r, { ok: false, reason: "busy" });
    assert.equal(mem.store.get(BAL), "1000");
  });

  test("a storage failure reports an error, releases the lock and moves nothing", async () => {
    mem.store.set(BAL, "1000");
    mem.failNext("incrby", { key: BAL });
    const r = await applyAdminWalletChange(USER, { op: "+", cents: 500 }, ADMIN);
    assert.deepEqual(r, { ok: false, reason: "error" });
    assert.equal(mem.store.get(BAL), "1000");
    assert.equal(mem.store.has(`lock:wallet:${USER}`), false);
  });

  test("a failed audit write does not undo the credit", async () => {
    mem.failNext("lpush");
    const r = await applyAdminWalletChange(USER, { op: "+", cents: 700 }, ADMIN);
    assert.deepEqual(r, { ok: true, beforeCents: 0, afterCents: 700 });
    assert.equal(mem.store.get(BAL), "700");
  });
});

describe("the admin bot uses the wallet (source guard)", () => {
  const bot = readFileSync(new URL("../src/lib/admin-bot.ts", import.meta.url), "utf8");
  test("no more writes to account.balance from the balance screen", () => {
    assert.doesNotMatch(bot, /account\.balance = /);
    assert.match(bot, /applyAdminWalletChange\(userId, change, String\(chatId\)\)/);
  });
  test("the card and the prompt speak dollars", () => {
    assert.match(bot, /💰 Баланс: <b>\$\{formatUsdCents\(s\.walletCents\)\}<\/b>/);
    assert.match(bot, /<code>\+10<\/code> — добавить \$10/);
    assert.doesNotMatch(bot, /добавить 100 ₽/);
  });
});
