// tests/sub-access.test.mjs — run: npm test
//
// KS-5: /api/sub/<token>/vless served real servers without any of the checks
// of /api/sub/<token>: no HWID binding, no plan, no slot, no deleted-link
// notice, and a legacy per-account link listed every device. Appending
// "/vless" to a link got around the one-device binding and kept an expired
// or paused device supplied. Both feeds now take one decision
// (lib/sub-access.ts) and give the same notices (lib/sub-notices.ts).
//
// Runs against an in-memory Redis with a static registry entry on a
// documentation address. Ids, tokens and keys are made up.

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

delete process.env.KOVRA_STATIC_PANELS;
delete process.env.SUBSCRIPTION_FORMAT_DEFAULT;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");

const { NextRequest } = await import("next/server");
const { GET: mainFeed } = await import("../src/app/api/sub/[token]/route.ts");
const { GET: vlessFeed } = await import("../src/app/api/sub/[token]/vless/route.ts");
const { resolveSubAccess, HWID_BINDING_TTL_SEC } = await import("../src/lib/sub-access.ts");

const DAY = 86_400_000;
const USER = "tg_100000001";
const uuid = (n) => `0a1b2c3d-0000-4000-8000-00000000${String(n).padStart(4, "0")}`;
/** Three devices, created on days 1, 2 and 3: device 3 is the newest. */
const PROFILES = [1, 2, 3].map((n) => ({
  uuid: uuid(n),
  clientEmail: `vpn_${USER}_${n}`,
  vlessUrl: `vless://${uuid(n)}@stored.invalid:1#stored`,
  createdAt: n * DAY,
  deviceType: "android",
  subToken: `tok${n}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`.slice(0, 32),
}));
const LEGACY = "legacyaaaaaaaaaaaaaaaaaaaaaaaaaaa".slice(0, 32);
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

const plan3 = (daysLeft) => ({ id: `p${daysLeft}`, kind: "plan3", slots: 3, startedAt: 1, expiresAt: Date.now() + daysLeft * DAY });
const bonus = (daysLeft) => ({ id: `r${daysLeft}`, kind: "referral", slots: 1, startedAt: 1, expiresAt: Date.now() + daysLeft * DAY });

beforeEach(() => {
  mem.reset();
  mem.store.set("inbounds:registry", JSON.stringify(REGISTRY));
  mem.store.set(`account:${USER}`, JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 }));
  mem.store.set(`profiles:${USER}`, JSON.stringify(PROFILES));
  for (const p of PROFILES) mem.store.set(`sub_prof:${p.subToken}`, JSON.stringify({ userId: USER, uuid: p.uuid }));
  mem.store.set(`sub_token:${LEGACY}`, USER);
  mem.store.set(`subs:${USER}`, JSON.stringify([plan3(30)]));
});

const FEEDS = [
  ["/api/sub/<token>", mainFeed, ""],
  ["/api/sub/<token>/vless", vlessFeed, "/vless"],
];

async function fetchFeed(feed, suffix, token, hwid) {
  const headers = hwid ? { "x-hwid": hwid } : {};
  const res = await feed(new NextRequest(`https://kovra.test/api/sub/${token}${suffix}`, { headers }), {
    params: Promise.resolve({ token }),
  });
  const text = await res.text();
  let decoded = "";
  try {
    decoded = Buffer.from(text, "base64").toString("utf8");
  } catch {
    /* not base64 */
  }
  return { res, text, decoded };
}

const servesDevice = (decoded, n) => decoded.includes(`vless://${uuid(n)}@203.0.113.10:443`);

for (const [name, feed, suffix] of FEEDS) {
  describe(name, () => {
    test("a device holding a slot gets the servers, dated by its slot", async () => {
      const { res, decoded } = await fetchFeed(feed, suffix, PROFILES[2].subToken);
      assert.equal(res.status, 200);
      assert.ok(servesDevice(decoded, 3));
      assert.match(res.headers.get("subscription-userinfo"), /expire=\d+/);
    });

    test("no running plan: the no-plan notice, no servers", async () => {
      mem.store.set(`subs:${USER}`, JSON.stringify([plan3(-1)]));
      const { res, decoded } = await fetchFeed(feed, suffix, PROFILES[2].subToken);
      assert.equal(res.status, 200);
      assert.match(decoded, /No%20active%20plan/);
      assert.ok(!decoded.includes("203.0.113.10"));
    });

    test("a device beyond the running slots is paused (KM-03)", async () => {
      mem.store.set(`subs:${USER}`, JSON.stringify([plan3(-1), bonus(14)]));
      const paused = await fetchFeed(feed, suffix, PROFILES[0].subToken);
      assert.match(paused.decoded, /Device%20paused/);
      assert.ok(!paused.decoded.includes("203.0.113.10"));
      const newest = await fetchFeed(feed, suffix, PROFILES[2].subToken);
      assert.ok(servesDevice(newest.decoded, 3));
    });

    test("a deleted link gets the removed notice", async () => {
      mem.store.set(`sub_deleted:${PROFILES[1].subToken}`, USER);
      const { decoded } = await fetchFeed(feed, suffix, PROFILES[1].subToken);
      assert.match(decoded, /Subscription%20removed/);
    });

    test("one link, one device: a second x-hwid gets the device-limit notice", async () => {
      const first = await fetchFeed(feed, suffix, PROFILES[2].subToken, "hwid-phone");
      assert.ok(servesDevice(first.decoded, 3));
      assert.equal(mem.store.get(`sub:${PROFILES[2].subToken}:hwid`), "hwid-phone");
      assert.deepEqual(mem.ttls.get(`sub:${PROFILES[2].subToken}:hwid`), { ex: HWID_BINDING_TTL_SEC, px: undefined });
      const second = await fetchFeed(feed, suffix, PROFILES[2].subToken, "hwid-laptop");
      assert.match(second.decoded, /One%20device%20per%20link/);
      assert.ok(!second.decoded.includes("203.0.113.10"));
      const again = await fetchFeed(feed, suffix, PROFILES[2].subToken, "hwid-phone");
      assert.ok(servesDevice(again.decoded, 3), "the bound device keeps working");
    });

    test("an app that sends no x-hwid passes unbound, as before", async () => {
      mem.store.set(`sub:${PROFILES[2].subToken}:hwid`, "hwid-phone");
      const { decoded } = await fetchFeed(feed, suffix, PROFILES[2].subToken);
      assert.ok(servesDevice(decoded, 3));
    });

    test("the legacy per-account link serves only the devices holding a slot", async () => {
      mem.store.set(`subs:${USER}`, JSON.stringify([plan3(-1), bonus(14)]));
      const { decoded } = await fetchFeed(feed, suffix, LEGACY);
      assert.ok(servesDevice(decoded, 3));
      assert.ok(!servesDevice(decoded, 1) && !servesDevice(decoded, 2));
    });

    test("an unknown token is a 404 and leaves no binding behind; a short one is a 403", async () => {
      const unknown = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
      const { res } = await fetchFeed(feed, suffix, unknown, "hwid-phone");
      assert.equal(res.status, 404);
      assert.equal(mem.store.has(`sub:${unknown}:hwid`), false);
      assert.equal((await fetchFeed(feed, suffix, "short", "hwid-phone")).res.status, 403);
    });
  });
}

test("/vless can no longer get around the binding of the main link", async () => {
  const token = PROFILES[2].subToken;
  await fetchFeed(mainFeed, "", token, "hwid-phone");
  const bypass = await fetchFeed(vlessFeed, "/vless", token, "hwid-laptop");
  assert.match(bypass.decoded, /One%20device%20per%20link/);
});

test("resolveSubAccess: the same answer for the same state, whichever feed asks", async () => {
  mem.store.set(`subs:${USER}`, JSON.stringify([plan3(-1), bonus(14)]));
  assert.deepEqual(await resolveSubAccess(PROFILES[0].subToken, null), { kind: "paused" });
  const granted = await resolveSubAccess(PROFILES[2].subToken, null);
  assert.equal(granted.kind, "device");
  assert.equal(granted.profile.uuid, uuid(3));
  assert.deepEqual(await resolveSubAccess("", null), { kind: "invalid" });
});
