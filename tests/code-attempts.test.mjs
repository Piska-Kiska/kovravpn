// tests/code-attempts.test.mjs — run: npm test
//
// Audit 15.10.2026, item 1: a one-time e-mail code (reset, sign-up, linking
// an address) takes its try from an atomic counter BEFORE it is compared
// (lib/code-attempts.ts). The routes compared first and counted only wrong
// answers, so requests sent in parallel all read the live code before any of
// them reached the counter, and a right guess in a burst went through.
//
// Driven end to end against an in-memory Redis:
// - a burst of parallel guesses compares at most five, so a right code sent
//   after them is refused and the password stays;
// - a counter already at the limit refuses even the right code;
// - a newly issued code starts its own counter;
// - two right answers racing use the code once (one password change, one
//   account).
//
// Addresses, ids and codes are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { attemptsKeyFor, takeCodeAttempt, MAX_CODE_ATTEMPTS, CODE_TTL_SEC } = await import("../src/lib/code-attempts.ts");
const { POST: reset } = await import("../src/app/api/auth/reset/route.ts");
const { POST: register } = await import("../src/app/api/auth/register/route.ts");

const ADDRESS = "someone@example.test";
const EM = `em_${ADDRESS}`;
const RESET_KEY = `reset:${ADDRESS}`;
const REG_KEY = `email_reg:${ADDRESS}`;
const CODE = "482913";
const WRONG = "111111";
const OLD_HASH = "old-hash";

let ipSeq = 0;
/** Each request from its own address, so the per-IP limits stay out of the way. */
function call(handler, path, body) {
  ipSeq += 1;
  return handler(
    new NextRequest(`https://kovra.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ipSeq % 250}` },
      body: JSON.stringify(body),
    }),
  );
}
const resetWith = (code) => call(reset, "/api/auth/reset", { email: ADDRESS, code, password: ["brand", "new", "pw"].join("-") });
const registerWith = (code) => call(register, "/api/auth/register", { email: ADDRESS, code });
const passwordHash = () => JSON.parse(mem.store.get(`user:${EM}`)).passwordHash;
const issueReset = (code = CODE) => mem.store.set(RESET_KEY, JSON.stringify({ code, userId: EM }));

beforeEach(() => {
  mem.reset();
  ipSeq = 0;
});

describe("takeCodeAttempt", () => {
  test("hands out exactly max tries, the last one marked", async () => {
    const key = attemptsKeyFor(RESET_KEY, CODE);
    const got = [];
    for (let i = 0; i < MAX_CODE_ATTEMPTS + 2; i += 1) got.push(await takeCodeAttempt(key));
    assert.deepEqual(
      got.map((a) => a.allowed),
      [true, true, true, true, true, false, false],
    );
    assert.deepEqual(
      got.map((a) => a.last),
      [false, false, false, false, true, true, true],
    );
  });

  test("the counter expires with the code", async () => {
    const key = attemptsKeyFor(RESET_KEY, CODE);
    await takeCodeAttempt(key);
    assert.equal(mem.ttls.get(key)?.ex, CODE_TTL_SEC);
  });

  test("a counter that lost its expiry gets it back on the next try", async () => {
    const key = attemptsKeyFor(RESET_KEY, CODE);
    mem.store.set(key, "2");
    await takeCodeAttempt(key);
    assert.equal(mem.ttls.get(key)?.ex, CODE_TTL_SEC);
  });

  test("max must be a positive integer", async () => {
    await assert.rejects(takeCodeAttempt("k", 0), /positive integer/);
    await assert.rejects(takeCodeAttempt("k", 1.5), /positive integer/);
  });

  test("each issued code has its own counter", () => {
    assert.notEqual(attemptsKeyFor(RESET_KEY, CODE), attemptsKeyFor(RESET_KEY, "482914"));
    assert.notEqual(attemptsKeyFor(RESET_KEY, CODE), attemptsKeyFor(`reset:other@example.test`, CODE));
    assert.equal(attemptsKeyFor(RESET_KEY, CODE), attemptsKeyFor(RESET_KEY, Number(CODE)));
    assert.match(attemptsKeyFor(RESET_KEY, CODE), /^reset:someone@example\.test:attempts:[0-9a-f]{16}$/);
  });
});

describe("password reset", () => {
  beforeEach(() => {
    mem.store.set(`user:${EM}`, JSON.stringify({ authMethod: "email", createdAt: 1, passwordHash: OLD_HASH }));
  });

  test("a burst of parallel guesses compares five: the right code sent after them is refused", async () => {
    issueReset();
    const burst = [...Array.from({ length: 19 }, () => resetWith(WRONG)), resetWith(CODE)];
    const results = await Promise.all(burst);
    assert.equal(results.at(-1).status, 429);
    assert.equal(results.filter((r) => r.status === 400).length, MAX_CODE_ATTEMPTS - 1);
    assert.equal(passwordHash(), OLD_HASH);
    assert.equal(mem.store.has(RESET_KEY), false, "the code is burned");
  });

  test("a counter already at the limit refuses even the right code", async () => {
    issueReset();
    mem.store.set(attemptsKeyFor(RESET_KEY, CODE), String(MAX_CODE_ATTEMPTS));
    const res = await resetWith(CODE);
    assert.equal(res.status, 429);
    assert.equal(passwordHash(), OLD_HASH);
  });

  test("four wrong, then the right one still works", async () => {
    issueReset();
    for (let i = 0; i < MAX_CODE_ATTEMPTS - 1; i += 1) assert.equal((await resetWith(WRONG)).status, 400);
    assert.equal((await resetWith(CODE)).status, 200);
    assert.notEqual(passwordHash(), OLD_HASH);
  });

  test("a new code starts its own count; the old counter is left to expire", async () => {
    issueReset();
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i += 1) await resetWith(WRONG);
    assert.equal(mem.store.has(RESET_KEY), false);
    issueReset("736104");
    assert.equal((await resetWith("736104")).status, 200);
    assert.equal(mem.store.get(attemptsKeyFor(RESET_KEY, CODE)), String(MAX_CODE_ATTEMPTS));
  });

  test("two right answers racing change the password once", async () => {
    issueReset();
    const statuses = (await Promise.all([resetWith(CODE), resetWith(CODE)])).map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 400]);
  });
});

describe("sign-up", () => {
  const issueReg = () => mem.store.set(REG_KEY, JSON.stringify({ code: CODE, passwordHash: "h" }));

  test("a burst of parallel guesses compares five: the right code sent after them is refused", async () => {
    issueReg();
    const results = await Promise.all([...Array.from({ length: 19 }, () => registerWith(WRONG)), registerWith(CODE)]);
    assert.equal(results.at(-1).status, 429);
    assert.equal(mem.store.has(`user:${EM}`), false);
    assert.equal(mem.store.has(`account:${EM}`), false);
  });

  test("two right answers racing create one account", async () => {
    issueReg();
    const statuses = (await Promise.all([registerWith(CODE), registerWith(CODE)])).map((r) => r.status).sort();
    assert.deepEqual(statuses, [200, 400]);
    assert.equal(mem.store.has(`account:${EM}`), true);
  });
});
