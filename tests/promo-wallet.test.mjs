// tests/promo-wallet.test.mjs — run: npm test
//
// Promo codes credit the USD wallet (src/lib/promo.ts redeemPromoToWallet and
// POST /api/promo/redeem) against an in-memory Redis: once per code and user,
// maxUses holds under a race, and a code is never burned without the credit.
// Before 30.09.2026 the web route burned the code and credited nothing.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { createSession } = await import("../src/lib/session.ts");
const { redeemPromoToWallet, PROMO_ERROR_TEXT } = await import("../src/lib/promo.ts");
const { classifyServerError } = await import("../src/lib/server-errors.ts");
const { POST: redeemPost } = await import("../src/app/api/promo/redeem/route.ts");

const A = "tg_100000001";
const B = "tg_100000002";
const C = "tg_100000003";

function putPromo(code, fields = {}) {
  mem.store.set(
    `promo:${code}`,
    JSON.stringify({
      code,
      type: "balance",
      amount: 5,
      maxUses: 0,
      usedCount: 0,
      expiresAt: 0,
      createdAt: 1,
      createdBy: "admin",
      description: "",
      ...fields,
    }),
  );
}
const promo = (code) => JSON.parse(mem.store.get(`promo:${code}`));
const bal = (u) => Number(mem.store.get(`balance_usd:${u}`) ?? 0);

beforeEach(() => mem.reset());

describe("redeemPromoToWallet", () => {
  test("credits the wallet in cents, marks the claim credited and counts the use", async () => {
    putPromo("SPRING", { amount: 7.5 });
    const r = await redeemPromoToWallet("  spring ", A);
    assert.deepEqual(r, { ok: true, code: "SPRING", amountCents: 750, balanceCents: 750 });
    assert.equal(bal(A), 750);
    assert.equal(JSON.parse(mem.store.get(`promo_used:SPRING:${A}`)).state, "credited");
    assert.equal(promo("SPRING").usedCount, 1);
    assert.equal(mem.store.has("lock:promo:SPRING"), false);
  });

  test("adds to an existing balance", async () => {
    putPromo("MORE");
    mem.store.set(`balance_usd:${A}`, "1234");
    const r = await redeemPromoToWallet("MORE", A);
    assert.equal(r.balanceCents, 1734);
  });

  test("once per user: a repeat is already_used and credits nothing", async () => {
    putPromo("ONCE");
    assert.equal((await redeemPromoToWallet("ONCE", A)).ok, true);
    assert.deepEqual(await redeemPromoToWallet("ONCE", A), { ok: false, error: "already_used" });
    assert.equal(bal(A), 500);
    assert.equal(promo("ONCE").usedCount, 1);
  });

  test("a legacy marker (\"1\", from the old redeem) also counts as used", async () => {
    putPromo("OLD");
    mem.store.set(`promo_used:OLD:${A}`, "1");
    assert.deepEqual(await redeemPromoToWallet("OLD", A), { ok: false, error: "already_used" });
    assert.equal(bal(A), 0);
  });

  test("maxUses: the code runs out after the limit", async () => {
    putPromo("TWO", { maxUses: 2 });
    assert.equal((await redeemPromoToWallet("TWO", A)).ok, true);
    assert.equal((await redeemPromoToWallet("TWO", B)).ok, true);
    assert.deepEqual(await redeemPromoToWallet("TWO", C), { ok: false, error: "used_up" });
    assert.equal(bal(C), 0);
  });

  test("race: two redemptions at once — one wins, the other is told to retry", async () => {
    putPromo("RACE", { maxUses: 1 });
    const [r1, r2] = await Promise.all([redeemPromoToWallet("RACE", A), redeemPromoToWallet("RACE", B)]);
    const oks = [r1, r2].filter((r) => r.ok);
    assert.equal(oks.length, 1);
    assert.deepEqual([r1, r2].find((r) => !r.ok), { ok: false, error: "busy" });
    assert.equal(bal(A) + bal(B), 500);
    // The retry after the lock is free sees the limit.
    const loser = r1.ok ? B : A;
    assert.deepEqual(await redeemPromoToWallet("RACE", loser), { ok: false, error: "used_up" });
  });

  test("the same user racing themselves is credited once", async () => {
    putPromo("SELF");
    const rs = await Promise.all([redeemPromoToWallet("SELF", A), redeemPromoToWallet("SELF", A)]);
    assert.equal(rs.filter((r) => r.ok).length, 1);
    assert.equal(bal(A), 500);
  });

  test("not found, expired, empty and malformed codes", async () => {
    putPromo("GONE", { expiresAt: Date.now() - 1000 });
    assert.deepEqual(await redeemPromoToWallet("NOPE", A), { ok: false, error: "not_found" });
    assert.deepEqual(await redeemPromoToWallet("GONE", A), { ok: false, error: "expired" });
    assert.deepEqual(await redeemPromoToWallet("   ", A), { ok: false, error: "empty" });
    assert.deepEqual(await redeemPromoToWallet(undefined, A), { ok: false, error: "empty" });
    for (const bad of ["AB", "x".repeat(33), "BAD CODE", "A:B:C", "../X"]) {
      assert.deepEqual(await redeemPromoToWallet(bad, A), { ok: false, error: "not_found" }, bad);
    }
    assert.equal(bal(A), 0);
    assert.equal(mem.store.has(`promo_used:GONE:${A}`), false);
  });

  test("the wallet credit fails: the code is released, not burned, and works on retry", async () => {
    putPromo("SAFE");
    mem.failNext("incrby", { key: `balance_usd:${A}` });
    assert.deepEqual(await redeemPromoToWallet("SAFE", A), { ok: false, error: "internal" });
    assert.equal(mem.store.has(`promo_used:SAFE:${A}`), false);
    assert.equal(promo("SAFE").usedCount, 0);
    assert.equal(bal(A), 0);
    const retry = await redeemPromoToWallet("SAFE", A);
    assert.equal(retry.ok, true);
    assert.equal(bal(A), 500);
  });

  test("credit fails AND the release fails: the claim stays (logged for review), no double credit later", async () => {
    putPromo("STUCK");
    mem.failNext("incrby", { key: `balance_usd:${A}` });
    mem.failNext("del", { key: `promo_used:STUCK:${A}` });
    assert.deepEqual(await redeemPromoToWallet("STUCK", A), { ok: false, error: "internal" });
    assert.equal(JSON.parse(mem.store.get(`promo_used:STUCK:${A}`)).state, "crediting");
    assert.deepEqual(await redeemPromoToWallet("STUCK", A), { ok: false, error: "already_used" });
    assert.equal(bal(A), 0);
  });

  test("bookkeeping failing after the credit keeps the credit and the claim", async () => {
    putPromo("BOOK");
    mem.failNext("set", { key: "promo:BOOK" });
    const r = await redeemPromoToWallet("BOOK", A);
    assert.equal(r.ok, true);
    assert.equal(bal(A), 500);
    assert.deepEqual(await redeemPromoToWallet("BOOK", A), { ok: false, error: "already_used" });
  });

  test("a promo with a broken amount credits nothing and burns nothing", async () => {
    putPromo("ZERO", { amount: 0 });
    assert.deepEqual(await redeemPromoToWallet("ZERO", A), { ok: false, error: "internal" });
    assert.equal(mem.store.has(`promo_used:ZERO:${A}`), false);
  });

  test("the lock held elsewhere: busy, nothing written", async () => {
    putPromo("LOCK");
    mem.store.set("lock:promo:LOCK", "tother");
    assert.deepEqual(await redeemPromoToWallet("LOCK", A), { ok: false, error: "busy" });
    assert.equal(mem.store.has(`promo_used:LOCK:${A}`), false);
  });

  test("error texts are the ones the cabinet already understands", () => {
    assert.equal(classifyServerError(PROMO_ERROR_TEXT.empty).key, "err_promo_empty");
    assert.equal(classifyServerError(PROMO_ERROR_TEXT.not_found).key, "err_promo_not_found");
    assert.equal(classifyServerError(PROMO_ERROR_TEXT.expired).key, "err_promo_expired");
    assert.equal(classifyServerError(PROMO_ERROR_TEXT.used_up).key, "err_promo_used_up");
    assert.equal(classifyServerError(PROMO_ERROR_TEXT.already_used).key, "err_promo_already");
  });
});

describe("POST /api/promo/redeem", () => {
  let sid;
  beforeEach(async () => {
    sid = await createSession(A);
  });
  const call = async (body, { bearer = sid, ip = "203.0.113.9" } = {}) => {
    const headers = { "content-type": "application/json", "x-forwarded-for": ip };
    if (bearer) headers.authorization = `Bearer ${bearer}`;
    const res = await redeemPost(
      new NextRequest("https://kovra.test/api/promo/redeem", {
        method: "POST",
        headers,
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );
    return { status: res.status, body: await res.json() };
  };

  test("credits the wallet (it used to burn the code for nothing)", async () => {
    putPromo("WEB10", { amount: 10 });
    const r = await call({ code: "web10" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      success: true,
      amount: 10,
      amountCents: 1000,
      balanceUsdCents: 1000,
      message: "Promo code applied: +$10.00 to your balance",
    });
    assert.equal(bal(A), 1000);
    const again = await call({ code: "WEB10" });
    assert.equal(again.status, 400);
    assert.equal(again.body.error, PROMO_ERROR_TEXT.already_used);
    assert.equal(bal(A), 1000);
  });

  test("no session: 401; empty or junk body: 400 with the cabinet's text", async () => {
    assert.equal((await call({ code: "X" }, { bearer: null })).status, 401);
    for (const body of ["{nope", {}, { code: "" }, { code: 42 }, { code: "x".repeat(40) }]) {
      const r = await call(body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.error, PROMO_ERROR_TEXT.empty);
    }
  });

  test("guessing is rate limited per user", async () => {
    for (let i = 0; i < 10; i++) await call({ code: `GUESS${i}` });
    const r = await call({ code: "GUESS99" });
    assert.equal(r.status, 429);
    assert.equal(classifyServerError(r.body.error).key.startsWith("err_rate"), true);
  });
});
