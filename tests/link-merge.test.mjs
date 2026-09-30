// tests/link-merge.test.mjs — run: npm test
//
// Linking Telegram to an e-mail account (lib/admin-ops.ts
// linkTelegramToPrimary, the cabinet's "Link Telegram") moves the tg_ USD
// wallet and running plans into the e-mail account instead of orphaning them
// under an id nothing reads any more: all or nothing, under the wallet locks,
// with an audit trail; a live Mini App session of the tg_ id follows the link.
//
// Ids, codes and tokens are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = ["333333333", "KOVRA-money-test"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { linkTelegramToPrimary } = await import("../src/lib/admin-ops.ts");
const { createSession, getSession } = await import("../src/lib/session.ts");

const DAY = 86_400_000;
const TG = "tg_100000001";
const EM = "em_someone@example.test";

const cents = (uid) => Number(mem.store.get(`balance_usd:${uid}`) ?? 0);
const subsOf = (uid) => JSON.parse(mem.store.get(`subs:${uid}`) ?? "[]");
const plan = (kind = "plan1", days = 20) => ({
  id: `p-${kind}-${days}`,
  kind,
  slots: kind === "plan3" ? 3 : 1,
  createdAt: Date.now() - DAY,
  expiresAt: Date.now() + days * DAY,
});

beforeEach(() => mem.reset());

describe("linking Telegram to an e-mail account moves the money", () => {
  beforeEach(() => {
    mem.store.set(`user:${EM}`, JSON.stringify({ authMethod: "email", email: "someone@example.test", createdAt: 1 }));
    mem.store.set(`user:${TG}`, JSON.stringify({ authMethod: "telegram", telegramId: "100000001", createdAt: 1 }));
  });

  test("the tg_ wallet and running plans move to the e-mail account", async () => {
    mem.store.set(`balance_usd:${TG}`, "3500");
    mem.store.set(`balance_usd:${EM}`, "1000");
    mem.store.set(`subs:${TG}`, JSON.stringify([plan("plan1"), { ...plan("plan3"), expiresAt: Date.now() - DAY }]));
    const r = await linkTelegramToPrimary(EM, "100000001");
    assert.equal(r.success, true);
    assert.equal(r.movedCents, 3500);
    assert.equal(r.movedSubs, 1, "only the running plan");
    assert.equal(cents(EM), 4500);
    assert.equal(cents(TG), 0);
    assert.deepEqual(subsOf(EM).map((s) => s.kind), ["plan1"]);
    assert.deepEqual(subsOf(TG), []);
    assert.equal(mem.store.get(`alias:${TG}`), EM);
    const audit = [...mem.store.keys()].filter((k) => k.startsWith("audit:")).map((k) => JSON.parse(mem.store.get(k)).op);
    assert.ok(audit.includes("merge_start") && audit.includes("merge_done") && audit.includes("link"));
  });

  test("a purchase in flight on the tg_ wallet: the link is refused, nothing moves", async () => {
    mem.store.set(`balance_usd:${TG}`, "3500");
    mem.store.set(`lock:wallet:${TG}`, "t-someone-else");
    const r = await linkTelegramToPrimary(EM, "100000001");
    assert.equal(r.success, false);
    assert.match(r.reason, /busy/);
    assert.equal(cents(TG), 3500);
    assert.equal(cents(EM), 0);
    assert.equal(mem.store.get(`alias:${TG}`), undefined);
  });

  test("the credit fails: the source is refunded and the link is refused", async () => {
    mem.store.set(`balance_usd:${TG}`, "3500");
    mem.failNext("incrby", { key: `balance_usd:${EM}` });
    const r = await linkTelegramToPrimary(EM, "100000001");
    assert.equal(r.success, false);
    assert.equal(cents(TG), 3500);
    assert.equal(cents(EM), 0);
    assert.equal(mem.store.get(`alias:${TG}`), undefined);
    assert.equal(mem.store.get(`lock:wallet:${TG}`), undefined, "locks released");
  });

  test("the plans cannot be written: the money goes back, the link is refused", async () => {
    mem.store.set(`balance_usd:${TG}`, "700");
    mem.store.set(`subs:${TG}`, JSON.stringify([plan("plan1")]));
    mem.failNext("set", { key: `subs:${EM}` });
    const r = await linkTelegramToPrimary(EM, "100000001");
    assert.equal(r.success, false);
    assert.equal(cents(TG), 700);
    assert.equal(cents(EM), 0);
    assert.equal(subsOf(TG).length, 1);
  });

  test("a live Mini App session of the tg_ account follows the link", async () => {
    const sid = await createSession(TG, true);
    assert.equal((await getSession(sid)).userId, TG);
    assert.equal((await linkTelegramToPrimary(EM, "100000001")).success, true);
    assert.equal((await getSession(sid)).userId, EM);
  });

  test("a wallet without any account record still moves", async () => {
    mem.store.delete(`user:${TG}`);
    mem.store.set(`balance_usd:${TG}`, "250");
    const r = await linkTelegramToPrimary(EM, "100000001");
    assert.equal(r.success, true);
    assert.equal(cents(EM), 250);
  });
});
