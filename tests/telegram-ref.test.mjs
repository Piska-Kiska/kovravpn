// tests/telegram-ref.test.mjs — run: npm test
//
// KP-03: a Telegram sign-up from /register?ref=CODE lost the referral. The
// site stored {ref} with the sign-in code (auth:<code>), but when the person
// sent the code to the bot, tryAuth overwrote the record with
// {verified, telegramId} and dropped ref, so /verify created the account
// without a referrer. The whole flow runs here: the site asks for a code,
// the bot confirms it, /verify signs in and records the referral.
//
// Runs against an in-memory Redis with fetch stubbed so nothing reaches
// api.telegram.org. Ids, codes and secrets are made up.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

const SECRET = ["kovra", "ref", "test", "secret"].join("-");
process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
process.env.TELEGRAM_BOT_TOKEN = ["222222222", "KOVRA-ref-test"].join(":");
delete process.env.KOVRA_STATIC_PANELS;
delete process.env.KOVRA_BOT_V2_ALL;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { POST: askCode } = await import("../src/app/api/auth/telegram/route.ts");
const { POST: webhook } = await import("../src/app/api/auth/telegram/webhook/route.ts");
const { GET: verify } = await import("../src/app/api/auth/telegram/verify/route.ts");
const { isReferralCode } = await import("../src/lib/telegram-login.ts");

const REFERRER = "em_referrer@example.test";
const REF = "a1b2c3d4";
const NEWCOMER = 100000077;

const realFetch = globalThis.fetch;
let updateSeq = 5000;

beforeEach(() => {
  mem.reset();
  mem.store.set(`ref_lookup:${REF}`, REFERRER);
  mem.store.set(`ref_code:${REFERRER}`, REF);
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (!u.startsWith("https://api.telegram.org/")) throw new Error(`unexpected fetch in test: ${u}`);
    return Response.json({ ok: true, result: { message_id: 1 } });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

// The route allows 5 codes a minute per address: each call comes from its own.
let visitor = 0;
async function siteAsksForCode(body) {
  visitor += 1;
  const res = await askCode(
    new NextRequest("https://kovra.test/api/auth/telegram", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${visitor % 250}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  assert.equal(res.status, 200);
  return (await res.json()).code;
}

async function botReceives(from, text) {
  const res = await webhook(
    new NextRequest("https://kovra.test/api/auth/telegram/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
      body: JSON.stringify({
        update_id: updateSeq++,
        message: {
          message_id: 7,
          chat: { id: from, type: "private" },
          from: { id: from, first_name: "New", language_code: "en" },
          text,
        },
      }),
    }),
  );
  assert.equal(res.status, 200);
}

async function siteVerifies(code) {
  const res = await verify(
    new NextRequest(`https://kovra.test/api/auth/telegram/verify?code=${code}`, {
      headers: { "x-forwarded-for": "198.51.100.30" },
    }),
  );
  return res.json();
}

const stored = (code) => JSON.parse(mem.store.get(`auth:${code}`));

describe("Telegram sign-up from /register?ref=CODE", () => {
  test("the bot's confirmation keeps the ref, and /verify records the referral", async () => {
    const code = await siteAsksForCode({ ref: REF });
    assert.deepEqual(stored(code), { verified: false, ref: REF });

    await botReceives(NEWCOMER, code);
    assert.deepEqual(stored(code), { ref: REF, verified: true, telegramId: NEWCOMER });

    const out = await siteVerifies(code);
    assert.equal(out.verified, true);
    assert.equal(out.userId, `tg_${NEWCOMER}`);
    assert.equal(mem.store.get(`ref_by:tg_${NEWCOMER}`), REFERRER);
    const list = JSON.parse(mem.store.get(`ref_list:${REFERRER}`));
    assert.deepEqual(list.map((e) => e.userId), [`tg_${NEWCOMER}`]);
  });

  test("without a ref nothing is recorded and the record stays minimal", async () => {
    const code = await siteAsksForCode({});
    await botReceives(NEWCOMER, code);
    assert.deepEqual(stored(code), { verified: true, telegramId: NEWCOMER });
    await siteVerifies(code);
    assert.equal(mem.store.has(`ref_by:tg_${NEWCOMER}`), false);
  });

  test("a ref that is not shaped like a code is never stored", async () => {
    for (const junk of [{ $ne: 1 }, ["a"], "x".repeat(65), "a b", "ref:evil", 12345678]) {
      const code = await siteAsksForCode({ ref: junk });
      assert.deepEqual(stored(code), { verified: false }, JSON.stringify(junk));
    }
    const noBody = await siteAsksForCode(undefined);
    assert.deepEqual(stored(noBody), { verified: false });
  });

  test("a confirmation cannot smuggle other fields through the record", async () => {
    const code = "ABC123";
    mem.store.set(`auth:${code}`, JSON.stringify({ verified: false, ref: REF, telegramId: 1, userId: "em_victim@example.test" }));
    await botReceives(NEWCOMER, code);
    assert.deepEqual(stored(code), { ref: REF, verified: true, telegramId: NEWCOMER });
  });
});

test("isReferralCode", () => {
  assert.equal(isReferralCode(REF), true);
  for (const v of ["", "x".repeat(65), "a b", null, 1, {}]) assert.equal(isReferralCode(v), false, JSON.stringify(v));
});
