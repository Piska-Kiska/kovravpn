// tests/hwid-claim-own-app.test.mjs — run: npm test
//
// A redeemed "code for the app" moves the link into our own app, the Kovra
// app for iPhone (ported from the ProxysVPN site, where the owner asked for
// it: "for our app only; the other app is told the link is taken").
//
// Without it a person moving from another app to ours took a code in the
// cabinet, typed it, and the app answered "one device per link" - for the very
// link the code had just handed over.
//
// POST /api/pair/code leaves a note for ten minutes (`sub:<token>:hwid:claim`,
// lib/pair-code-server.ts claimHwidForOwnApp), and the first fetch of OUR app
// (lib/own-app.ts, by its User-Agent) from another device takes the binding by
// it (lib/sub-access.ts). Checked here:
//
//   - which User-Agents are ours, and that a lookalike is not;
//   - our app takes a link bound elsewhere, once; the device it left is
//     refused from then on;
//   - any other client is answered exactly as before and does not spend the
//     note; without a note nothing changes for our app either;
//   - a link that already lives in our own app on another device is NOT taken
//     by the note (codes would otherwise walk one link over any number of
//     devices); which app holds a link is `sub:<token>:hwid:own`, believed
//     only while it names the bound device;
//   - the redeem route writes the note for the link of the code's own device,
//     a replay writes none, and a failed write does not cost the 200;
//   - both feeds that serve a subscription behave so;
//   - the note and the record go with the device.
//
// Every id, token and key is synthetic; addresses are RFC 5737.

import { test, describe, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";

delete process.env.KOVRA_STATIC_PANELS;
delete process.env.SUBSCRIPTION_FORMAT_DEFAULT;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { isOwnAppUa } = await import("../src/lib/own-app.ts");
const { resolveSubAccess, claimedHwidKey, ownAppHwidKey, HWID_BINDING_TTL_SEC } = await import("../src/lib/sub-access.ts");
const { claimHwidForOwnApp, handLinkToOwnApp, CLAIMED_HWID_TTL_S } = await import("../src/lib/pair-code-server.ts");
const { removeProfile } = await import("../src/lib/accounts.ts");
const { PAIR_CODE_REDEEM_SCRIPT } = await import("../src/lib/pair-code.ts");
const { runPairCodeRedeem } = await import("./support/pair-code-redeem-model.mjs");
const redeemRoute = await import("../src/app/api/pair/code/route.ts");
const issueRoute = await import("../src/app/api/vpn/pair-code/route.ts");
const { GET: mainFeed } = await import("../src/app/api/sub/[token]/route.ts");
const { GET: vlessFeed } = await import("../src/app/api/sub/[token]/vless/route.ts");

const DAY = 86_400_000;
const USER = "tg_100000001";
const SID = "0f0e0d0c-0b0a-4908-8706-050403020101";
const UUID = "0a1b2c3d-0000-4000-8000-000000000001";
const TOKEN = "tokaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const BIND = `sub:${TOKEN}:hwid`;
const CLAIM = claimedHwidKey(TOKEN);
const OWN = ownAppHwidKey(TOKEN);
const OUR_UA = "Kovra/0.3.14 (iOS; appstore)";
const HAPP_UA = "Happ/3.2.1";
const REGISTRY = [
  {
    key: "t1",
    label: "Test",
    flag: "",
    enabled: true,
    priority: 0,
    source: "static",
    address: "203.0.113.10",
    port: 443,
    serverName: "example.com",
    publicKey: "test-public-key",
    shortId: "ab",
    spiderX: "/",
    fingerprint: "firefox",
    encryption: "none",
    flow: "xtls-rprx-vision",
  },
];

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
  const now = Date.now();
  mem.store.set("inbounds:registry", JSON.stringify(REGISTRY));
  mem.store.set(`session:${SID}`, JSON.stringify({ userId: USER, createdAt: now, lastActivity: now, remember: true }));
  mem.store.set(`account:${USER}`, JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 }));
  mem.store.set(
    `profiles:${USER}`,
    JSON.stringify([{ uuid: UUID, clientEmail: `vpn_${USER}_1`, vlessUrl: `vless://${UUID}@stored.invalid:1#stored`, createdAt: DAY, deviceType: "iphone", subToken: TOKEN }]),
  );
  mem.store.set(`sub_prof:${TOKEN}`, JSON.stringify({ userId: USER, uuid: UUID }));
  mem.store.set(`subs:${USER}`, JSON.stringify([{ id: "p30", kind: "plan3", slots: 3, startedAt: 1, expiresAt: now + 30 * DAY }]));
});

/** One fetch through the access decision, as a feed makes it. */
const ask = (hwid, ownApp) => resolveSubAccess(TOKEN, hwid, Date.now(), ownApp);
const granted = (access) => access.kind === "device";

describe("isOwnAppUa", () => {
  test("the shape the Kovra app sends is ours", () => {
    for (const ua of [OUR_UA, "Kovra/1.0.0 (iOS; appstore)", "Kovra/0.3.14-rc.1 (iPadOS; appstore)", `  ${OUR_UA}  `]) {
      assert.equal(isOwnAppUa(ua), true, ua);
    }
  });

  test("another client, a lookalike and nothing at all are not", () => {
    for (const ua of [
      HAPP_UA,
      "ProxysVPN/0.3.14 (iOS; appstore)",
      "Kovra-Desktop/0.3.14 (macOS)",
      "Kovra/0.3.14 (iOS)",
      "Kovra/0.3.14 (iOS; site)",
      `Mozilla/5.0 ${OUR_UA}`,
      `${OUR_UA} extra`,
      "kovra/0.3.14 (iOS; appstore)",
      `Kovra/${"1".repeat(600)} (iOS; appstore)`,
      "",
      "   ",
      null,
      undefined,
    ]) {
      assert.equal(isOwnAppUa(ua), false, String(ua).slice(0, 60));
    }
  });
});

describe("claimHwidForOwnApp", () => {
  test("leaves a note of ten minutes beside the binding, and moves nothing", async () => {
    mem.store.set(BIND, "hwid-happ");
    await claimHwidForOwnApp(TOKEN);
    assert.equal(mem.store.get(CLAIM), "1");
    assert.deepEqual(mem.ttls.get(CLAIM), { ex: CLAIMED_HWID_TTL_S, px: undefined });
    assert.equal(CLAIMED_HWID_TTL_S, 600);
    assert.equal(mem.store.get(BIND), "hwid-happ");
  });
});

describe("our app takes the link by the note", () => {
  test("a link bound to another app goes to ours, and that app is refused from then on", async () => {
    mem.store.set(BIND, "hwid-happ");
    await claimHwidForOwnApp(TOKEN);
    assert.ok(granted(await ask("hwid-ours", true)));
    assert.equal(mem.store.get(BIND), "hwid-ours");
    assert.deepEqual(mem.ttls.get(BIND), { ex: HWID_BINDING_TTL_SEC, px: undefined });
    assert.equal(mem.store.get(OWN), "hwid-ours");
    assert.equal(mem.store.has(CLAIM), false, "the note is spent");
    assert.deepEqual(await ask("hwid-happ", false), { kind: "second-device" });
    assert.ok(granted(await ask("hwid-ours", true)), "and ours keeps it");
  });

  test("the note works once: a second device of our app is refused", async () => {
    mem.store.set(BIND, "hwid-happ");
    await claimHwidForOwnApp(TOKEN);
    assert.ok(granted(await ask("hwid-ours", true)));
    assert.deepEqual(await ask("hwid-ours-2", true), { kind: "second-device" });
    assert.equal(mem.store.get(BIND), "hwid-ours");
  });

  test("two of our apps asking at once: one gets the link", async () => {
    mem.store.set(BIND, "hwid-happ");
    await claimHwidForOwnApp(TOKEN);
    const results = await Promise.all([ask("hwid-ours-a", true), ask("hwid-ours-b", true)]);
    assert.deepEqual(results.map((r) => r.kind).sort(), ["device", "second-device"]);
    assert.ok(["hwid-ours-a", "hwid-ours-b"].includes(mem.store.get(BIND)));
  });

  test("without a note our app is refused like anyone, and nothing is written", async () => {
    mem.store.set(BIND, "hwid-happ");
    assert.deepEqual(await ask("hwid-ours", true), { kind: "second-device" });
    assert.equal(mem.store.get(BIND), "hwid-happ");
    assert.equal(mem.store.has(OWN), false);
  });

  test("a note that has run out is no note", async () => {
    mem.store.set(BIND, "hwid-happ");
    await claimHwidForOwnApp(TOKEN);
    mem.elapse(CLAIMED_HWID_TTL_S);
    assert.deepEqual(await ask("hwid-ours", true), { kind: "second-device" });
    assert.equal(mem.store.get(BIND), "hwid-happ");
  });

  test("a link bound to nothing binds to our app as it always did, and is recorded as ours", async () => {
    assert.ok(granted(await ask("hwid-ours", true)));
    assert.equal(mem.store.get(BIND), "hwid-ours");
    assert.equal(mem.store.get(OWN), "hwid-ours");
    assert.deepEqual(mem.ttls.get(OWN), { ex: HWID_BINDING_TTL_SEC, px: undefined });
  });

  test("another app that binds a free link leaves no such record", async () => {
    assert.ok(granted(await ask("hwid-happ", false)));
    assert.equal(mem.store.get(BIND), "hwid-happ");
    assert.equal(mem.store.has(OWN), false);
  });

  test("our app that is already the bound device leaves the note alone", async () => {
    mem.store.set(BIND, "hwid-ours");
    await claimHwidForOwnApp(TOKEN);
    assert.ok(granted(await ask("hwid-ours", true)));
    assert.equal(mem.store.get(CLAIM), "1");
  });

  test("an id that reads as a number is taken from like any other", async () => {
    // Upstash parses replies as JSON: an id of digits alone comes back as a number.
    mem.store.set(BIND, "1234567890123456");
    await claimHwidForOwnApp(TOKEN);
    assert.ok(granted(await ask("hwid-ours", true)));
    assert.equal(mem.store.get(BIND), "hwid-ours");
  });
});

describe("a link that already lives in our own app stays there", () => {
  test("a note does not take the link from our app on another device, and is not spent", async () => {
    mem.store.set(BIND, "hwid-ours-a");
    mem.store.set(OWN, "hwid-ours-a");
    await claimHwidForOwnApp(TOKEN);
    assert.deepEqual(await ask("hwid-ours-b", true), { kind: "second-device" });
    assert.equal(mem.store.get(BIND), "hwid-ours-a");
    assert.equal(mem.store.get(CLAIM), "1");
  });

  test("codes alone do not walk one link over device after device", async () => {
    mem.store.set(BIND, "hwid-happ");
    await claimHwidForOwnApp(TOKEN);
    assert.ok(granted(await ask("hwid-ours-1", true)));
    for (let i = 2; i <= 4; i += 1) {
      await claimHwidForOwnApp(TOKEN);
      assert.deepEqual(await ask(`hwid-ours-${i}`, true), { kind: "second-device" }, `device ${i}`);
    }
    assert.equal(mem.store.get(BIND), "hwid-ours-1");
  });

  test("after the cabinet's reset the link binds the next device, ours included, as before", async () => {
    mem.store.set(BIND, "hwid-ours-a");
    mem.store.set(OWN, "hwid-ours-a");
    mem.store.delete(BIND);
    assert.ok(granted(await ask("hwid-ours-b", true)));
    assert.equal(mem.store.get(BIND), "hwid-ours-b");
    assert.equal(mem.store.get(OWN), "hwid-ours-b");
  });

  test("the record is believed only while it names the bound device", async () => {
    // Ours held it, a reset freed it, another app bound it: that is another app's link now.
    mem.store.set(OWN, "hwid-ours-a");
    mem.store.set(BIND, "hwid-happ");
    await claimHwidForOwnApp(TOKEN);
    assert.ok(granted(await ask("hwid-ours-b", true)));
    assert.equal(mem.store.get(BIND), "hwid-ours-b");
  });

  test("an id of our app that reads as a number is recognised all the same", async () => {
    mem.store.set(BIND, "1234567890123456");
    mem.store.set(OWN, "1234567890123456");
    await claimHwidForOwnApp(TOKEN);
    assert.deepEqual(await ask("hwid-ours-b", true), { kind: "second-device" });
    assert.equal(mem.store.get(CLAIM), "1");
  });
});

describe("every other client is answered as before", () => {
  test("a third device in another app is refused and does not spend the note", async () => {
    mem.store.set(BIND, "hwid-happ");
    await claimHwidForOwnApp(TOKEN);
    assert.deepEqual(await ask("hwid-other", false), { kind: "second-device" });
    assert.equal(mem.store.get(CLAIM), "1");
    assert.equal(mem.store.get(BIND), "hwid-happ");
    assert.equal(mem.store.has(OWN), false);
    assert.ok(granted(await ask("hwid-ours", true)), "the note still works for ours");
  });

  test("the app the link lives in keeps working until ours comes", async () => {
    mem.store.set(BIND, "hwid-happ");
    await claimHwidForOwnApp(TOKEN);
    assert.ok(granted(await ask("hwid-happ", false)));
    assert.equal(mem.store.get(CLAIM), "1");
  });

  test("a request with no id binds nothing and does not spend the note", async () => {
    mem.store.set(BIND, "hwid-happ");
    await claimHwidForOwnApp(TOKEN);
    assert.ok(granted(await ask(null, true)));
    assert.ok(granted(await ask("  ", true)));
    assert.equal(mem.store.get(CLAIM), "1");
    assert.equal(mem.store.get(BIND), "hwid-happ");
  });
});

function issueReq(body) {
  return new NextRequest("https://kovravpn.com/api/vpn/pair-code", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `sid=${SID}` },
    body: JSON.stringify(body),
  });
}

async function freshCode() {
  const res = await issueRoute.POST(issueReq({ uuid: UUID }));
  assert.equal(res.status, 200);
  return res.json();
}

async function redeem(body) {
  const res = await redeemRoute.POST(
    new Request("https://kovravpn.com/api/pair/code", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.7" },
      body: JSON.stringify(body),
    }),
  );
  return { res, body: await res.json() };
}

describe("POST /api/pair/code leaves the note", () => {
  test("for the link of the code's own device, for ten minutes", async () => {
    const { display } = await freshCode();
    assert.equal(mem.store.has(CLAIM), false, "issuing moves nothing");
    const { res, body } = await redeem({ code: display });
    assert.equal(res.status, 200);
    assert.equal(body.subUrl, `https://kovravpn.com/api/sub/${TOKEN}`);
    assert.equal(mem.store.get(CLAIM), "1");
    assert.deepEqual(mem.ttls.get(CLAIM), { ex: 600, px: undefined });
  });

  test("a wrong code leaves none", async () => {
    const { code } = await freshCode();
    const { res } = await redeem({ code: code === "23456789" ? "23456788" : "23456789" });
    assert.equal(res.status, 404);
    assert.equal(mem.store.has(CLAIM), false);
  });

  test("a replay of a lost answer writes none of its own", async () => {
    const { code } = await freshCode();
    const requestId = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWY"; // gitleaks:allow — synthetic test value
    assert.equal((await redeem({ code, requestId })).res.status, 200);
    mem.store.delete(CLAIM);
    const replay = await redeem({ code, requestId });
    assert.equal(replay.res.status, 200);
    assert.equal(mem.store.has(CLAIM), false);
  });

  test("a note that could not be written does not cost the link, and the log names neither", async () => {
    const { display, code } = await freshCode();
    mem.failNext("set", { key: CLAIM });
    const from = logged.length;
    const { res, body } = await redeem({ code: display });
    assert.equal(res.status, 200);
    assert.equal(body.status, "ready");
    const lines = logged.slice(from).join("\n");
    assert.match(lines, /\[pair-code\] handover note failed/);
    for (const secret of [TOKEN, code, display]) assert.ok(!lines.includes(secret), `${secret} logged:\n${lines}`);
  });
});

describe("handLinkToOwnApp", () => {
  const devices = async () => [{ uuid: UUID, subToken: TOKEN }, { uuid: "0a1b2c3d-0000-4000-8000-000000000002" }];

  test("names the link of the account's own device", async () => {
    const claimed = [];
    assert.equal(await handLinkToOwnApp(USER, UUID, { devices, claim: async (t) => void claimed.push(t) }), true);
    assert.deepEqual(claimed, [TOKEN]);
  });

  test("a device that is gone, one with no link yet and a malformed id get nothing", async () => {
    const claimed = [];
    const deps = { devices, claim: async (t) => void claimed.push(t) };
    assert.equal(await handLinkToOwnApp(USER, "0a1b2c3d-0000-4000-8000-000000000009", deps), false);
    assert.equal(await handLinkToOwnApp(USER, "0a1b2c3d-0000-4000-8000-000000000002", deps), false);
    assert.equal(await handLinkToOwnApp(USER, "../x", deps), false);
    assert.equal(await handLinkToOwnApp("", UUID, deps), false);
    assert.deepEqual(claimed, []);
  });

  test("a Redis failure rejects: the route decides what a lost note means", async () => {
    await assert.rejects(
      handLinkToOwnApp(USER, UUID, {
        devices,
        claim: async () => {
          throw new Error("down");
        },
      }),
      /down/,
    );
  });
});

const FEEDS = [
  ["/api/sub/<token>", mainFeed, ""],
  ["/api/sub/<token>/vless", vlessFeed, "/vless"],
];

async function fetchFeed(feed, suffix, hwid, ua) {
  const res = await feed(new NextRequest(`https://kovravpn.com/api/sub/${TOKEN}${suffix}`, { headers: { "x-hwid": hwid, "user-agent": ua } }), {
    params: Promise.resolve({ token: TOKEN }),
  });
  return Buffer.from(await res.text(), "base64").toString("utf8");
}

const servers = (decoded) => decoded.includes(`vless://${UUID}@203.0.113.10:443`);

for (const [name, feed, suffix] of FEEDS) {
  describe(`from the code to the app: GET ${name}`, () => {
    test("Happ had the link; the code is typed into our app; ours gets the servers and Happ the notice", async () => {
      assert.ok(servers(await fetchFeed(feed, suffix, "hwid-happ", HAPP_UA)));
      const { display } = await freshCode();
      assert.equal((await redeem({ code: display })).res.status, 200);
      assert.ok(servers(await fetchFeed(feed, suffix, "hwid-ours", OUR_UA)));
      const happ = await fetchFeed(feed, suffix, "hwid-happ", HAPP_UA);
      assert.ok(!servers(happ));
      assert.match(happ, /One%20device%20per%20link/);
    });

    test("our app had the link; a code is typed into our app on another device: the notice", async () => {
      assert.ok(servers(await fetchFeed(feed, suffix, "hwid-ours-a", OUR_UA)));
      const { display } = await freshCode();
      await redeem({ code: display });
      assert.ok(!servers(await fetchFeed(feed, suffix, "hwid-ours-b", OUR_UA)));
      assert.ok(servers(await fetchFeed(feed, suffix, "hwid-ours-a", OUR_UA)));
    });

    test("a client that only carries our name somewhere in its User-Agent does not take the link", async () => {
      assert.ok(servers(await fetchFeed(feed, suffix, "hwid-happ", HAPP_UA)));
      const { display } = await freshCode();
      await redeem({ code: display });
      assert.ok(!servers(await fetchFeed(feed, suffix, "hwid-fake", `Mozilla/5.0 ${OUR_UA}`)));
      assert.equal(mem.store.get(CLAIM), "1");
    });
  });
}

describe("the note and the record go with the device", () => {
  test("removeProfile deletes the binding, the record and a waiting note", async () => {
    mem.store.set(BIND, "hwid-ours");
    mem.store.set(OWN, "hwid-ours");
    await claimHwidForOwnApp(TOKEN);
    await removeProfile(USER, UUID);
    for (const key of [BIND, OWN, CLAIM]) assert.equal(mem.store.has(key), false, key);
  });
});
