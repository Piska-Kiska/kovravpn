// tests/wallet-routes.test.mjs — run: npm test
//
// The session routes of the unified wallet, called as route handlers against
// an in-memory Redis, authenticated with a Bearer session (as the Mini App
// does) or the cookie (as the site does):
//   POST /api/wallet/purchase — pay from balance;
//   POST /api/account         — returns the balance in cents.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { createSession, COOKIE_NAME } = await import("../src/lib/session.ts");
const { POST: purchasePost } = await import("../src/app/api/wallet/purchase/route.ts");
const { POST: accountPost } = await import("../src/app/api/account/route.ts");

const USER = "tg_100000001";
const BAL = `balance_usd:${USER}`;

function req(path, { body, bearer, cookie } = {}) {
  const headers = { "content-type": "application/json" };
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  if (cookie) headers.cookie = `${COOKIE_NAME}=${cookie}`;
  return new NextRequest(`https://kovra.test${path}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(handler, path, opts) {
  const res = await handler(req(path, opts));
  return { status: res.status, body: await res.json(), headers: res.headers };
}

let sid;
beforeEach(async () => {
  mem.reset();
  sid = await createSession(USER, true);
});

describe("POST /api/wallet/purchase", () => {
  const buy = (body, auth = { bearer: undefined }) => call(purchasePost, "/api/wallet/purchase", { body, ...auth });

  test("no session: 401, nothing charged", async () => {
    mem.store.set(BAL, "5000");
    const r = await buy({ kind: "plan1", term: 1, requestId: "req-nosession" });
    assert.equal(r.status, 401);
    assert.equal(mem.store.get(BAL), "5000");
  });

  test("a junk Bearer never falls back to a valid cookie", async () => {
    mem.store.set(BAL, "5000");
    const res = await purchasePost(
      new NextRequest("https://kovra.test/api/wallet/purchase", {
        method: "POST",
        headers: { authorization: "Bearer junk", cookie: `${COOKIE_NAME}=${sid}` },
        body: JSON.stringify({ kind: "plan1", term: 1, requestId: "req-junkbearer" }),
      }),
    );
    assert.equal(res.status, 401);
    assert.equal(mem.store.get(BAL), "5000");
  });

  test("Bearer session, enough balance: 200 with cents, no-store", async () => {
    mem.store.set(BAL, "1500");
    const r = await buy({ kind: "plan1", term: 1, requestId: "req-bearer-ok", source: "miniapp" }, { bearer: sid });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.deepEqual(r.body, {
      ok: true,
      product: { kind: "plan1", term: 1 },
      priceCents: 500,
      balanceCents: 1000,
      replayed: false,
    });
    assert.equal(mem.store.get(BAL), "1000");
    assert.equal(JSON.parse(mem.store.get(`wallet:req:${USER}:req-bearer-ok`)).source, "miniapp");
  });

  test("cookie session works the same; a repeat is replayed", async () => {
    mem.store.set(BAL, "3000");
    const first = await buy({ kind: "device", term: 6, requestId: "req-cookie-dev6" }, { cookie: sid });
    assert.equal(first.status, 200);
    assert.equal(first.body.priceCents, 3000);
    const again = await buy({ kind: "device", term: 6, requestId: "req-cookie-dev6" }, { cookie: sid });
    assert.equal(again.status, 200);
    assert.equal(again.body.replayed, true);
    assert.equal(mem.store.get(BAL), "0");
  });

  test("insufficient: 402 with the amount needed", async () => {
    mem.store.set(BAL, "100");
    const r = await buy({ kind: "plan3", term: 1, requestId: "req-short-402" }, { bearer: sid });
    assert.equal(r.status, 402);
    assert.deepEqual(r.body, {
      ok: false,
      error: "insufficient_balance",
      priceCents: 1199,
      balanceCents: 100,
      needCents: 1099,
    });
  });

  test("another tier running: 409 other_plan_active with the tier to renew", async () => {
    mem.store.set(BAL, "10000");
    mem.store.set(
      `subs:${USER}`,
      JSON.stringify([{ id: "a", kind: "plan3", slots: 3, createdAt: Date.now(), expiresAt: Date.now() + 86_400_000 }]),
    );
    const r = await buy({ kind: "plan1", term: 1, requestId: "req-other-plan" }, { bearer: sid });
    assert.equal(r.status, 409);
    assert.deepEqual(r.body, { ok: false, error: "other_plan_active", activePlan: "plan3" });
    assert.equal(mem.store.get(BAL), "10000");
  });

  test("busy: 409", async () => {
    mem.store.set(BAL, "10000");
    mem.store.set(`lock:wallet:${USER}`, "tother");
    const r = await buy({ kind: "plan1", term: 1, requestId: "req-busy-409" }, { bearer: sid });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, "busy");
  });

  test("bad bodies: 400, nothing charged", async () => {
    mem.store.set(BAL, "10000");
    for (const body of [
      "{nope",
      { kind: "plan1", term: 1 },
      { kind: "plan1", term: 1, requestId: "x" },
      { kind: "plan2", term: 1, requestId: "req-bad-kind" },
      { kind: "plan1", term: 3, requestId: "req-bad-term" },
      { kind: "plan1", term: 1, requestId: "req bad id" },
      [],
      null,
    ]) {
      const r = await buy(body, { bearer: sid });
      assert.equal(r.status, 400, JSON.stringify(body));
    }
    assert.equal(mem.store.get(BAL), "10000");
  });

  test("the price comes from the server, never from the body", async () => {
    mem.store.set(BAL, "10000");
    const r = await buy({ kind: "plan3", term: 12, requestId: "req-price-body", priceCents: 1, price: 0.01 }, { bearer: sid });
    assert.equal(r.status, 200);
    assert.equal(r.body.priceCents, 7908);
    assert.equal(mem.store.get(BAL), String(10000 - 7908));
  });

  test("rate limit per user", async () => {
    for (let i = 0; i < 20; i++) await buy({ kind: "plan1", term: 1, requestId: `req-rl-${1000 + i}` }, { bearer: sid });
    const r = await buy({ kind: "plan1", term: 1, requestId: "req-rl-last" }, { bearer: sid });
    assert.equal(r.status, 429);
  });
});

describe("POST /api/account: wallet", () => {
  test("returns the balance in integer cents, with or without an account", async () => {
    mem.store.set(BAL, "1234");
    const noAccount = await call(accountPost, "/api/account", { body: {}, bearer: sid });
    assert.equal(noAccount.status, 200);
    assert.equal(noAccount.body.account, null);
    assert.equal(noAccount.body.wallet.balanceUsdCents, 1234);

    mem.store.set(`account:${USER}`, JSON.stringify({ plan: "active", paidUntil: 0, createdAt: 1 }));
    const withAccount = await call(accountPost, "/api/account", { body: {}, bearer: sid });
    assert.equal(withAccount.status, 200);
    assert.equal(withAccount.body.wallet.balanceUsdCents, 1234);
    assert.equal(withAccount.body.account.plan, "active");
  });

  test("an empty wallet is 0; no session is 401", async () => {
    const r = await call(accountPost, "/api/account", { body: {}, cookie: sid });
    assert.equal(r.body.wallet.balanceUsdCents, 0);
    assert.equal((await call(accountPost, "/api/account", { body: {} })).status, 401);
  });
});
