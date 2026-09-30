// tests/auth-request.test.mjs — run: npm test
//
// authenticateRequest (src/lib/auth.ts) after the Bearer and constant-time
// changes: a session (Bearer or cookie) wins; the bot's X-Internal-Key still
// works, compared in constant time; a wrong key or a junk Bearer gets nothing.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

const KEY = ["internal", "test", "key", "0001"].join("-");
process.env.INTERNAL_API_KEY = KEY;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { authenticateRequest } = await import("../src/lib/auth.ts");
const { createSession, COOKIE_NAME } = await import("../src/lib/session.ts");

function req({ bearer, cookie, internalKey, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (bearer !== undefined) headers.authorization = `Bearer ${bearer}`;
  if (cookie !== undefined) headers.cookie = `${COOKIE_NAME}=${cookie}`;
  if (internalKey !== undefined) headers["x-internal-key"] = internalKey;
  return new NextRequest("https://kovra.test/api/vpn/create", {
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(() => mem.reset());

describe("authenticateRequest", () => {
  test("Bearer session and cookie session", async () => {
    const b = await createSession("tg_bearer", true);
    const c = await createSession("tg_cookie");
    assert.equal((await authenticateRequest(req({ bearer: b }))).userId, "tg_bearer");
    assert.equal((await authenticateRequest(req({ cookie: c }))).userId, "tg_cookie");
    assert.equal((await authenticateRequest(req({ bearer: b, cookie: c }))).userId, "tg_bearer");
  });

  test("the bot's internal key with a userId in the body", async () => {
    const r = await authenticateRequest(req({ internalKey: KEY }), { userId: "tg_bot_user" });
    assert.equal(r.userId, "tg_bot_user");
    const fromBody = await authenticateRequest(req({ internalKey: KEY, body: { userId: "tg_body_user" } }));
    assert.equal(fromBody.userId, "tg_body_user");
  });

  test("a wrong, prefix or longer key gets nothing", async () => {
    for (const k of ["", "wrong", KEY.slice(0, -1), `${KEY}0`, KEY.toUpperCase()]) {
      const r = await authenticateRequest(req({ internalKey: k }), { userId: "tg_x" });
      assert.equal(r.userId, null, k);
    }
  });

  test("a junk Bearer does not fall back to the cookie", async () => {
    const c = await createSession("tg_cookie");
    assert.equal((await authenticateRequest(req({ bearer: "junk", cookie: c }))).userId, null);
  });
});
