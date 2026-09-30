// tests/wallet-client.test.mjs — run: npm test
//
// The client side of the unified balance:
//   • src/lib/dashboard/wallet.ts — the purchase request id (kept until the
//     purchase succeeds, so a lost answer never charges twice), the meaning of
//     every /api/wallet/purchase answer, the top-up amount rules;
//   • src/lib/dashboard/pay-methods.ts — the "Balance" row of the checkout and
//     the top-up methods;
//   • src/lib/back-stack.ts — what Telegram's back arrow closes.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import "./support/load-ts.mjs";

const {
  REQUEST_ID_RE,
  balanceCovers,
  checkTopupAmount,
  clearRequestId,
  keepsRequestId,
  newRequestId,
  purchaseOutcome,
  requestIdFor,
  usdToCentsClient,
} = await import("../src/lib/dashboard/wallet.ts");
const { WALLET_KEY, buildPayOptions, buildTopupOptions, choosePayKey, topupMinUsd } = await import("../src/lib/dashboard/pay-methods.ts");
const { DASH_DICT } = await import("../src/lib/dash-i18n.ts");
const { createBackStack } = await import("../src/lib/back-stack.ts");

function memoryStorage() {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function throwingStorage() {
  const fail = () => {
    throw new Error("SecurityError: storage blocked");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

let counter = 0;
const makeId = () => `req_${String(++counter).padStart(8, "0")}`;
const PLAN = { kind: "plan3", term: 12 };
const SLOT = { kind: "device", term: 1 };

describe("purchase request id", () => {
  test("a new id is 24 url-safe characters and passes the server's rule", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newRequestId()));
    assert.equal(ids.size, 50);
    for (const id of ids) {
      assert.match(id, /^[A-Za-z0-9_-]{24}$/);
      assert.match(id, REQUEST_ID_RE);
    }
  });

  test("the same product gets the same id until it is cleared; another product another id", () => {
    const store = memoryStorage();
    const mem = new Map();
    const a = requestIdFor(store, PLAN, mem, makeId);
    assert.equal(requestIdFor(store, PLAN, mem, makeId), a);
    const b = requestIdFor(store, SLOT, mem, makeId);
    assert.notEqual(a, b);
    clearRequestId(store, PLAN, mem);
    const c = requestIdFor(store, PLAN, mem, makeId);
    assert.notEqual(c, a);
    assert.equal(requestIdFor(store, SLOT, mem, makeId), b);
  });

  test("the id survives a reload (sessionStorage), not just the page view", () => {
    const store = memoryStorage();
    const first = requestIdFor(store, PLAN, new Map(), makeId);
    assert.equal(requestIdFor(store, PLAN, new Map(), makeId), first);
  });

  test("storage blocked: the page view still repeats its id", () => {
    const mem = new Map();
    const a = requestIdFor(throwingStorage(), PLAN, mem, makeId);
    assert.equal(requestIdFor(throwingStorage(), PLAN, mem, makeId), a);
    clearRequestId(throwingStorage(), PLAN, mem);
    assert.notEqual(requestIdFor(throwingStorage(), PLAN, mem, makeId), a);
    assert.equal(requestIdFor(null, SLOT, mem, makeId), requestIdFor(null, SLOT, mem, makeId));
  });

  test("a tampered stored id is replaced", () => {
    const store = memoryStorage();
    store.setItem("kovra_wallet_req:plan3:12", "bad id!");
    const id = requestIdFor(store, PLAN, new Map(), makeId);
    assert.match(id, REQUEST_ID_RE);
    assert.notEqual(id, "bad id!");
  });
});

describe("purchase answers", () => {
  test("200: ok with the new balance, replay flag kept", () => {
    assert.deepEqual(purchaseOutcome(200, { ok: true, priceCents: 7908, balanceCents: 2092, replayed: true }), {
      kind: "ok",
      priceCents: 7908,
      balanceCents: 2092,
      replayed: true,
    });
    assert.deepEqual(purchaseOutcome(200, { ok: true }), { kind: "error" });
  });

  test("402: how much is missing", () => {
    assert.deepEqual(purchaseOutcome(402, { ok: false, error: "insufficient_balance", priceCents: 7908, balanceCents: 1250, needCents: 6658 }), {
      kind: "insufficient",
      priceCents: 7908,
      balanceCents: 1250,
      needCents: 6658,
    });
    // Junk numbers never go negative.
    assert.deepEqual(purchaseOutcome(402, { error: "insufficient_balance", needCents: -5, balanceCents: "x" }), {
      kind: "insufficient",
      priceCents: 0,
      balanceCents: 0,
      needCents: 0,
    });
  });

  test("409s", () => {
    assert.deepEqual(purchaseOutcome(409, { error: "busy" }), { kind: "busy" });
    assert.deepEqual(purchaseOutcome(409, { error: "in_progress" }), { kind: "busy" });
    assert.deepEqual(purchaseOutcome(409, { error: "request_reused" }), { kind: "reused" });
    assert.deepEqual(purchaseOutcome(409, { error: "no_plan" }), { kind: "no_plan" });
    assert.deepEqual(purchaseOutcome(409, { error: "other_plan_active", activePlan: "plan1" }), { kind: "other_plan", activePlan: "plan1" });
    assert.deepEqual(purchaseOutcome(409, { error: "other_plan_active", activePlan: "plan9" }), { kind: "other_plan", activePlan: null });
  });

  test("grant failures: refunded or stuck", () => {
    assert.deepEqual(purchaseOutcome(500, { error: "grant_failed", refunded: true }), { kind: "refunded" });
    assert.deepEqual(purchaseOutcome(500, { error: "grant_failed", refunded: false }), { kind: "stuck" });
    assert.deepEqual(purchaseOutcome(500, { error: "grant_failed" }), { kind: "stuck" });
  });

  test("auth, rate limit and anything else", () => {
    assert.deepEqual(purchaseOutcome(401, {}), { kind: "unauthorized" });
    assert.deepEqual(purchaseOutcome(429, {}), { kind: "rate_limited" });
    assert.deepEqual(purchaseOutcome(500, { error: "internal" }), { kind: "error" });
    assert.deepEqual(purchaseOutcome(502, null), { kind: "error" });
    assert.deepEqual(purchaseOutcome(400, "oops"), { kind: "error" });
  });

  test("the id is dropped only after success or when the server refused the id itself", () => {
    assert.equal(keepsRequestId({ kind: "ok", balanceCents: 0, priceCents: 1, replayed: false }), false);
    assert.equal(keepsRequestId({ kind: "reused" }), false);
    for (const kind of ["busy", "refunded", "stuck", "rate_limited", "unauthorized", "error"]) {
      assert.equal(keepsRequestId({ kind }), true, kind);
    }
    assert.equal(keepsRequestId({ kind: "insufficient", needCents: 1, balanceCents: 0, priceCents: 1 }), true);
  });
});

describe("top-up amount", () => {
  test("accepted forms, in exact cents", () => {
    assert.deepEqual(checkTopupAmount("20", 5, 1000), { ok: true, amountUsd: 20, cents: 2000 });
    assert.deepEqual(checkTopupAmount(" 25.5 ", 5, 1000), { ok: true, amountUsd: 25.5, cents: 2550 });
    assert.deepEqual(checkTopupAmount("25,50", 5, 1000), { ok: true, amountUsd: 25.5, cents: 2550 });
    assert.deepEqual(checkTopupAmount("$19.99", 5, 1000), { ok: true, amountUsd: 19.99, cents: 1999 });
    assert.deepEqual(checkTopupAmount("1000", 5, 1000), { ok: true, amountUsd: 1000, cents: 100000 });
    assert.deepEqual(checkTopupAmount("8", 8, 1000), { ok: true, amountUsd: 8, cents: 800 });
  });

  test("refused forms", () => {
    assert.deepEqual(checkTopupAmount("", 5, 1000), { ok: false, reason: "empty" });
    assert.deepEqual(checkTopupAmount("   ", 5, 1000), { ok: false, reason: "empty" });
    for (const v of ["abc", "1e3", "-5", "5.555", "1.2.3", "0x10", "Infinity", "1 000", "12345678"]) {
      assert.deepEqual(checkTopupAmount(v, 5, 1000), { ok: false, reason: "format" }, v);
    }
    assert.deepEqual(checkTopupAmount("7.99", 8, 1000), { ok: false, reason: "min" });
    assert.deepEqual(checkTopupAmount("1000.01", 5, 1000), { ok: false, reason: "max" });
  });

  test("0.1 + 0.2 style float traps do not move the limits", () => {
    assert.equal(checkTopupAmount("5.10", 5.1, 1000).ok, true);
    assert.equal(checkTopupAmount("5.09", 5.1, 1000).ok, false);
  });

  test("covers and cents", () => {
    assert.equal(balanceCovers(7908, 7908), true);
    assert.equal(balanceCovers(7907, 7908), false);
    assert.equal(balanceCovers(null, 500), false);
    assert.equal(balanceCovers(500, null), false);
    assert.equal(balanceCovers(500, 0), false);
    assert.equal(usdToCentsClient(79.08), 7908);
    assert.equal(usdToCentsClient(0.29), 29);
    assert.equal(usdToCentsClient(-1), null);
    assert.equal(usdToCentsClient(Number.NaN), null);
  });
});

describe("checkout: the Balance row", () => {
  const opts = (wallet, lang = "en") => buildPayOptions({ lang, t: DASH_DICT[lang], priceUsd: 79.08, lavaEnabled: true, wallet });

  test("no wallet or an empty one: no row", () => {
    assert.ok(!opts(null).some((o) => o.key === WALLET_KEY));
    assert.ok(!opts({ balanceCents: 0, priceCents: 7908 }).some((o) => o.key === WALLET_KEY));
  });

  test("enough: first, selectable and chosen by default over a remembered method", () => {
    const o = opts({ balanceCents: 10000, priceCents: 7908 });
    assert.equal(o[0].key, WALLET_KEY);
    assert.equal(o[0].disabled, false);
    assert.equal(o[0].route.kind, "wallet");
    assert.match(o[0].sub, /\$100\.00/);
    assert.equal(choosePayKey(o, null, "nowpayments"), WALLET_KEY);
  });

  test("a method picked on this page view still wins", () => {
    const o = opts({ balanceCents: 10000, priceCents: 7908 });
    assert.equal(choosePayKey(o, "nowpayments", null), "nowpayments");
  });

  test("not enough: shown, disabled, says what is missing; the remembered method is used", () => {
    const o = opts({ balanceCents: 1250, priceCents: 7908 });
    assert.equal(o[0].key, WALLET_KEY);
    assert.equal(o[0].disabled, true);
    assert.match(o[0].sub, /\$66\.58/);
    assert.equal(choosePayKey(o, null, "nowpayments"), "nowpayments");
    assert.equal(choosePayKey(o, WALLET_KEY, null), "platega", "a disabled row cannot be picked");
    assert.equal(choosePayKey(o, null, null), "platega");
  });

  test("the row is in every language", () => {
    for (const lang of ["en", "ru", "es", "de", "fr"]) {
      const row = opts({ balanceCents: 100, priceCents: 7908 }, lang)[0];
      assert.equal(row.label, DASH_DICT[lang].m_wallet);
      assert.ok(!row.sub.includes("{"), `${lang}: ${row.sub}`);
    }
  });
});

describe("top-up methods", () => {
  const all = [
    { id: "card", minUsd: 5, enabled: true },
    { id: "cryptobot", minUsd: 5, enabled: true },
    { id: "crypto", minUsd: 8, enabled: true },
    { id: "lava", minUsd: 5, enabled: true },
  ];
  const keys = (lang, methods = all, amountUsd = 20) => buildTopupOptions({ lang, t: DASH_DICT[lang], amountUsd, methods }).map((o) => `${o.group}:${o.key}`);

  test("English: card and PayPal first, rubles last", () => {
    const k = keys("en");
    assert.deepEqual(k.slice(0, 4), ["primary:lava:card", "primary:lava:paypal", "primary:cryptobot", "primary:crypto"]);
    assert.equal(k.at(-1), "more:card");
  });

  test("Russian: rubles first, lava.top under more", () => {
    const k = keys("ru");
    assert.deepEqual(k.slice(0, 3), ["primary:card", "primary:cryptobot", "primary:crypto"]);
    assert.ok(k.slice(3).every((x) => x.startsWith("more:lava:")));
  });

  test("lines without keys are not offered", () => {
    const k = keys("en", all.map((m) => (m.id === "lava" || m.id === "card" ? { ...m, enabled: false } : m)));
    assert.deepEqual(k, ["primary:cryptobot", "primary:crypto"]);
    assert.deepEqual(keys("en", []), []);
  });

  test("minimums per line, and per lava.top row", () => {
    const o = buildTopupOptions({ lang: "en", t: DASH_DICT.en, amountUsd: 20, methods: all });
    const crypto = o.find((x) => x.key === "crypto");
    assert.equal(topupMinUsd(crypto, all), 8);
    assert.equal(topupMinUsd({ route: { kind: "lava", id: "card", currency: "USD" } }, all), 5);
    // A euro row: €5.50 at the fixed rate is more than the line's $5.
    const sepa = o.find((x) => x.key === "lava:sepa");
    assert.ok(topupMinUsd(sepa, all) > 5.9 && topupMinUsd(sepa, all) < 6.1, String(topupMinUsd(sepa, all)));
  });

  test("the rows do not change with the amount: a row below its floor stays, marked", () => {
    const at = (amountUsd) => buildTopupOptions({ lang: "en", t: DASH_DICT.en, amountUsd, methods: all });
    const k25 = at(25).map((o) => o.key);
    assert.deepEqual(at(2).map((o) => o.key), k25, "same rows at $2");
    assert.deepEqual(at(undefined).map((o) => o.key), k25, "same rows with no amount");
    const card2 = at(2).find((o) => o.key === "lava:card");
    assert.equal(card2.amount, undefined, "no charge below the floor");
    assert.match(card2.sub, /from \$5/);
    assert.equal(card2.disabled, undefined, "still selectable: the amount check explains the minimum");
    assert.equal(choosePayKey(at(2), "lava:card", null), "lava:card", "the choice stays");
  });

  test("lava.top rows carry the exact charge", () => {
    const o = buildTopupOptions({ lang: "en", t: DASH_DICT.en, amountUsd: 20, methods: all });
    const card = o.find((x) => x.key === "lava:card");
    assert.ok(card.amount && /20/.test(card.amount), card.amount);
  });
});

describe("back stack", () => {
  test("Back closes the newest open layer; removal is by identity", () => {
    const s = createBackStack();
    const closed = [];
    const offA = s.push(() => closed.push("a"));
    s.push(() => closed.push("b"));
    assert.equal(s.size(), 2);
    assert.equal(s.back(), true);
    assert.deepEqual(closed, ["b"]);
    offA();
    assert.equal(s.size(), 1, "the layer that asked to leave is gone, the other stays");
    offA();
    assert.equal(s.size(), 1, "a second removal is harmless");
  });

  test("empty stack: Back is not handled", () => {
    assert.equal(createBackStack().back(), false);
  });

  test("subscribers hear pushes and removals", () => {
    const s = createBackStack();
    let n = 0;
    const off = s.subscribe(() => (n += 1));
    const rm = s.push(() => {});
    rm();
    off();
    s.push(() => {});
    assert.equal(n, 2);
  });
});
