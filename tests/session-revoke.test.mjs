// tests/session-revoke.test.mjs — run: npm test
//
// KS-10: sessions were stored only as session:<sid>, with no per-user index,
// so a password reset left every existing session alive, and a stolen
// "remember" session outlived the new password by up to 7 days of sliding.
// Now createSession lists the sid in user_sessions:<userId>, and a reset ends
// every session of the account, including those of its linked Telegram id.
//
// The routes run against an in-memory Redis. Addresses, ids and codes are
// made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { createSession, getSession, revokeUserSessions, userSessionsKey, USER_SESSIONS_TTL_SEC } = await import(
  "../src/lib/session.ts"
);
const { POST: reset } = await import("../src/app/api/auth/reset/route.ts");

const ADDRESS = "someone@example.test";
const EM = `em_${ADDRESS}`;
const TG = "tg_100000001";
const OTHER = "em_other@example.test";
const CODE = "482913";

beforeEach(() => {
  mem.reset();
  mem.store.set(`user:${EM}`, JSON.stringify({ authMethod: "linked", email: ADDRESS, telegramId: "100000001", createdAt: 1, passwordHash: "old" }));
  mem.store.set(`alias:${TG}`, EM);
});

function resetWith(code, password = ["brand", "new", "password"].join("-")) {
  return reset(
    new NextRequest("https://kovra.test/api/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.20" },
      body: JSON.stringify({ email: ADDRESS, code, password }),
    }),
  );
}
const seedResetCode = () => mem.store.set(`reset:${ADDRESS}`, JSON.stringify({ code: CODE, userId: EM }));

describe("the per-user session index", () => {
  test("createSession lists the sid under the user, with a TTL longer than any session", async () => {
    const a = await createSession(EM, true);
    const b = await createSession(EM);
    assert.deepEqual(new Set(mem.sets.get(userSessionsKey(EM))), new Set([a, b]));
    assert.deepEqual(mem.ttls.get(userSessionsKey(EM)), { ex: USER_SESSIONS_TTL_SEC, px: undefined });
    assert.ok(USER_SESSIONS_TTL_SEC > 7 * 24 * 60 * 60);
  });

  test("revokeUserSessions ends that user's sessions and no one else's", async () => {
    const mine = [await createSession(EM, true), await createSession(EM)];
    const theirs = await createSession(OTHER, true);
    assert.equal(await revokeUserSessions(EM), 2);
    for (const sid of mine) assert.equal(await getSession(sid), null);
    assert.equal((await getSession(theirs)).userId, OTHER);
    assert.equal(mem.sets.has(userSessionsKey(EM)), false);
    assert.equal(await revokeUserSessions(EM), 0, "nothing left, nothing to do");
  });
});

describe("password reset ends the other sessions", () => {
  test("every session of the account and of its linked Telegram id ends", async () => {
    const web = await createSession(EM, true);
    const miniApp = await createSession(TG, true);
    const other = await createSession(OTHER, true);
    assert.equal((await getSession(miniApp)).userId, EM, "the Telegram session acts for the account");
    seedResetCode();
    const res = await resetWith(CODE);
    assert.equal(res.status, 200);
    assert.equal(await getSession(web), null);
    assert.equal(await getSession(miniApp), null);
    assert.equal((await getSession(other)).userId, OTHER);
    assert.notEqual(JSON.parse(mem.store.get(`user:${EM}`)).passwordHash, "old");
  });

  test("a Telegram id that is not linked to this account keeps its sessions", async () => {
    mem.store.set(`alias:${TG}`, OTHER);
    const tgSession = await createSession(TG, true);
    seedResetCode();
    assert.equal((await resetWith(CODE)).status, 200);
    assert.notEqual(await getSession(tgSession), null);
  });

  test("a wrong code changes nothing and ends nothing", async () => {
    const web = await createSession(EM, true);
    seedResetCode();
    const res = await resetWith("000000");
    assert.equal(res.status, 400);
    assert.equal((await getSession(web)).userId, EM);
    assert.equal(JSON.parse(mem.store.get(`user:${EM}`)).passwordHash, "old");
  });

  test("the index cannot be read: the new password still holds, the reset answers 200", async () => {
    await createSession(EM, true);
    seedResetCode();
    mem.failNext("smembers", { key: userSessionsKey(EM) });
    const res = await resetWith(CODE);
    assert.equal(res.status, 200);
    assert.notEqual(JSON.parse(mem.store.get(`user:${EM}`)).passwordHash, "old");
  });
});
