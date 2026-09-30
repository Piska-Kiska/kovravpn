// tests/link-merge.test.mjs — run: npm test
//
// Linking Telegram to an e-mail account (lib/admin-ops.ts
// linkTelegramToPrimary, the cabinet's "Link Telegram") moves the tg_ USD
// wallet and running plans into the e-mail account instead of orphaning them
// under an id nothing reads any more: all or nothing (one script,
// lib/tg-link-merge.ts), under the wallet locks for the whole link and the
// subscription locks for the move, with an audit trail; a live Mini App
// session of the tg_ id follows the link.
//
// The in-memory Redis runs the scripts' JS twins (tests/link-scripts-lua
// holds them to the real Lua). Ids, codes and tokens are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = ["333333333", "KOVRA-money-test"].join(":");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { linkTelegramToPrimary } = await import("../src/lib/admin-ops.ts");
const { createSession, getSession } = await import("../src/lib/session.ts");
const mergeLib = await import("../src/lib/tg-link-merge.ts");
const { addSubscription } = await import("../src/lib/subscriptions.ts");
const { registerLinkScripts } = await import("./support/link-scripts-twin.mjs");
registerLinkScripts(mem, mergeLib);

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

  // Main's first version moved in steps (debit, credit, append, clear) and
  // undid them one by one; these two tests failed a step in the middle. The
  // move is one script now, so there is no middle: Redis failing runs it
  // completely or not at all.
  test("the move script fails: nothing moves, the link is refused, the locks are released", async () => {
    mem.store.set(`balance_usd:${TG}`, "3500");
    mem.store.set(`subs:${TG}`, JSON.stringify([plan("plan1")]));
    mem.failNext("eval", { key: new RegExp(`^balance_usd:${TG},`) });
    const r = await linkTelegramToPrimary(EM, "100000001");
    assert.equal(r.success, false);
    assert.match(r.reason, /Could not move/);
    assert.equal(cents(TG), 3500);
    assert.equal(cents(EM), 0);
    assert.equal(subsOf(TG).length, 1);
    assert.deepEqual(subsOf(EM), []);
    assert.equal(mem.store.get(`alias:${TG}`), undefined);
    for (const k of [`lock:wallet:${TG}`, `lock:wallet:${EM}`, `lock:subs:${TG}`, `lock:subs:${EM}`]) {
      assert.equal(mem.store.get(k), undefined, `${k} released`);
    }
  });

  test("the reply is lost after the script ran: linking again finishes, nothing twice", async () => {
    mem.store.set(`balance_usd:${TG}`, "700");
    mem.store.set(`subs:${TG}`, JSON.stringify([plan("plan1")]));
    const realEval = mem.redis.eval;
    let lost = false;
    mem.redis.eval = async (script, keys, args) => {
      const reply = await realEval(script, keys, args);
      if (script === mergeLib.MOVE_MONEY_LUA && !lost) {
        lost = true;
        throw new Error("injected: reply lost");
      }
      return reply;
    };
    let first;
    try {
      first = await linkTelegramToPrimary(EM, "100000001");
    } finally {
      mem.redis.eval = realEval;
    }
    assert.equal(first.success, false, "the caller cannot know the move ran");
    assert.equal(mem.store.get(`alias:${TG}`), undefined);
    const again = await linkTelegramToPrimary(EM, "100000001");
    assert.equal(again.success, true);
    assert.equal(again.movedCents, 0, "the money moved once, on the first run");
    assert.equal(again.movedSubs, 0, "the plan is not added twice");
    assert.equal(cents(EM), 700);
    assert.equal(cents(TG), 0);
    assert.equal(subsOf(EM).length, 1);
    assert.equal(mem.store.get(`alias:${TG}`), EM);
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

describe("linking under concurrency", () => {
  beforeEach(() => {
    mem.store.set(`user:${EM}`, JSON.stringify({ authMethod: "email", email: "someone@example.test", createdAt: 1 }));
    mem.store.set(`user:${TG}`, JSON.stringify({ authMethod: "telegram", telegramId: "100000001", createdAt: 1 }));
  });

  test("a top-up credited to tg_ between the read and the move moves with it", async () => {
    mem.store.set(`balance_usd:${TG}`, "1000");
    let credited = false;
    const realEval = mem.redis.eval;
    mem.redis.eval = async (script, keys, args) => {
      if (script === mergeLib.MOVE_MONEY_LUA && !credited) {
        credited = true;
        await mem.redis.incrby(`balance_usd:${TG}`, 500); // a webhook, no lock
      }
      return realEval(script, keys, args);
    };
    let r;
    try {
      r = await linkTelegramToPrimary(EM, "100000001");
    } finally {
      mem.redis.eval = realEval;
    }
    assert.equal(r.success, true);
    assert.equal(r.movedCents, 1500, "the script moves the balance as it is when it runs");
    assert.equal(cents(EM), 1500);
    assert.equal(cents(TG), 0);
  });

  test("money that reaches tg_ after the link is swept by linking the same pair again", async () => {
    mem.store.set(`balance_usd:${TG}`, "300");
    assert.equal((await linkTelegramToPrimary(EM, "100000001")).success, true);
    // A webhook that resolved the wallet owner before the alias existed.
    mem.store.set(`balance_usd:${TG}`, "450");
    mem.store.set(`subs:${TG}`, JSON.stringify([plan("plan3", 30)]));
    const again = await linkTelegramToPrimary(EM, "100000001");
    assert.equal(again.success, true);
    assert.equal(again.movedCents, 450);
    assert.equal(again.movedSubs, 1);
    assert.equal(cents(EM), 750);
    assert.deepEqual(subsOf(EM).map((s) => s.kind), ["plan3"]);
  });

  test("a grant to the primary waiting on its subscription lock is kept, not overwritten", async () => {
    mem.store.set(`subs:${TG}`, JSON.stringify([plan("plan1")]));
    // A payment webhook grants the primary a device while the link holds
    // lock:subs:EM: it waits for the lock, then appends to the merged list.
    let grant;
    mem.beforeNext("eval", {
      key: new RegExp(`^balance_usd:${TG},`),
      run: async () => {
        grant = addSubscription(EM, "device", 30, 1);
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
    });
    const r = await linkTelegramToPrimary(EM, "100000001");
    await grant;
    assert.equal(r.success, true);
    assert.deepEqual(subsOf(EM).map((s) => s.kind).sort(), ["device", "plan1"]);
  });

  test("a writer that got past the lock changes the list: the move re-reads, nothing is lost", async () => {
    mem.store.set(`subs:${TG}`, JSON.stringify([plan("plan1")]));
    const THEIRS = { ...plan("device", 30), id: "d-theirs" };
    let slipped = false;
    const realEval = mem.redis.eval;
    mem.redis.eval = async (script, keys, args) => {
      if (script === mergeLib.MOVE_MONEY_LUA && !slipped) {
        slipped = true;
        // withSubsLock goes ahead without the lock after waiting 3 s.
        mem.store.set(`subs:${EM}`, JSON.stringify([THEIRS]));
      }
      return realEval(script, keys, args);
    };
    let r;
    try {
      r = await linkTelegramToPrimary(EM, "100000001");
    } finally {
      mem.redis.eval = realEval;
    }
    assert.equal(r.success, true);
    assert.deepEqual(subsOf(EM).map((s) => s.id), ["d-theirs", "p-plan1-20"]);
    assert.deepEqual(subsOf(TG), []);
  });

  test("a subscription lock held by a stuck writer: the link is refused, nothing moves", async () => {
    mem.store.set(`balance_usd:${TG}`, "900");
    mem.store.set(`lock:subs:${EM}`, "t-stuck");
    const r = await linkTelegramToPrimary(EM, "100000001", {}, { subsLockWaitMs: 60 });
    assert.equal(r.success, false);
    assert.match(r.reason, /busy/);
    assert.equal(cents(TG), 900);
    assert.equal(cents(EM), 0);
    assert.equal(mem.store.get(`lock:subs:${TG}`), undefined, "the first subscription lock is released");
  });
});

describe("linking refuses what it cannot carry", () => {
  beforeEach(() => {
    mem.store.set(`user:${EM}`, JSON.stringify({ authMethod: "email", email: "someone@example.test", createdAt: 1 }));
  });

  test("a wallet that is not whole cents: refused, nothing written, no alias", async () => {
    mem.store.set(`balance_usd:${TG}`, "12.5");
    const r = await linkTelegramToPrimary(EM, "100000001");
    assert.equal(r.success, false);
    assert.match(r.reason, /Could not move/);
    assert.equal(mem.store.get(`balance_usd:${TG}`), "12.5");
    assert.equal(mem.store.get(`alias:${TG}`), undefined);
  });

  test("a subscription list that is not JSON: refused, nothing written", async () => {
    mem.store.set(`subs:${TG}`, "{broken");
    mem.store.set(`balance_usd:${TG}`, "100");
    const r = await linkTelegramToPrimary(EM, "100000001");
    assert.equal(r.success, false);
    assert.equal(cents(TG), 100);
    assert.equal(mem.store.get(`subs:${TG}`), "{broken");
  });

  test("tg_X cannot be linked to itself", async () => {
    mem.store.set(`user:${TG}`, JSON.stringify({ authMethod: "telegram", telegramId: "100000001", createdAt: 1 }));
    mem.store.set(`balance_usd:${TG}`, "100");
    const r = await linkTelegramToPrimary(TG, "100000001");
    assert.equal(r.success, false);
    assert.match(r.reason, /itself/);
    assert.equal(mem.store.has(`user:${TG}`), true, "nothing wiped");
    assert.equal(cents(TG), 100);
  });

  test("a malformed Telegram id is refused before any Redis access", async () => {
    const total = () => [...mem.calls.values()].reduce((a, b) => a + b, 0);
    const before = total();
    const r = await linkTelegramToPrimary(EM, "12ab");
    assert.equal(r.success, false);
    assert.equal(total(), before);
  });
});

describe("expiry sync after the link", () => {
  beforeEach(() => {
    mem.store.set(`user:${EM}`, JSON.stringify({ authMethod: "email", email: "someone@example.test", createdAt: 1 }));
  });

  test("moved subscriptions push the primary's expiry to the panels", async () => {
    mem.store.set(`subs:${TG}`, JSON.stringify([plan("plan3")]));
    const synced = [];
    const r = await linkTelegramToPrimary(EM, "100000001", {}, { syncExpiry: async (id) => void synced.push(id) });
    assert.equal(r.success, true);
    assert.deepEqual(synced, [EM]);
  });

  test("only money moved: no panel call", async () => {
    mem.store.set(`balance_usd:${TG}`, "100");
    const synced = [];
    await linkTelegramToPrimary(EM, "100000001", {}, { syncExpiry: async (id) => void synced.push(id) });
    assert.deepEqual(synced, []);
  });

  test("a failing sync does not undo the link", async () => {
    mem.store.set(`subs:${TG}`, JSON.stringify([plan("plan1")]));
    const r = await linkTelegramToPrimary(EM, "100000001", {}, {
      syncExpiry: async () => {
        throw new Error("panel down");
      },
    });
    assert.equal(r.success, true);
    assert.equal(mem.store.get(`alias:${TG}`), EM);
  });
});
