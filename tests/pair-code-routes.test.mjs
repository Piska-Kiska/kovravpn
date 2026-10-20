// tests/pair-code-routes.test.mjs
//
// "Code for the app" end to end on the site (contract pair-code v1.1): the
// issue path for one device (src/lib/pair-code-server.ts), the cabinet's
// POST /api/vpn/pair-code and the app's public POST /api/pair/code, through
// the real route handlers against the in-memory Redis of
// tests/support/memory-redis.mjs, the redeem script run by its model
// (tests/support/pair-code-redeem-model.mjs). Ported from the ProxysVPN
// site's tests; nothing leaves the process.
//
// Pinned here:
//   * issue: 401 without a session; 404 for a device that is not the
//     account's; the stored link is the device's own plain feed on
//     kovravpn.com, derived on the server (a link in the body is ignored);
//     20 an hour, then 429 with Retry-After;
//   * redeem: 200 once with the link, then 404; wrong and expired are the same
//     404; malformed and broken bodies are 400 bad_code; two parallel
//     redeems give one 200; 10 a minute and 60 a day per address, 429 with
//     Retry-After; Redis down is 503 (the code untouched when the redeem
//     script never ran); CORS, never cached;
//   * v1.1: a 200 lost on the way is given again to a retry with the same
//     requestId for 300 s, without extending them; another requestId, none,
//     a malformed one and a replay after 300 s are the same 404 as a code
//     that never existed; only the id's SHA-256 is stored;
//   * what a web page can make a browser send is 415 or 403, uncounted and
//     unlogged;
//   * nothing either route logs carries the code, the link, the token, the
//     device uuid, the client address, a request id or its hash.
//
// Every user id, uuid, token and address below is synthetic.
//
// Run: npm test

import { test, describe, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { setRedisModule } from "./support/load-ts.mjs";

setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));

// Read at import time by lib/auth.ts. A short dummy on purpose.
process.env.INTERNAL_API_KEY = "dummy";

const mem = await import("./support/memory-redis.mjs");
const { NextRequest } = await import("next/server");
const redeemRoute = await import("../src/app/api/pair/code/route.ts");
const issueRoute = await import("../src/app/api/vpn/pair-code/route.ts");
const { issuePairCodeForDevice } = await import("../src/lib/pair-code-server.ts");
const { formatPairCode, normalisePairCode, PAIR_CODE_REDEEM_SCRIPT } = await import("../src/lib/pair-code.ts");
const { runPairCodeRedeem } = await import("./support/pair-code-redeem-model.mjs");

/** The redeem script as the in-memory Redis runs it: its model, over the raw store, TTL recorded. */
function registerRedeemScript() {
  mem.registerScript(PAIR_CODE_REDEEM_SCRIPT, (api, keys, args) =>
    runPairCodeRedeem(
      {
        getdel: (key) => {
          const value = api.get(key);
          if (value !== null) api.del(key);
          return value;
        },
        get: (key) => api.get(key),
        set: (key, value, exSec) => {
          api.set(key, value);
          mem.ttls.set(key, { ex: exSec, px: undefined });
        },
      },
      keys,
      args,
    ),
  );
}

const DAY = 86_400_000;
const USER = "tg_100";
const OTHER = "tg_200";
const SID = "0f0e0d0c-0b0a-4908-8706-050403020101";
const SID_OTHER = "0f0e0d0c-0b0a-4908-8706-050403020102";
const MINE = "22222222-0000-4000-8000-000000000001";
const THEIRS = "22222222-0000-4000-8000-000000000009";
const TOKEN = "aaaabbbbccccdddd0000111122223333";
const TOKEN_THEIRS = "ffffeeeeddddcccc9999888877776666";
// Request ids as the app makes them: 32 bytes, base64url, no padding (43 characters).
const RID_A = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWY"; // gitleaks:allow — synthetic test value
const RID_B = "c3ludGhldGljLXJlcXVlc3QtaWQtbnVtYmVyLXR3by0"; // gitleaks:allow — synthetic test value
const RID_C = "dGhpcmQtc3ludGhldGljLXJlcXVlc3QtaWQtX2FiY2Q"; // gitleaks:allow — synthetic test value
const sha256 = (v) => createHash("sha256").update(v, "utf8").digest("hex");

function seedUser(userId, sid, uuid, token) {
  const now = Date.now();
  mem.store.set(`session:${sid}`, JSON.stringify({ userId, createdAt: now, lastActivity: now, remember: true }));
  mem.store.set(
    `account:${userId}`,
    JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: now - 90 * DAY, balance: 400, balanceUpdatedAt: now }),
  );
  mem.store.set(`profiles:${userId}`, JSON.stringify([{ uuid, clientEmail: "vpn_1", vlessUrl: "", createdAt: now - 60 * DAY, deviceType: "iphone", subToken: token }]));
}

function seed() {
  seedUser(USER, SID, MINE, TOKEN);
  seedUser(OTHER, SID_OTHER, THEIRS, TOKEN_THEIRS);
}

function issueReq(body, sid = SID) {
  return new NextRequest("https://kovravpn.com/api/vpn/pair-code", {
    method: "POST",
    headers: { "content-type": "application/json", ...(sid ? { cookie: `sid=${sid}` } : {}) },
    body: JSON.stringify(body),
  });
}

async function issue(body, sid) {
  const res = await issueRoute.POST(issueReq(body, sid));
  return { res, body: await res.json() };
}

function redeemReq(body, ip = "client-a", host = "kovravpn.com") {
  return new Request(`https://${host}/api/pair/code`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function redeem(body, ip, host) {
  const res = await redeemRoute.POST(redeemReq(body, ip, host));
  return { res, body: await res.json() };
}

/** Every header of an answer, sorted: two answers that differ in none are told apart by nothing. */
const headersOf = (res) => [...res.headers.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

const pairKeys = () => [...mem.store.keys()].filter((k) => k.startsWith("paircode:"));

// Every console line of the run, to prove nothing secret is logged.
const logged = [];
const saved = { log: console.log, info: console.info, warn: console.warn, error: console.error };
before(() => {
  for (const level of ["log", "info", "warn", "error"]) {
    console[level] = (...args) => logged.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  }
});
after(() => {
  Object.assign(console, saved);
});

beforeEach(() => {
  mem.reset();
  registerRedeemScript();
});

describe("issuePairCodeForDevice (injected dependencies)", () => {
  function fakeDeps({ devices = [{ uuid: MINE, subToken: TOKEN }] } = {}) {
    const calls = { devices: 0, ensure: [], put: 0, limit: 0 };
    const stored = new Map();
    return {
      calls,
      stored,
      deps: {
        devices: async () => {
          calls.devices += 1;
          return devices;
        },
        ensureToken: async (userId, uuid) => {
          calls.ensure.push([userId, uuid]);
          return "eeee0000eeee0000eeee0000eeee0000";
        },
        core: {
          store: {
            async putNew(key, value) {
              calls.put += 1;
              stored.set(key, value);
              return true;
            },
            async redeem() {
              return { kind: "none" };
            },
          },
          limit: async () => {
            calls.limit += 1;
            return { ok: true, retryAfter: 0 };
          },
          log: () => {},
        },
      },
    };
  }

  test("an account issues for its own device", async () => {
    const f = fakeDeps();
    const r = await issuePairCodeForDevice({ userId: USER, deviceId: MINE }, f.deps);
    assert.equal(r.ok, true);
    assert.equal(f.calls.devices, 1);
    assert.equal(f.calls.put, 1);
    assert.equal(JSON.parse(f.stored.get(`paircode:${r.code}`)).userId, USER);
  });

  test("a device that is not the account's is refused", async () => {
    const f = fakeDeps();
    assert.deepEqual(await issuePairCodeForDevice({ userId: USER, deviceId: THEIRS }, f.deps), { ok: false, reason: "not_found" });
    assert.equal(f.calls.put, 0);
    assert.equal(f.calls.limit, 0, "a refusal costs no budget");
  });

  test("the device's own token makes the link: the plain feed on kovravpn.com", async () => {
    const f = fakeDeps();
    const r = await issuePairCodeForDevice({ userId: USER, deviceId: MINE }, f.deps);
    assert.equal(r.ok, true);
    const [[key, value]] = [...f.stored];
    assert.equal(key, `paircode:${r.code}`);
    assert.equal(JSON.parse(value).subUrl, `https://kovravpn.com/api/sub/${TOKEN}`);
    assert.deepEqual(f.calls.ensure, [], "a device with a token is not given another");
  });

  test("a legacy device without a token gets one first", async () => {
    const f = fakeDeps({ devices: [{ uuid: MINE }] });
    const r = await issuePairCodeForDevice({ userId: USER, deviceId: MINE }, f.deps);
    assert.equal(r.ok, true);
    assert.deepEqual(f.calls.ensure, [[USER, MINE]]);
    assert.equal(JSON.parse([...f.stored.values()][0]).subUrl, "https://kovravpn.com/api/sub/eeee0000eeee0000eeee0000eeee0000");
  });

  test("a malformed user id: bad_input before any read", async () => {
    const f = fakeDeps();
    f.deps.devices = async () => {
      throw new Error("the devices must not be read");
    };
    for (const input of [{ userId: "", deviceId: MINE }, { userId: 5, deviceId: MINE }, null]) {
      assert.deepEqual(await issuePairCodeForDevice(input, f.deps), { ok: false, reason: "bad_input" }, JSON.stringify(input));
    }
  });

  test("a malformed device id: bad_input, the devices never read", async () => {
    for (const deviceId of ["", "../x", 5, "a".repeat(65)]) {
      const f = fakeDeps();
      assert.deepEqual(await issuePairCodeForDevice({ userId: USER, deviceId }, f.deps), { ok: false, reason: "bad_input" }, JSON.stringify(deviceId));
      assert.equal(f.calls.devices, 0);
      assert.equal(f.calls.put, 0);
    }
  });
});

describe("POST /api/vpn/pair-code (the cabinet)", () => {
  test("no session: 401", async () => {
    seed();
    const { res } = await issue({ uuid: MINE }, null);
    assert.equal(res.status, 401);
    assert.deepEqual(pairKeys(), []);
  });

  test("200 with a code that the app redeems; every account for its own devices", async () => {
    seed();
    const { res, body } = await issue({ uuid: MINE });
    assert.equal(res.status, 200);
    assert.equal(body.expiresIn, 600);
    const { res: got, body: link } = await redeem({ code: body.display });
    assert.equal(got.status, 200);
    assert.deepEqual(link, { status: "ready", subUrl: `https://kovravpn.com/api/sub/${TOKEN}` });
    assert.equal((await issue({ uuid: THEIRS }, SID_OTHER)).res.status, 200, "and so does every other account");
  });

  test("the device's own link stored for 600 s, never the body's", async () => {
    seed();
    const { res, body } = await issue({ uuid: MINE, subUrl: "https://attacker.example/x" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("access-control-allow-origin"), null, "same-origin only");
    assert.deepEqual(Object.keys(body).sort(), ["code", "display", "expiresIn"]);
    assert.equal(normalisePairCode(body.code), body.code);
    assert.equal(body.display, formatPairCode(body.code));
    assert.equal(body.expiresIn, 600);
    const key = `paircode:${body.code}`;
    assert.deepEqual(pairKeys(), [key]);
    assert.deepEqual(mem.ttls.get(key), { ex: 600, px: undefined });
    const record = JSON.parse(mem.store.get(key));
    assert.equal(record.subUrl, `https://kovravpn.com/api/sub/${TOKEN}`);
    assert.equal(record.userId, USER);
    assert.equal(record.deviceId, MINE);
  });

  test("another account's device: 404, nothing stored", async () => {
    seed();
    const { res, body } = await issue({ uuid: THEIRS });
    assert.equal(res.status, 404);
    assert.equal(body.error, "Profile not found", "the string the cabinet maps to its own words");
    assert.deepEqual(pairKeys(), []);
  });

  test("no uuid, or a broken body: 400", async () => {
    seed();
    assert.equal((await issue({})).res.status, 400);
    const res = await issueRoute.POST(
      new NextRequest("https://kovravpn.com/api/vpn/pair-code", { method: "POST", headers: { cookie: `sid=${SID}` }, body: "{not json" }),
    );
    assert.equal(res.status, 400);
    assert.equal((await issue({ uuid: "../../x" })).res.status, 400);
  });

  test("20 an hour per account; the 21st is 429 with retryAfter and Retry-After", async () => {
    seed();
    for (let i = 0; i < 20; i += 1) assert.equal((await issue({ uuid: MINE })).res.status, 200, `#${i + 1}`);
    const { res, body } = await issue({ uuid: MINE });
    assert.equal(res.status, 429);
    assert.deepEqual(body, { error: "Too many requests", retryAfter: 3600 });
    assert.equal(res.headers.get("retry-after"), "3600");
    assert.equal(pairKeys().length, 20);
    assert.equal((await issue({ uuid: THEIRS }, SID_OTHER)).res.status, 200, "another account has its own budget");
  });

  test("Redis down on the write: 500, logged without the link", async () => {
    seed();
    const savedSet = mem.redis.set;
    mem.redis.set = async (key, ...rest) => {
      if (String(key).startsWith("paircode:")) throw new Error(`ERR write ${key} https://kovravpn.com/api/sub/${TOKEN}`);
      return savedSet(key, ...rest);
    };
    const from = logged.length;
    try {
      const { res } = await issue({ uuid: MINE });
      assert.equal(res.status, 500);
    } finally {
      mem.redis.set = savedSet;
    }
    const lines = logged.slice(from).join("\n");
    assert.match(lines, /\[pair-code\] issue failed/);
    assert.doesNotMatch(lines, new RegExp(TOKEN));
    assert.doesNotMatch(lines, /paircode:[2-9A-Z]/);
  });
});

describe("POST /api/pair/code (the app)", () => {
  async function freshCode() {
    const { res, body } = await issue({ uuid: MINE });
    assert.equal(res.status, 200);
    return body;
  }

  test("OPTIONS: 204 with the CORS of the app's route", async () => {
    const res = await redeemRoute.OPTIONS();
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(res.headers.get("access-control-allow-headers"), "Content-Type");
  });

  test("the code gives the link once, then 404; CORS and no-store on both", async () => {
    seed();
    const { display } = await freshCode();
    const first = await redeem({ code: display });
    assert.equal(first.res.status, 200);
    assert.deepEqual(first.body, { status: "ready", subUrl: `https://kovravpn.com/api/sub/${TOKEN}` });
    assert.equal(first.res.headers.get("access-control-allow-origin"), "*");
    assert.equal(first.res.headers.get("cache-control"), "no-store");
    assert.deepEqual(pairKeys(), []);
    const second = await redeem({ code: display });
    assert.equal(second.res.status, 404);
    assert.deepEqual(second.body, { error: "not_found" });
    assert.equal(second.res.headers.get("access-control-allow-origin"), "*");
    assert.equal(second.res.headers.get("cache-control"), "no-store");
  });

  test("an answer lost on the way is given again: the next try, asked with the same requestId, says ready (contract v1.1)", async () => {
    // GETDEL runs before the 200 leaves. If that 200 never reaches the app
    // (timeout, reset), the app walks to the next name with the same code and
    // the same requestId. In v1 that name found nothing and said not_found
    // about a code typed correctly; now it gives the lost answer again.
    seed();
    const { code, display } = await freshCode();
    const lost = await redeemRoute.POST(
      new Request("https://kovravpn.com/api/pair/code", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "client-a" },
        body: JSON.stringify({ code, requestId: RID_A }),
      }),
    );
    assert.equal(lost.status, 200, "the service did answer");
    const lostBody = await lost.json();
    assert.deepEqual(pairKeys(), [`paircode:done:${code}`], "the code is spent; only its replay record is left");
    const next = await redeemRoute.POST(
      new Request("https://www.kovravpn.com/api/pair/code", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "client-a" },
        body: JSON.stringify({ code: display, requestId: RID_A }),
      }),
    );
    assert.equal(next.status, 200);
    assert.deepEqual(await next.json(), lostBody);
    assert.deepEqual(lostBody, { status: "ready", subUrl: `https://kovravpn.com/api/sub/${TOKEN}` });
    assert.deepEqual(headersOf(next), headersOf(lost), "byte for byte the answer that was lost");
    // Anyone else who has the code still hears the v1 not_found.
    const wrong = await redeem({ code: code === "23456789" ? "23456788" : "23456789" }, "client-a");
    for (const body of [{ code, requestId: RID_B }, { code }]) {
      const other = await redeem(body, "client-a", "www.kovravpn.com");
      assert.equal(other.res.status, 404, JSON.stringify(Object.keys(body)));
      assert.deepEqual(other.body, wrong.body, "the same answer as a wrong code");
    }
  });

  test("lower case, no dash, spaces: the same code", async () => {
    seed();
    const { code } = await freshCode();
    assert.equal((await redeem({ code: ` ${code.slice(0, 4).toLowerCase()} ${code.slice(4)} ` })).res.status, 200);
  });

  test("a raw paste with a no-break space or a tab: the same code, as the app reads it", async () => {
    seed();
    for (const sep of ["\u00a0", "\t", "\u00a0-\u00a0"]) {
      const { code } = await freshCode();
      const { res, body } = await redeem({ code: `\ufeff${code.slice(0, 4)}${sep}${code.slice(4)}\n` });
      assert.equal(res.status, 200, JSON.stringify(sep));
      assert.equal(body.status, "ready");
    }
  });

  test("wrong and expired are the same 404", async () => {
    seed();
    const { code } = await freshCode();
    const wrong = code === "23456789" ? "23456788" : "23456789";
    const w = await redeem({ code: wrong });
    assert.equal(w.res.status, 404);
    // Expiry is Redis's: the key is simply gone after its 600 s.
    mem.store.delete(`paircode:${code}`);
    const e = await redeem({ code });
    assert.equal(e.res.status, 404);
    assert.deepEqual(e.body, w.body);
  });

  test("malformed codes and broken bodies: 400 bad_code, CORS kept", async () => {
    seed();
    for (const body of [{ code: "K7QM2XP0" }, { code: "K7QM2XP" }, { code: 12345678 }, {}, [], "null", "{not json", "", JSON.stringify({ code: "x".repeat(2000) })]) {
      const { res, body: out } = await redeem(body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
      assert.deepEqual(out, { error: "bad_code" });
      assert.equal(res.headers.get("access-control-allow-origin"), "*");
    }
  });

  test("two parallel redeems of one code: exactly one 200", async () => {
    seed();
    const { display } = await freshCode();
    const results = await Promise.all([redeem({ code: display }, "client-a"), redeem({ code: display }, "client-b"), redeem({ code: display }, "client-c")]);
    assert.deepEqual(results.map((r) => r.res.status).sort(), [200, 404, 404]);
  });

  test("10 a minute per address: the 11th is 429 with Retry-After; another address is not affected", async () => {
    seed();
    for (let i = 0; i < 10; i += 1) assert.equal((await redeem({ code: "23456789" }, "client-a")).res.status, 404, `#${i + 1}`);
    const over = await redeem({ code: "23456789" }, "client-a");
    assert.equal(over.res.status, 429);
    assert.deepEqual(over.body, { error: "rate_limited" });
    assert.equal(over.res.headers.get("retry-after"), "60");
    assert.equal(over.res.headers.get("access-control-allow-origin"), "*");
    assert.equal((await redeem({ code: "23456789" }, "client-b")).res.status, 404);
  });

  test("a malformed attempt counts too", async () => {
    seed();
    for (let i = 0; i < 10; i += 1) await redeem("{not json", "client-a");
    assert.equal((await redeem({ code: "23456789" }, "client-a")).res.status, 429);
  });

  test("60 a day per address", async () => {
    seed();
    mem.store.set("rl:pair-code-redeem:day:client-a", "60");
    mem.ttls.set("rl:pair-code-redeem:day:client-a", { ex: 50_000, px: undefined });
    const over = await redeem({ code: "23456789" }, "client-a");
    assert.equal(over.res.status, 429);
    assert.equal(over.res.headers.get("retry-after"), "50000");
  });

  test("a rate-limited redeem does not burn a live code", async () => {
    seed();
    const { display } = await freshCode();
    for (let i = 0; i < 10; i += 1) await redeem({ code: "23456789" }, "client-a");
    assert.equal((await redeem({ code: display }, "client-a")).res.status, 429);
    assert.equal((await redeem({ code: display }, "client-b")).res.status, 200);
  });

  test("Redis down before the redeem script ran: 503, the code untouched, nothing secret logged", async () => {
    seed();
    const { code } = await freshCode();
    const savedEval = mem.redis.eval;
    mem.redis.eval = async (script, keys) => {
      throw new Error(`ERR eval ${keys.join(" ")}`);
    };
    const from = logged.length;
    try {
      const { res, body } = await redeem({ code });
      assert.equal(res.status, 503);
      assert.deepEqual(body, { error: "unavailable" });
    } finally {
      mem.redis.eval = savedEval;
    }
    assert.deepEqual(pairKeys(), [`paircode:${code}`]);
    const lines = logged.slice(from).join("\n");
    assert.match(lines, /\[pair-code\] redeem failed/);
    assert.ok(!lines.includes(code), lines);
  });
});

describe("POST /api/pair/code with a requestId (contract v1.1)", () => {
  async function freshCode() {
    const { res, body } = await issue({ uuid: MINE });
    assert.equal(res.status, 200);
    return body;
  }

  const LINK = `https://kovravpn.com/api/sub/${TOKEN}`;
  const doneKey = (code) => `paircode:done:${code}`;

  /** A code that was never issued, other than `code`. */
  const neverIssued = (code) => (code === "23456789" ? "23456788" : "23456789");

  test("the same requestId gets the same 200 again, from either name", async () => {
    seed();
    const { code, display } = await freshCode();
    const first = await redeem({ code: display, requestId: RID_A });
    assert.equal(first.res.status, 200);
    assert.deepEqual(first.body, { status: "ready", subUrl: LINK });
    for (const host of ["kovravpn.com", "www.kovravpn.com"]) {
      const again = await redeem({ code, requestId: RID_A }, "client-a", host);
      assert.equal(again.res.status, 200, host);
      assert.deepEqual(again.body, first.body, host);
      assert.deepEqual(headersOf(again.res), headersOf(first.res), host);
    }
  });

  test("another requestId: the 404 of a code that never existed, status, body and every header", async () => {
    seed();
    const { code } = await freshCode();
    assert.equal((await redeem({ code, requestId: RID_A })).res.status, 200);
    const other = await redeem({ code, requestId: RID_B });
    const never = await redeem({ code: neverIssued(code), requestId: RID_B });
    const neverBare = await redeem({ code: neverIssued(code) });
    assert.equal(other.res.status, 404);
    assert.deepEqual(other.body, { error: "not_found" });
    for (const ref of [never, neverBare]) {
      assert.equal(other.res.status, ref.res.status);
      assert.deepEqual(other.body, ref.body);
      assert.deepEqual(headersOf(other.res), headersOf(ref.res));
    }
    assert.equal((await redeem({ code, requestId: RID_A })).res.status, 200, "a wrong id does not spoil the replay");
  });

  test("no requestId after the code was spent with one: the same 404", async () => {
    seed();
    const { code } = await freshCode();
    await redeem({ code, requestId: RID_A });
    const bare = await redeem({ code });
    const never = await redeem({ code: neverIssued(code) });
    assert.equal(bare.res.status, 404);
    assert.deepEqual(bare.body, never.body);
    assert.deepEqual(headersOf(bare.res), headersOf(never.res));
  });

  test("a malformed requestId is ignored, never a 400: the redeem works as v1, leaves no record, cannot replay", async () => {
    const malformed = ["short", "a".repeat(21), "a".repeat(65), `${RID_A}=`, `${RID_A.slice(0, 40)}+/A`, ` ${RID_A}`, "", 43, true, null, { id: RID_A }, [RID_A]];
    seed();
    for (const [i, requestId] of malformed.entries()) {
      const { code } = await freshCode();
      // One address per id, so the minute limit stays out of the way.
      const first = await redeem({ code, requestId }, `client-m${i}`);
      assert.equal(first.res.status, 200, JSON.stringify(requestId));
      assert.deepEqual(first.body, { status: "ready", subUrl: LINK });
      assert.equal(mem.store.has(doneKey(code)), false, JSON.stringify(requestId));
      const again = await redeem({ code, requestId }, `client-m${i}`);
      assert.equal(again.res.status, 404, JSON.stringify(requestId));
      assert.deepEqual(again.body, { error: "not_found" });
    }
    for (const [i, requestId] of malformed.entries()) {
      const { res, body } = await redeem({ code: "K7QM2XP0", requestId }, `client-m${i}`);
      assert.equal(res.status, 400, "a malformed code is still bad_code, whatever the id");
      assert.deepEqual(body, { error: "bad_code" });
    }
  });

  test("the replay record: paircode:done:<CODE> for 300 s, {subUrl, rid} with only the SHA-256 of the id", async () => {
    seed();
    const { code } = await freshCode();
    await redeem({ code, requestId: RID_A });
    assert.deepEqual(pairKeys(), [doneKey(code)]);
    assert.deepEqual(mem.ttls.get(doneKey(code)), { ex: 300, px: undefined });
    const record = JSON.parse(mem.store.get(doneKey(code)));
    assert.deepEqual(Object.keys(record).sort(), ["rid", "subUrl"]);
    assert.equal(record.rid, sha256(RID_A));
    assert.equal(record.subUrl, LINK);
    for (const [key, value] of mem.store) {
      assert.ok(!key.includes(RID_A) && !String(value).includes(RID_A), `the raw id is stored under ${key}`);
    }
  });

  test("a replay after 300 s: the same 404 as a code that never existed", async () => {
    seed();
    const { code } = await freshCode();
    await redeem({ code, requestId: RID_A });
    // Expiry is Redis's: the record is simply gone after its 300 s.
    mem.store.delete(doneKey(code));
    mem.ttls.delete(doneKey(code));
    const late = await redeem({ code, requestId: RID_A });
    const never = await redeem({ code: neverIssued(code), requestId: RID_A });
    assert.equal(late.res.status, 404);
    assert.deepEqual(late.body, never.body);
    assert.deepEqual(headersOf(late.res), headersOf(never.res));
  });

  test("replays do not extend the 300 s: the record is written once, by the redeem's own script, and only read after", async () => {
    seed();
    const { code } = await freshCode();
    const writes = [];
    const replies = [];
    const saved = { set: mem.redis.set, expire: mem.redis.expire, eval: mem.redis.eval };
    mem.redis.set = async (key, ...rest) => {
      if (String(key).startsWith("paircode:")) writes.push(["set", key]);
      return saved.set(key, ...rest);
    };
    mem.redis.expire = async (key, ...rest) => {
      if (String(key).startsWith("paircode:")) writes.push(["expire", key]);
      return saved.expire(key, ...rest);
    };
    mem.redis.eval = async (...args) => {
      const reply = await saved.eval(...args);
      replies.push(reply?.[0] === "taken" ? ["taken", reply[2]] : reply?.[0] ?? null);
      return reply;
    };
    let ttl;
    let record;
    try {
      await redeem({ code, requestId: RID_A });
      ttl = mem.ttls.get(doneKey(code));
      record = mem.store.get(doneKey(code));
      for (let i = 0; i < 5; i += 1) assert.equal((await redeem({ code, requestId: RID_A })).res.status, 200, `replay #${i + 1}`);
    } finally {
      Object.assign(mem.redis, saved);
    }
    assert.deepEqual(writes, [], "nothing outside the script writes a pair-code key");
    assert.deepEqual(replies, [["taken", 1], "done", "done", "done", "done", "done"]);
    assert.deepEqual(ttl, { ex: 300, px: undefined });
    assert.equal(mem.ttls.get(doneKey(code)), ttl, "the TTL entry is the one the redeem set, never set again");
    assert.equal(mem.store.get(doneKey(code)), record);
  });

  test("parallel redeems with different requestIds: exactly one 200, the others the plain 404", async () => {
    seed();
    const { display } = await freshCode();
    const results = await Promise.all([
      redeem({ code: display, requestId: RID_A }, "client-a"),
      redeem({ code: display, requestId: RID_B }, "client-b"),
      redeem({ code: display, requestId: RID_C }, "client-c"),
    ]);
    assert.deepEqual(results.map((r) => r.res.status).sort(), [200, 404, 404]);
    for (const r of results.filter((x) => x.res.status === 404)) assert.deepEqual(r.body, { error: "not_found" });
  });

  test("parallel redeems with the same requestId: both 200 with the same link", async () => {
    seed();
    const { code, display } = await freshCode();
    const results = await Promise.all([redeem({ code: display, requestId: RID_A }, "client-a"), redeem({ code, requestId: RID_A }, "client-a", "kovravpn.com")]);
    assert.deepEqual(results.map((r) => r.res.status), [200, 200]);
    for (const r of results) assert.deepEqual(r.body, { status: "ready", subUrl: LINK });
  });

  test("replays count against the address's limits like any redeem", async () => {
    seed();
    const { code } = await freshCode();
    assert.equal((await redeem({ code, requestId: RID_A }, "client-a")).res.status, 200);
    for (let i = 0; i < 9; i += 1) assert.equal((await redeem({ code, requestId: RID_A }, "client-a")).res.status, 200, `replay #${i + 1}`);
    const over = await redeem({ code, requestId: RID_A }, "client-a");
    assert.equal(over.res.status, 429);
    assert.deepEqual(over.body, { error: "rate_limited" });
    assert.equal(over.res.headers.get("retry-after"), "60");
    assert.equal(mem.store.get("rl:pair-code-redeem:min:client-a"), "11");
    assert.equal((await redeem({ code, requestId: RID_A }, "client-b")).res.status, 200, "a 429 does not spoil the record");
  });

  test("an address over its day limit cannot replay either", async () => {
    seed();
    const { code } = await freshCode();
    assert.equal((await redeem({ code, requestId: RID_A }, "client-a")).res.status, 200);
    mem.store.set("rl:pair-code-redeem:day:client-a", "60");
    mem.ttls.set("rl:pair-code-redeem:day:client-a", { ex: 40_000, px: undefined });
    const over = await redeem({ code, requestId: RID_A }, "client-a");
    assert.equal(over.res.status, 429);
    assert.equal(over.res.headers.get("retry-after"), "40000");
  });

  test("a replay record the script could not write: the 200 still goes out, a warning without secrets, a retry is 404", async () => {
    seed();
    const { code } = await freshCode();
    const savedEval = mem.redis.eval;
    // What the script answers when cjson or the record's SET failed: the code taken, 0.
    mem.redis.eval = async (script, keys) => {
      const taken = mem.store.get(keys[0]) ?? null;
      mem.store.delete(keys[0]);
      return taken === null ? null : ["taken", JSON.parse(taken), 0];
    };
    const from = logged.length;
    try {
      const { res, body } = await redeem({ code, requestId: RID_A });
      assert.equal(res.status, 200);
      assert.deepEqual(body, { status: "ready", subUrl: LINK });
    } finally {
      mem.redis.eval = savedEval;
    }
    const lines = logged.slice(from).join("\n");
    assert.match(lines, /"event":"pair_code_replay_unsaved"/);
    for (const secret of [code, LINK, TOKEN, RID_A, sha256(RID_A), MINE]) assert.ok(!lines.includes(secret), `${secret} logged:\n${lines}`);
    assert.deepEqual(pairKeys(), [], "the code is spent, nothing to replay");
    assert.equal((await redeem({ code, requestId: RID_A })).res.status, 404);
  });

  test("Redis down on a replay: 503, not a final not_found", async () => {
    seed();
    const { code } = await freshCode();
    await redeem({ code, requestId: RID_A });
    const savedEval = mem.redis.eval;
    mem.redis.eval = async (script, keys) => {
      throw new Error(`ERR eval ${keys.join(" ")}`);
    };
    const from = logged.length;
    try {
      const { res, body } = await redeem({ code, requestId: RID_A });
      assert.equal(res.status, 503);
      assert.deepEqual(body, { error: "unavailable" });
    } finally {
      mem.redis.eval = savedEval;
    }
    assert.ok(!logged.slice(from).join("\n").includes(code));
    assert.equal((await redeem({ code, requestId: RID_A })).res.status, 200, "the record is still there for the retry");
  });

  test("the script ran but its answer never came back from Redis: 503, and the retry with the same requestId gets the 200", async () => {
    // Upstash took the code and wrote its record; the answer was lost between
    // Vercel and Upstash and the client gave up. The code is spent: the 503
    // says nothing about that, the replay record gives the link to the app's
    // next name or next press, and to nobody else.
    seed();
    const { code, display } = await freshCode();
    const savedEval = mem.redis.eval;
    mem.redis.eval = async (...args) => {
      await savedEval(...args);
      throw new TypeError("fetch failed");
    };
    let lost;
    try {
      lost = await redeem({ code, requestId: RID_A }, "client-a", "kovravpn.com");
    } finally {
      mem.redis.eval = savedEval;
    }
    assert.equal(lost.res.status, 503);
    assert.deepEqual(lost.body, { error: "unavailable" });
    assert.deepEqual(pairKeys(), [doneKey(code)], "the code is spent, its replay record left");
    const next = await redeem({ code: display, requestId: RID_A }, "client-a", "www.kovravpn.com");
    assert.equal(next.res.status, 200);
    assert.deepEqual(next.body, { status: "ready", subUrl: LINK });
    const never = await redeem({ code: neverIssued(code) });
    for (const body of [{ code, requestId: RID_B }, { code }]) {
      const other = await redeem(body, "client-b");
      assert.equal(other.res.status, 404, JSON.stringify(Object.keys(body)));
      assert.deepEqual(other.body, never.body);
      assert.deepEqual(headersOf(other.res), headersOf(never.res));
    }
  });

  test("a v1 app (no requestId) sees v1 exactly: no record, one 200, then 404", async () => {
    seed();
    const { code } = await freshCode();
    assert.equal((await redeem({ code })).res.status, 200);
    assert.deepEqual(pairKeys(), []);
    assert.equal((await redeem({ code })).res.status, 404);
  });
});

describe("POST /api/pair/code: a web page cannot spend the address's budget", () => {
  // What any site can make a visitor's browser send: a no-cors fetch or a
  // form (no preflight, text/plain or a form type), or, since CORS is "*", a
  // JSON fetch whose preflight passes. None of it may count against the
  // address the person's app redeems from.
  function rawRedeem(headers, body, ip = "client-a") {
    return redeemRoute.POST(new Request("https://kovravpn.com/api/pair/code", { method: "POST", headers: { "x-forwarded-for": ip, ...headers }, body }));
  }

  const budgetKeys = () => [...mem.store.keys()].filter((k) => k.startsWith("rl:pair-code-redeem:"));

  async function freshCode() {
    const { res, body } = await issue({ uuid: MINE });
    assert.equal(res.status, 200);
    return body;
  }

  test("a no-cors text/plain POST: 415, uncounted; 70 of them leave the app's redeem untouched", async () => {
    seed();
    const { display } = await freshCode();
    for (let i = 0; i < 70; i += 1) {
      const res = await rawRedeem({ "content-type": "text/plain;charset=UTF-8" }, "x");
      assert.equal(res.status, 415, `#${i + 1}`);
      assert.deepEqual(await res.json(), { error: "unsupported_media_type" });
      assert.equal(res.headers.get("access-control-allow-origin"), "*");
      assert.equal(res.headers.get("cache-control"), "no-store");
    }
    assert.deepEqual(budgetKeys(), []);
    const app = await redeem({ code: display }, "client-a");
    assert.equal(app.res.status, 200);
  });

  test("forms and bodies without a type: 415, uncounted, a live code in them not spent", async () => {
    seed();
    const { code, display } = await freshCode();
    const bodies = [
      [{ "content-type": "application/x-www-form-urlencoded" }, `code=${code}`],
      [{ "content-type": "multipart/form-data; boundary=b" }, `--b\r\nContent-Disposition: form-data; name="code"\r\n\r\n${code}\r\n--b--`],
      [{ "content-type": "text/plain" }, JSON.stringify({ code })],
      [{}, JSON.stringify({ code })],
    ];
    for (let i = 0; i < 20; i += 1) {
      for (const [headers, body] of bodies) assert.equal((await rawRedeem(headers, body)).status, 415, JSON.stringify(headers));
    }
    assert.deepEqual(budgetKeys(), []);
    assert.deepEqual(pairKeys(), [`paircode:${code}`]);
    assert.equal((await redeem({ code: display }, "client-a")).res.status, 200);
  });

  test("a JSON POST from another site's page: 403, uncounted, a live code in it not spent", async () => {
    seed();
    const { code, display } = await freshCode();
    for (let i = 0; i < 70; i += 1) {
      const origin = i % 2 === 0 ? "https://evil.example" : "null";
      const res = await rawRedeem({ "content-type": "application/json", origin }, JSON.stringify({ code: i === 0 ? code : "23456789" }));
      assert.equal(res.status, 403, `#${i + 1}`);
      assert.deepEqual(await res.json(), { error: "forbidden" });
      assert.equal(res.headers.get("access-control-allow-origin"), "*");
    }
    assert.deepEqual(budgetKeys(), []);
    assert.deepEqual(pairKeys(), [`paircode:${code}`]);
    assert.equal((await redeem({ code: display }, "client-a")).res.status, 200);
  });

  test("the app's own requests still count: JSON with a charset, and a page of our own site", async () => {
    seed();
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await rawRedeem({ "content-type": "application/json; charset=utf-8" }, JSON.stringify({ code: "23456789" }))).status, 404);
    }
    for (let i = 0; i < 5; i += 1) {
      const res = await rawRedeem({ "content-type": "Application/JSON", origin: "https://kovravpn.com" }, JSON.stringify({ code: "23456789" }));
      assert.equal(res.status, 404);
    }
    const over = await rawRedeem({ "content-type": "application/json" }, JSON.stringify({ code: "23456789" }));
    assert.equal(over.status, 429);
    assert.equal(over.headers.get("retry-after"), "60");
  });

  test("a refused request logs nothing: a page firing in a loop cannot fill the logs", async () => {
    seed();
    const from = logged.length;
    for (let i = 0; i < 5; i += 1) {
      await rawRedeem({ "content-type": "text/plain" }, "x");
      await rawRedeem({ "content-type": "application/json", origin: "https://evil.example" }, "{}");
    }
    assert.deepEqual(logged.slice(from), []);
  });
});

describe("nothing secret in the logs of either route", () => {
  test("a full round: issue, redeem, replay, reuse, wrong, malformed, rate limited", async () => {
    seed();
    const from = logged.length;
    const { code, display } = await freshRound();
    const lines = logged.slice(from);
    assert.ok(lines.length >= 4, `expected the audit lines, got ${lines.length}`);
    const text = lines.join("\n");
    for (const secret of [code, display, TOKEN, `https://kovravpn.com/api/sub/${TOKEN}`, MINE, "client-a", RID_A, RID_B, sha256(RID_A), sha256(RID_B)]) {
      assert.ok(!text.includes(secret), `${secret} logged:\n${text}`);
    }
    assert.match(text, /"event":"pair_code_redeem","outcome":"replayed"\}/);
    assert.match(text, /"event":"pair_code_issued","userId":"tg_100"/);
    assert.match(text, /"event":"pair_code_redeem","outcome":"ready","userId":"tg_100"/);
    assert.match(text, /"outcome":"not_found"/);
    assert.match(text, /"outcome":"bad_code"/);
    assert.match(text, /"outcome":"rate_limited"/);
  });

  async function freshRound() {
    const { body } = await issue({ uuid: MINE });
    await redeem({ code: body.display, requestId: RID_A }, "client-a");
    await redeem({ code: body.code, requestId: RID_A }, "client-a");
    await redeem({ code: body.code, requestId: RID_B }, "client-a");
    await redeem({ code: body.code }, "client-a");
    await redeem({ code: "23456789" }, "client-a");
    await redeem({ code: "nope" }, "client-a");
    for (let i = 0; i < 8; i += 1) await redeem({ code: "nope" }, "client-a");
    return body;
  }
});
