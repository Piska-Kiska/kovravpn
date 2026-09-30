// tests/link-email.test.mjs — run: npm test
//
// KS-6: attaching an e-mail to an account had no rate limit and no attempt
// counter. Any session (a free Telegram login is enough) could send unlimited
// mail from our domain to any address, and brute-force the six-digit code
// within its ten minutes. The "already used" check ignored the normalized
// form under which registration keys accounts.
//
// The routes run against an in-memory Redis with a session sent as Bearer;
// fetch is stubbed and records what would go to Resend. Addresses, ids and
// keys are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.RESEND_API_KEY = ["re", "test", "key"].join("_");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { createSession } = await import("../src/lib/session.ts");
const { POST: sendCode } = await import("../src/app/api/auth/link/email/route.ts");
const { POST: verifyCode } = await import("../src/app/api/auth/link/email/verify/route.ts");

const TG = "tg_100000001";
const ADDRESS = "someone@example.test";
const PASSWORD = ["long", "enough", "pw"].join("-");

let mails;
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  mails = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith("https://api.resend.com/")) throw new Error(`unexpected fetch in test: ${u}`);
    mails.push(init.body ? JSON.parse(init.body) : {});
    return Response.json({ id: `mail-${mails.length}` });
  };
  mem.store.set(`user:${TG}`, JSON.stringify({ authMethod: "telegram", telegramId: "100000001", createdAt: 1 }));
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function post(handler, path, sid, body, ip = "198.51.100.7") {
  return handler(
    new NextRequest(`https://kovra.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${sid}`, "x-forwarded-for": ip },
      body: JSON.stringify(body),
    }),
  );
}
const send = (sid, email = ADDRESS, ip) => post(sendCode, "/api/auth/link/email", sid, { email, password: PASSWORD }, ip);
const verify = (sid, code, email = ADDRESS, ip) => post(verifyCode, "/api/auth/link/email/verify", sid, { email, code }, ip);
const storedCode = (email = ADDRESS) => JSON.parse(mem.store.get(`link_em:${email}`)).code;
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

describe("sending the code", () => {
  test("three codes per account in ten minutes, then 429 and no mail", async () => {
    const sid = await createSession(TG);
    for (let i = 0; i < 3; i += 1) assert.equal((await send(sid)).status, 200);
    const fourth = await send(sid);
    assert.equal(fourth.status, 429);
    assert.match((await fourth.json()).error, /Подождите \d+ сек/);
    assert.equal(mails.length, 3);
  });

  test("ten codes per IP in ten minutes, across accounts", async () => {
    for (let i = 0; i < 10; i += 1) {
      const user = `tg_20000000${i}`;
      mem.store.set(`user:${user}`, JSON.stringify({ authMethod: "telegram", createdAt: 1 }));
      assert.equal((await send(await createSession(user), `person${i}@example.test`)).status, 200);
    }
    const eleventh = await send(await createSession(TG), "another@example.test");
    assert.equal(eleventh.status, 429);
    assert.equal(mails.length, 10);
  });

  test("an address registered in its normalized form is refused, without mail", async () => {
    // normalizeEmail drops a +tag (and, for Gmail, dots); a reserved domain stands in.
    mem.store.set("user:em_holder@example.test", JSON.stringify({ authMethod: "email", createdAt: 1 }));
    const res = await send(await createSession(TG), "Holder+VPN@example.test");
    assert.equal(res.status, 409);
    assert.equal(mails.length, 0);
  });

  test("bad input is refused before any mail", async () => {
    const sid = await createSession(TG);
    for (const body of [{}, { email: ADDRESS }, { email: "not-an-address", password: PASSWORD }, { email: ADDRESS, password: "short" }, { email: ["x"], password: PASSWORD }]) {
      assert.equal((await post(sendCode, "/api/auth/link/email", sid, body)).status, 400, JSON.stringify(body));
    }
    assert.equal(mails.length, 0);
  });

  test("no session: 401", async () => {
    const res = await sendCode(
      new NextRequest("https://kovra.test/api/auth/link/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: ADDRESS, password: PASSWORD }),
      }),
    );
    assert.equal(res.status, 401);
  });
});

describe("checking the code", () => {
  test("the right code links the address", async () => {
    const sid = await createSession(TG);
    await send(sid);
    const res = await verify(sid, storedCode());
    assert.equal(res.status, 200);
    assert.equal((await res.json()).linked, true);
    assert.equal(mem.store.get(`alias:em_${ADDRESS}`), TG);
    assert.equal(mem.store.has(`link_em:${ADDRESS}`), false);
    assert.equal(mem.store.has(`link_em:${ADDRESS}:attempts`), false);
  });

  test("the fifth wrong code burns it: the right one no longer works", async () => {
    const sid = await createSession(TG);
    await send(sid);
    const code = storedCode();
    for (let i = 0; i < 4; i += 1) assert.equal((await verify(sid, wrong(code))).status, 400);
    const fifth = await verify(sid, wrong(code));
    assert.equal(fifth.status, 429);
    assert.match((await fifth.json()).error, /Слишком много неверных попыток/);
    const late = await verify(sid, code);
    assert.equal(late.status, 400);
    assert.equal(mem.store.get(`alias:em_${ADDRESS}`), undefined);
  });

  test("the attempt count does not depend on the IP the guesses come from", async () => {
    const sid = await createSession(TG);
    await send(sid);
    const code = storedCode();
    for (let i = 0; i < 4; i += 1) await verify(sid, wrong(code), ADDRESS, `203.0.113.${i + 1}`);
    assert.equal((await verify(sid, wrong(code), ADDRESS, "203.0.113.99")).status, 429);
  });

  test("a new code starts with a clean count", async () => {
    const sid = await createSession(TG);
    await send(sid);
    for (let i = 0; i < 4; i += 1) await verify(sid, wrong(storedCode()));
    await send(sid);
    const res = await verify(sid, storedCode());
    assert.equal(res.status, 200);
  });

  test("ten checks a minute per IP, then 429", async () => {
    const sid = await createSession(TG);
    for (let i = 0; i < 10; i += 1) await verify(sid, "000000");
    assert.equal((await verify(sid, "000000")).status, 429);
  });

  test("another session cannot use the code", async () => {
    const sid = await createSession(TG);
    await send(sid);
    const other = "tg_100000009";
    mem.store.set(`user:${other}`, JSON.stringify({ authMethod: "telegram", createdAt: 1 }));
    const res = await verify(await createSession(other), storedCode());
    assert.equal(res.status, 403);
    assert.equal(mem.store.get(`alias:em_${ADDRESS}`), undefined);
  });
});
