// tests/admin-wipe.test.mjs — run: npm test
//
// KM-08 (remainder): the admin "Delete account" (planWipe / executeWipe)
// left `balance_usd:{id}` and `subs:{id}` behind, so a wiped Telegram user
// who came back found the old wallet and plans, and money was never part of
// what the admin confirmed. Now the confirmation shows the wallet and the
// running subscriptions (the account's and its linked Telegram id's), the
// wipe deletes them, and it refuses when the money changed after the admin
// looked.
//
// The admin bot runs against an in-memory Redis; its send/edit are recorded.
// Ids are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { planWipe, executeWipe, wipeMoneyFingerprint } = await import("../src/lib/admin-ops.ts");
const { tryHandleAdminCallback } = await import("../src/lib/admin-bot.ts");
const { ADMIN_TG_ID } = await import("../src/lib/bot-owner.ts");

const DAY = 86_400_000;
const EM = "em_holder@example.test";
const TG = "tg_100000001";
const ADMIN = Number(ADMIN_TG_ID);

function seed() {
  mem.store.set(`user:${EM}`, JSON.stringify({ authMethod: "linked", email: "holder@example.test", telegramId: "100000001", createdAt: 1 }));
  mem.store.set(`account:${EM}`, JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 }));
  mem.store.set(`alias:${TG}`, EM);
  mem.store.set(`balance_usd:${EM}`, "1250");
  mem.store.set(`subs:${EM}`, JSON.stringify([{ id: "p1", kind: "plan3", slots: 3, createdAt: 1, expiresAt: Date.now() + 20 * DAY }]));
  // Money that reached the Telegram id after the link.
  mem.store.set(`balance_usd:${TG}`, "300");
}

beforeEach(() => {
  mem.reset();
  seed();
});

describe("planWipe / executeWipe", () => {
  test("the plan lists the wallet and subscriptions, and shows the money", async () => {
    const plan = await planWipe(EM);
    for (const k of [`balance_usd:${EM}`, `subs:${EM}`, `balance_usd:${TG}`, `subs:${TG}`]) {
      assert.ok(plan.redisKeys.includes(k), k);
    }
    assert.deepEqual(
      plan.money.map((m) => [m.userId, m.walletCents, m.runningSubs.map((s) => s.kind)]),
      [
        [EM, 1250, ["plan3"]],
        [TG, 300, []],
      ],
    );
  });

  test("the wipe deletes them", async () => {
    await executeWipe(await planWipe(EM));
    for (const k of [`balance_usd:${EM}`, `subs:${EM}`, `balance_usd:${TG}`, `account:${EM}`]) {
      assert.equal(mem.store.has(k), false, k);
    }
    const audit = [...mem.store.keys()].find((k) => k.startsWith("audit:") && k.endsWith(":wipe"));
    assert.ok(audit);
    assert.deepEqual(JSON.parse(mem.store.get(audit)).money[0], { userId: EM, walletCents: 1250, runningSubs: 1 });
  });

  test("the fingerprint changes with the money", async () => {
    const before = wipeMoneyFingerprint((await planWipe(EM)).money);
    mem.store.set(`balance_usd:${EM}`, "1251");
    assert.notEqual(wipeMoneyFingerprint((await planWipe(EM)).money), before);
  });
});

describe("admin bot: Delete account", () => {
  let edits;
  const send = async () => {};
  const edit = async (_chat, _msg, text, kb = []) => {
    edits.push({ text, kb });
  };
  const tap = (data) => tryHandleAdminCallback(ADMIN, 10, data, send, edit);

  beforeEach(() => {
    edits = [];
    mem.store.set(`admin_state:${ADMIN}`, JSON.stringify({ step: "idle", selectedUserId: EM }));
  });

  async function confirmScreen() {
    await tap("adm:wipe_redis");
    const screen = edits.at(-1);
    const go = screen.kb.flat().find((b) => b.callback_data.startsWith("adm:wipe_go:"));
    return { screen, go };
  }

  test("the confirmation shows the wallet and the running plan; confirming deletes them", async () => {
    const { screen, go } = await confirmScreen();
    assert.match(screen.text, /Будут удалены деньги и подписки/);
    assert.match(screen.text, /\$12\.50/);
    assert.match(screen.text, /\$3\.00/);
    assert.match(screen.text, /plan3 ×3 до/);
    await tap(go.callback_data);
    assert.match(edits.at(-1).text, /Удаление завершено/);
    assert.equal(mem.store.has(`balance_usd:${EM}`), false);
    assert.equal(mem.store.has(`subs:${EM}`), false);
  });

  test("money that changed after the confirmation: nothing is deleted", async () => {
    const { go } = await confirmScreen();
    mem.store.set(`balance_usd:${EM}`, "5250"); // a top-up landed meanwhile
    await tap(go.callback_data);
    assert.match(edits.at(-1).text, /Деньги изменились после подтверждения/);
    assert.equal(mem.store.get(`balance_usd:${EM}`), "5250");
    assert.ok(mem.store.has(`account:${EM}`));
  });

  test("no money: the confirmation says so", async () => {
    mem.store.delete(`balance_usd:${EM}`);
    mem.store.delete(`subs:${EM}`);
    mem.store.delete(`balance_usd:${TG}`);
    const { screen } = await confirmScreen();
    assert.match(screen.text, /Денег в кошельке и действующих подписок нет/);
  });
});
