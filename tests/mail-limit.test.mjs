// tests/mail-limit.test.mjs — run: npm test
//
// Audit 15.10.2026, item 4: the code letters (sign-up, password reset,
// linking an address) were limited only per sender address, so many
// addresses could mail one victim without end, burning the Resend quota and
// the domain's reputation that sign-up and reset depend on. Now each purpose
// sends at most three letters an hour to one mailbox (lib/ratelimit.ts
// takeMailToRecipient), keyed on the normalized address. Reset counts before
// the account lookup, so the limit does not tell registered addresses apart.
//
// fetch is stubbed and records what would go to Resend. Addresses, ids and
// passwords are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.RESEND_API_KEY = ["re", "test", "key"].join("_");
delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { createSession } = await import("../src/lib/session.ts");
const { POST: sendSignUp } = await import("../src/app/api/auth/email/route.ts");
const { POST: sendReset } = await import("../src/app/api/auth/forgot/route.ts");
const { POST: sendLink } = await import("../src/app/api/auth/link/email/route.ts");
const { classifyServerError } = await import("../src/lib/server-errors.ts");

const VICTIM = "victim@example.test";
const PASSWORD = ["long", "enough", "pw"].join("-");

let mails;
let ipSeq = 0;
const realFetch = globalThis.fetch;

beforeEach(() => {
  mem.reset();
  mails = [];
  ipSeq = 0;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith("https://api.resend.com/")) throw new Error(`unexpected fetch in test: ${u}`);
    mails.push(init.body ? JSON.parse(init.body) : {});
    return Response.json({ id: `mail-${mails.length}` });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Each request from its own address, so the per-address limits stay out of the way. */
function post(handler, path, body, sid) {
  ipSeq += 1;
  const headers = { "content-type": "application/json", "x-forwarded-for": `198.51.100.${ipSeq % 250}` };
  if (sid) headers.authorization = `Bearer ${sid}`;
  return handler(new NextRequest(`https://kovra.test${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
}
const signUpCode = (email, password = PASSWORD) => post(sendSignUp, "/api/auth/email", { email, password });
const resetCode = (email) => post(sendReset, "/api/auth/forgot", { email });

async function expectMailLimited(res) {
  assert.equal(res.status, 429);
  const { error } = await res.json();
  assert.match(error, /^Слишком много писем на этот адрес\. Подождите \d+ мин$/);
  assert.deepEqual(classifyServerError(error, 429).key, "err_mail_limit");
}

describe("sign-up code letters", () => {
  test("three an hour to one mailbox from three addresses, then 429 and no letter", async () => {
    for (let i = 0; i < 3; i += 1) assert.equal((await signUpCode(VICTIM)).status, 200);
    await expectMailLimited(await signUpCode(VICTIM));
    assert.equal(mails.length, 3);
    assert.equal(mem.ttls.get(`rl:mail-to:register:${VICTIM}`)?.ex, 3600);
  });

  test("the written forms of one gmail box share the count", async () => {
    await signUpCode("Some.One@gmail.com");
    await signUpCode("someone+a@gmail.com");
    await signUpCode("s.o.m.e.o.n.e@googlemail.com");
    await expectMailLimited(await signUpCode("someone@gmail.com"));
    assert.equal(mails.length, 3);
  });

  test("another mailbox is not affected", async () => {
    for (let i = 0; i < 3; i += 1) await signUpCode(VICTIM);
    assert.equal((await signUpCode("other@example.test")).status, 200);
  });

  test("bad input is a 400 before any count", async () => {
    for (const body of [{}, { email: 42 }, { email: ["x@y.z"] }, { email: VICTIM, password: 12345678 }, { email: VICTIM, password: "short" }]) {
      assert.equal((await post(sendSignUp, "/api/auth/email", body)).status, 400, JSON.stringify(body));
    }
    assert.equal(mem.store.has(`rl:mail-to:register:${VICTIM}`), false);
    assert.equal(mails.length, 0);
  });
});

describe("password reset letters", () => {
  beforeEach(() => {
    mem.store.set(`user:em_${VICTIM}`, JSON.stringify({ authMethod: "email", createdAt: 1, passwordHash: "h" }));
  });

  test("three an hour to one mailbox, then 429 and no letter", async () => {
    for (let i = 0; i < 3; i += 1) assert.equal((await resetCode(VICTIM)).status, 200);
    await expectMailLimited(await resetCode(VICTIM));
    assert.equal(mails.length, 3);
  });

  test("a missing account is limited the same way, so the answer does not tell them apart", async () => {
    const nobody = "nobody@example.test";
    for (let i = 0; i < 3; i += 1) assert.equal((await resetCode(nobody)).status, 200);
    await expectMailLimited(await resetCode(nobody));
    assert.equal(mails.length, 0);
  });

  test("reset and sign-up letters are counted apart", async () => {
    for (let i = 0; i < 3; i += 1) await signUpCode("fresh@example.test");
    assert.equal((await resetCode(VICTIM)).status, 200);
  });

  test("a body that is not an object is a 400", async () => {
    for (const body of [null, "x", { email: { a: 1 } }]) {
      assert.equal((await post(sendReset, "/api/auth/forgot", body)).status, 400, JSON.stringify(body));
    }
  });
});

describe("linking letters", () => {
  test("many sessions cannot mail one address more than three times an hour", async () => {
    for (let i = 0; i < 4; i += 1) {
      const tg = `tg_10000000${i}`;
      mem.store.set(`user:${tg}`, JSON.stringify({ authMethod: "telegram", telegramId: `10000000${i}`, createdAt: 1 }));
      const res = await post(sendLink, "/api/auth/link/email", { email: VICTIM, password: PASSWORD }, await createSession(tg));
      if (i < 3) assert.equal(res.status, 200);
      else await expectMailLimited(res);
    }
    assert.equal(mails.length, 3);
  });
});
