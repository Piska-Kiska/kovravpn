// tests/login-limit.test.mjs — run: npm test
//
// Audit 15.10.2026, item 2: sign-in had only a per-address limit (10 a
// minute), so guesses at one account from many addresses never stopped. And
// a missing account was compared against a fixed decoy hash of cost 10 while
// real hashes are cost 12, so it answered four times faster and told
// registered addresses apart.
//
// Now: twenty tries per e-mail per hour from all addresses together, counted
// before the lookup (a missing account is limited the same way); a success
// and a password reset clear the count; the decoy is cost 12.
//
// Addresses, ids and passwords are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";

delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { POST: login } = await import("../src/app/api/auth/login/route.ts");
const { POST: reset } = await import("../src/app/api/auth/reset/route.ts");
const { loginAccountLimitKey } = await import("../src/lib/ratelimit.ts");

const ADDRESS = "some.one+tag@gmail.com";
const CANON = "someone@gmail.com";
const EM = `em_${CANON}`;
const PASSWORD = ["right", "horse", "battery"].join("-");
const WRONG = ["wrong", "guess", "here"].join("-");
const LIMIT_KEY = `rl:${loginAccountLimitKey(CANON)}`;

// Cost 4 keeps the test fast; the decoy's cost is checked separately.
const HASH = await bcrypt.hash(PASSWORD, 4);

let ipSeq = 0;
/** Each request from its own address, so the per-address limit stays out of the way. */
function signIn(email, password) {
  ipSeq += 1;
  return login(
    new NextRequest("https://kovra.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ipSeq % 250}` },
      body: JSON.stringify({ email, password }),
    }),
  );
}

beforeEach(() => {
  mem.reset();
  ipSeq = 0;
  mem.store.set(`user:${EM}`, JSON.stringify({ authMethod: "email", createdAt: 1, passwordHash: HASH }));
  mem.store.set(`account:${EM}`, JSON.stringify({ plan: "active", balance: 0, createdAt: 1 }));
  mem.store.set(`alias:em_some.one+tag@gmail.com`, EM);
});

describe("per-account sign-in limit", () => {
  test("twenty wrong tries from twenty addresses, then 429 even with the right password", async () => {
    for (let i = 0; i < 20; i += 1) assert.equal((await signIn(ADDRESS, WRONG)).status, 401);
    const res = await signIn(ADDRESS, PASSWORD);
    assert.equal(res.status, 429);
    assert.match((await res.json()).error, /Подождите \d+ мин или восстановите пароль/);
  });

  test("written forms of one gmail address share the limit", async () => {
    for (let i = 0; i < 10; i += 1) await signIn("Some.One@gmail.com", WRONG);
    for (let i = 0; i < 10; i += 1) await signIn("someone+x@googlemail.com", WRONG);
    assert.equal((await signIn(ADDRESS, PASSWORD)).status, 429);
  });

  test("a missing account is limited the same way", async () => {
    for (let i = 0; i < 20; i += 1) assert.equal((await signIn("nobody@example.test", WRONG)).status, 401);
    assert.equal((await signIn("nobody@example.test", WRONG)).status, 429);
  });

  test("the window is an hour", async () => {
    await signIn(ADDRESS, WRONG);
    assert.equal(mem.ttls.get(LIMIT_KEY)?.ex, 3600);
  });

  test("a success clears the count", async () => {
    for (let i = 0; i < 19; i += 1) await signIn(ADDRESS, WRONG);
    assert.equal((await signIn(ADDRESS, PASSWORD)).status, 200);
    assert.equal(mem.store.has(LIMIT_KEY), false);
  });

  test("a password reset clears the count", async () => {
    for (let i = 0; i < 20; i += 1) await signIn(ADDRESS, WRONG);
    mem.store.set(`reset:${ADDRESS}`, JSON.stringify({ code: "482913", userId: EM }));
    const res = await reset(
      new NextRequest("https://kovra.test/api/auth/reset", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5" },
        body: JSON.stringify({ email: ADDRESS, code: "482913", password: PASSWORD }),
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(mem.store.has(LIMIT_KEY), false);
    assert.equal((await signIn(ADDRESS, PASSWORD)).status, 200);
  });

  test("an account without a password gets the same 401", async () => {
    mem.store.set(`user:${EM}`, JSON.stringify({ authMethod: "telegram", createdAt: 1 }));
    const res = await signIn(ADDRESS, WRONG);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error, "Неверный email или пароль");
  });
});

describe("decoy hash", () => {
  test("is made at cost 12, like real hashes; the old fixed cost-10 hash is gone", () => {
    const src = readFileSync(new URL("../src/app/api/auth/login/route.ts", import.meta.url), "utf8");
    assert.match(src, /DECOY_HASH: Promise<string> = bcrypt\.hash\(randomBytes\(18\)\.toString\("base64"\), 12\)/);
    assert.doesNotMatch(src, /\$2[aby]\$10\$/);
  });
});
