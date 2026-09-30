// tests/promo-cap.test.mjs — run: npm test
//
// Promo amounts are US dollars with a cap (lib/promo.ts PROMO_MAX_USD), when
// a code is created (admin bot, POST /api/promo/create) and when it is
// redeemed: a code created as "500 ₽" can never hand out $500.
//
// Ids, codes and tokens are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.TELEGRAM_BOT_TOKEN = ["333333333", "KOVRA-money-test"].join(":");
process.env.ADMIN_API_KEY = ["kovra", "admin", "test", "key"].join("-");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { createPromo, redeemPromoToWallet, PROMO_MAX_USD, isValidPromoAmount } = await import("../src/lib/promo.ts");
const { POST: promoCreatePost } = await import("../src/app/api/promo/create/route.ts");

const TG = "tg_100000001";
const cents = (uid) => Number(mem.store.get(`balance_usd:${uid}`) ?? 0);

beforeEach(() => mem.reset());

describe("promo amounts are dollars, capped", () => {
  test("isValidPromoAmount", () => {
    for (const ok of [0.01, 5, 12.5, PROMO_MAX_USD]) assert.equal(isValidPromoAmount(ok), true, String(ok));
    for (const bad of [0, -1, PROMO_MAX_USD + 0.01, 500, 10000, 1.234, NaN, "5", null]) {
      assert.equal(isValidPromoAmount(bad), false, String(bad));
    }
  });

  test("createPromo refuses an amount above the cap (a code meant as roubles)", async () => {
    await assert.rejects(createPromo({ code: "WELCOME500", amount: 500, createdBy: "admin" }));
    await assert.rejects(createPromo({ code: "bad code!", amount: 5, createdBy: "admin" }));
    assert.equal(mem.store.get("promo:WELCOME500"), undefined);
    const p = await createPromo({ code: "WELCOME5", amount: 5, createdBy: "admin" });
    assert.equal(p.amount, 5);
  });

  test("a stored code above the cap is refused at redemption and not burned", async () => {
    mem.store.set(
      "promo:OLD500",
      JSON.stringify({ code: "OLD500", type: "balance", amount: 500, maxUses: 0, usedCount: 0, expiresAt: 0, createdAt: 1, createdBy: "admin", description: "" }),
    );
    const r = await redeemPromoToWallet("old500", TG);
    assert.deepEqual(r, { ok: false, error: "not_found" });
    assert.equal(cents(TG), 0);
    assert.equal(mem.store.get(`promo_used:OLD500:${TG}`), undefined);
  });

  // The admin key replaced the bot token here (KM-14): see admin-key.test.mjs.
  test("POST /api/promo/create: constant-time admin key, dollars, cap", async () => {
    const call = async (body, key = process.env.ADMIN_API_KEY) => {
      const headers = { "content-type": "application/json" };
      if (key !== null) headers["x-admin-key"] = key;
      const res = await promoCreatePost(
        new NextRequest("https://kovra.test/api/promo/create", { method: "POST", headers, body: JSON.stringify(body) }),
      );
      return { status: res.status, body: await res.json() };
    };
    assert.equal((await call({ amount: 5 }, "wrong")).status, 403);
    assert.equal((await call({ amount: 5 }, null)).status, 403);
    assert.equal((await call({ amount: 5 }, process.env.TELEGRAM_BOT_TOKEN)).status, 403, "the bot token is no key");
    const tooMuch = await call({ code: "RUB500", amount: 500 });
    assert.equal(tooMuch.status, 400);
    assert.match(tooMuch.body.error, /\$/);
    assert.equal((await call({ code: "NEG", amount: -1 })).status, 400);
    assert.equal((await call({ code: "FRAC", amount: 5, maxUses: 1.5 })).status, 400);
    const ok = await call({ code: "GIFT10", amount: 10, maxUses: 3 });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.promo.amount, 10);
    assert.equal(ok.body.promo.maxUses, 3);
  });
});
