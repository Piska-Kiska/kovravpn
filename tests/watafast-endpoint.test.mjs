// tests/watafast-endpoint.test.mjs
//
// The app's own endpoint (src/lib/watafast-endpoint.ts), both routes, against
// the in-memory Redis of tests/support/memory-redis.mjs with the real link
// decision (lib/sub-access.ts), the real registry and the real gate:
//
//   GET /api/watafast/v1/<token>                    the signed manifest
//   GET /api/watafast/v1/<token>/credential/<key>   a credential for the reserve
//
// What is pinned: every status of both tables; a deployment without keys
// answers before it reads or writes anything; the two routes agree on who is
// given the reserve; the manifest carries Kovra's names only; nothing a log
// line says is a token, a key or a credential.
//
// Every token, key, name and address below is synthetic: counting bytes, the
// public test keys of RFC 7748, names under `.example` and RFC 5737
// addresses. Nothing leaves the process.
//
// Run: npm test

import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, createPrivateKey, createPublicKey, verify as edVerify } from "node:crypto";

delete process.env.KOVRA_STATIC_PANELS;

import { setRedisModule } from "./support/load-ts.mjs";
setRedisModule(new URL("./support/memory-redis.mjs", import.meta.url));
const mem = await import("./support/memory-redis.mjs");
const { DEVICE_KEY_ADMIT_MARK, runDeviceKeyAdmit } = await import("./support/device-key-admit-model.mjs");

const { NextRequest } = await import("next/server");
const endpoint = await import("../src/lib/watafast-endpoint.ts");
const { ADMIT_DEVICE_KEY_SCRIPT, MAX_KEYS_PER_LINK } = await import("../src/lib/watafast-device-keys.ts");
const { credentialIds, CREDENTIAL_TTL_S } = await import("../src/lib/watafast-credential.ts");
const { reserveNodesFromEnv, reserveOrderFor } = await import("../src/lib/watafast-reserve.ts");
const gate = await import("../src/lib/watafast-reserve-gate.ts");
const manifestRoute = await import("../src/app/api/watafast/v1/[token]/route.ts");
const credentialRoute = await import("../src/app/api/watafast/v1/[token]/credential/[key]/route.ts");

// The ledger's script, as the fake runs it: the model of the Lua over the
// fake's sorted sets (key -> Map of member -> score).
assert.ok(ADMIT_DEVICE_KEY_SCRIPT.includes(DEVICE_KEY_ADMIT_MARK));
mem.registerScript(ADMIT_DEVICE_KEY_SCRIPT, (_api, keys, args) => {
  const [key] = keys;
  const lists = new Map();
  const held = mem.zsets.get(key);
  if (held) lists.set(key, [...held].map(([member, score]) => ({ score, member })).sort((a, b) => a.score - b.score));
  const reply = runDeviceKeyAdmit(lists, (k, ms) => mem.ttls.set(k, { px: ms }), keys, args);
  const after = lists.get(key);
  if (after) mem.zsets.set(key, new Map(after.map((e) => [e.member, e.score])));
  else mem.zsets.delete(key);
  return reply;
});

const DAY = 86_400_000;
const NOW = Date.now();
const USER = "tg_100200300";
const UUID = "33333333-3333-4333-8333-333333333333";
const TOKEN = "kovratokenaaaaaaaaaaaaaaaaaaaaaa";
const OWN_APP_UA = "Kovra/1.0.0 (ios; appstore)";

const MANIFEST_SEED = Buffer.alloc(32, 0x09);
const ISSUER_SEED_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const ISSUER_KEY_ID = 9;
const ID_KEY_HEX = "c3".repeat(32);
/** Alice's and Bob's public keys of RFC 7748 §6.1. */
const DEVICE_PUBLIC = "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a";
const OTHER_PUBLIC = "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f";
/** A public key nobody has: a counting byte string that is a point like any other. */
const keyNumber = (n) => `${"11".repeat(31)}${(0x20 + n).toString(16)}`;

const NODES = [
  { id: "r1", wire: 2, server: "one.example:443", addresses: ["203.0.113.5:443"], path: "/assets/one", node_public_key: "a1".repeat(32) },
  { id: "r2", wire: 2, server: "two.example:443", path: "/assets/two", node_public_key: "b2".repeat(32) },
];

const REGISTRY = [
  {
    key: "de",
    label: "Germany",
    flag: "🇩🇪",
    enabled: true,
    priority: 1,
    source: "static",
    address: "203.0.113.40",
    port: 8443,
    serverName: "www.example.org",
    publicKey: "D".repeat(43),
    shortId: "0011223344556677",
    spiderX: "/",
    fingerprint: "chrome",
    encryption: "none",
    flow: "xtls-rprx-vision",
  },
  {
    key: "nl",
    label: "Netherlands",
    flag: "🇳🇱",
    enabled: true,
    priority: 2,
    source: "static",
    protocol: "hysteria2",
    address: "203.0.113.30",
    port: 8443,
  },
];

const ENV = Object.freeze({
  WATAFAST_MANIFEST_KEY: MANIFEST_SEED.toString("base64"),
  WATAFAST_MANIFEST_KID: "kw1",
  WATAFAST_ISSUER_KEY: `${ISSUER_KEY_ID}:${ISSUER_SEED_HEX}`,
  WATAFAST_ID_KEY: ID_KEY_HEX,
  WATAFAST_RESERVE_NODES: JSON.stringify(NODES),
});

const plan3 = (daysLeft) => ({ id: `p${daysLeft}`, kind: "plan3", slots: 3, startedAt: 1, expiresAt: NOW + daysLeft * DAY });

function seedAccount({ userId = USER, token = TOKEN, uuid = UUID, subs = [plan3(30)], user } = {}) {
  mem.store.set(`account:${userId}`, JSON.stringify({ plan: "active", maxProfiles: 100, extraProfiles: 0, paidUntil: 0, createdAt: 1 }));
  mem.store.set(
    `profiles:${userId}`,
    JSON.stringify([{ uuid, clientEmail: `vpn_${userId}_1`, vlessUrl: "vless://stored.invalid", createdAt: DAY, deviceType: "ios", subToken: token }]),
  );
  mem.store.set(`sub_prof:${token}`, JSON.stringify({ userId, uuid }));
  mem.store.set(`subs:${userId}`, JSON.stringify(subs));
  if (user) mem.store.set(`user:${userId}`, JSON.stringify(user));
}

/** Give the reserve to these members of the gate's set. */
const give = (...members) => mem.sets.set(gate.WATAFAST_RESERVE_USERS_KEY, new Set(members));

/** A limiter the test steers: every question is written down. */
function steeredLimiter() {
  const limiter = {
    asked: [],
    answer: { ok: true, retryAfter: 0 },
    fault: null,
    async rateLimit(key, max, windowSec) {
      limiter.asked.push({ key, max, windowSec });
      if (limiter.fault) throw limiter.fault;
      return limiter.answer;
    },
  };
  return limiter;
}

let limiter;
const depsWith = (change = {}) => ({
  ...endpoint.defaultWatafastEndpointDeps(),
  env: ENV,
  now: () => NOW,
  rateLimit: limiter.rateLimit,
  ...change,
});

/** `hwid: undefined` and `ua: undefined` send no such header; leaving them out sends our app's. */
function headersOf(options = {}) {
  const hwid = "hwid" in options ? options.hwid : "device-a";
  const ua = "ua" in options ? options.ua : OWN_APP_UA;
  const headers = {};
  if (hwid !== undefined) headers["x-hwid"] = hwid;
  if (ua !== undefined) headers["user-agent"] = ua;
  return headers;
}

function manifest(token, options = {}, change = {}) {
  const query = options.lang ? `?lang=${options.lang}` : "";
  const req = new Request(`https://kovra.test/api/watafast/v1/${token}${query}`, { headers: headersOf(options) });
  return endpoint.handleManifest(req, token, depsWith(change));
}

function credential(token, options = {}, change = {}) {
  const key = "key" in options ? options.key : DEVICE_PUBLIC;
  const req = new Request(`https://kovra.test/api/watafast/v1/${token}/credential/${encodeURIComponent(key)}`, {
    headers: headersOf(options),
  });
  return endpoint.handleCredential(req, token, key, depsWith(change));
}

const payloadOf = async (res) => JSON.parse(Buffer.from((await res.json()).payload, "base64url").toString("utf8"));

function publicKeyFromSeed(seed) {
  const der = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  return createPublicKey(createPrivateKey({ key: der, format: "der", type: "pkcs8" }));
}

/** What a node does with a credential before anything else. */
function credentialVerifies(bytes) {
  const message = Buffer.concat([Buffer.from("wf1-credential\0", "latin1"), bytes.subarray(0, 96)]);
  return edVerify(null, message, publicKeyFromSeed(Buffer.from(ISSUER_SEED_HEX, "hex")), bytes.subarray(96));
}

/** Everything printed while `run` runs, as one text. */
async function logged(run) {
  const lines = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  const keep = (...args) => lines.push(args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : JSON.stringify(a))).join(" "));
  Object.assign(console, { log: keep, warn: keep, error: keep });
  try {
    return { result: await run(), text: lines.join("\n") };
  } finally {
    Object.assign(console, original);
  }
}

/** Store round trips since the last reset. */
const storeCalls = () => [...mem.calls.values()].reduce((sum, n) => sum + n, 0);

const asksFor = (op) => mem.calls.get(op) ?? 0;

beforeEach(() => {
  mem.reset();
  mem.store.set("inbounds:registry", JSON.stringify(REGISTRY));
  seedAccount();
  limiter = steeredLimiter();
});

describe("the manifest", () => {
  test("200: a signed envelope under kw1 that verifies with Kovra's key, no-store", async () => {
    const res = await manifest(TOKEN);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^application\/json/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const envelope = await res.clone().json();
    assert.deepEqual(Object.keys(envelope), ["v", "kid", "payload", "sig"]);
    assert.equal(envelope.kid, "kw1");
    const bytes = Buffer.from(envelope.payload, "base64url");
    const message = Buffer.concat([Buffer.from("watafast-manifest-v1\n", "ascii"), bytes]);
    assert.equal(edVerify(null, message, publicKeyFromSeed(MANIFEST_SEED), Buffer.from(envelope.sig, "base64url")), true);

    const payload = JSON.parse(bytes.toString("utf8"));
    assert.deepEqual(payload.account, { status: "active", plan: "base", notice: null });
    assert.equal(payload.token_hash, createHash("sha256").update(TOKEN).digest("hex").slice(0, 16));
    assert.equal(payload.issued_at, NOW);
    assert.deepEqual(payload.locations.map((l) => [l.id, l.candidates[0].protocol, l.candidates[0].uuid]), [
      ["de", "vision", UUID],
      ["nl", "hysteria2", UUID],
    ]);
    assert.equal("reserve" in payload, false, "the account is not given the reserve");
  });

  test("the names are Kovra's own unless the setting says otherwise", async () => {
    assert.deepEqual((await payloadOf(await manifest(TOKEN))).hosts, ["kovravpn.com", "www.kovravpn.com"]);
    assert.deepEqual(endpoint.DEFAULT_MANIFEST_HOSTS, ["kovravpn.com", "www.kovravpn.com"]);
    const set = await payloadOf(
      await manifest(TOKEN, {}, { env: { ...ENV, WATAFAST_MANIFEST_HOSTS: "a.example, b.example", WATAFAST_MANIFEST_HOSTS_WITHDRAWN: "b.example" } }),
    );
    assert.deepEqual(set.hosts, ["a.example"]);
    assert.deepEqual(set.withdrawn_hosts, ["b.example"]);
  });

  test("no key, no kid or a broken key: 503 before the store is asked or a device bound", async () => {
    for (const change of [
      { WATAFAST_MANIFEST_KEY: undefined },
      { WATAFAST_MANIFEST_KID: undefined },
      { WATAFAST_MANIFEST_KEY: Buffer.alloc(16, 1).toString("base64") },
    ]) {
      mem.calls.clear();
      limiter.asked.length = 0;
      const { result, text } = await logged(() => manifest(TOKEN, {}, { env: { ...ENV, ...change } }));
      assert.equal(result.status, 503, JSON.stringify(change));
      assert.deepEqual(await result.json(), { error: "unavailable" });
      assert.equal(storeCalls(), 0, "nothing read");
      assert.equal(limiter.asked.length, 0, "nothing counted");
      assert.equal(mem.store.has(`sub:${TOKEN}:hwid`), false, "nothing bound");
      assert.ok(!text.includes(MANIFEST_SEED.toString("base64")));
    }
  });

  test("a token that is not one of ours is a 404 without a question to the store", async () => {
    for (const token of ["short", "a".repeat(129), "bad.token.aaaaaaa", "with space aaaaaa"]) {
      mem.calls.clear();
      const res = await manifest(token);
      assert.equal(res.status, 404, token);
      assert.deepEqual(await res.json(), { error: "not_found" });
      assert.equal(storeCalls(), 0);
    }
  });

  test("an unknown or deleted link is a 404 and binds nothing", async () => {
    const unknown = "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
    assert.equal((await manifest(unknown)).status, 404);
    assert.equal(mem.store.has(`sub:${unknown}:hwid`), false);
    mem.store.set(`sub_deleted:${TOKEN}`, USER);
    const deleted = await manifest(TOKEN);
    assert.equal(deleted.status, 404);
    assert.deepEqual(await deleted.json(), { error: "not_found" });
  });

  test("one link, one device: the first device id binds it, a second gets 403 second_device", async () => {
    assert.equal((await manifest(TOKEN, { hwid: "device-a" })).status, 200);
    assert.equal(mem.store.get(`sub:${TOKEN}:hwid`), "device-a");
    const second = await manifest(TOKEN, { hwid: "device-b" });
    assert.equal(second.status, 403);
    assert.deepEqual(await second.json(), { error: "second_device" });
    assert.equal((await manifest(TOKEN, { hwid: "device-a" })).status, 200, "the bound device keeps its list");
  });

  test("no x-hwid: the list, and no binding written", async () => {
    assert.equal((await manifest(TOKEN, { hwid: undefined })).status, 200);
    assert.equal(mem.store.has(`sub:${TOKEN}:hwid`), false);
  });

  test("the limiter: 30 a minute per link; over it 429 with Retry-After; a limiter fault lets the list through", async () => {
    await manifest(TOKEN);
    assert.deepEqual(limiter.asked, [{ key: `wfm:${TOKEN}`, max: 30, windowSec: 60 }]);
    limiter.answer = { ok: false, retryAfter: 17 };
    const limited = await manifest(TOKEN);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "17");
    assert.deepEqual(await limited.json(), { error: "rate_limited" });
    limiter.fault = new Error("limiter down");
    const { result } = await logged(() => manifest(TOKEN));
    assert.equal(result.status, 200);
  });

  test("an account without a plan: a signed 'expired' with the neutral store notice, in the app's language, and no way in", async () => {
    seedAccount({ subs: [plan3(-1)] });
    give("*");
    let asked = 0;
    const entriesFor = async () => {
      asked += 1;
      return REGISTRY;
    };
    const en = await payloadOf(await manifest(TOKEN, {}, { entriesFor }));
    assert.deepEqual(en.account, { status: "expired", plan: "base", notice: "Access has ended." });
    assert.deepEqual(en.locations, []);
    assert.equal("reserve" in en, false);
    const ru = await payloadOf(await manifest(TOKEN, { lang: "ru" }, { entriesFor }));
    assert.equal(ru.account.notice, "Доступ закончился.");
    assert.equal(asked, 0, "the registry is not read for a closed account");
    for (const notice of [en.account.notice, ru.account.notice]) {
      assert.ok(!/https?:|t\.me|@|₽|\$/.test(notice), "no link, no bot, no price");
    }
  });

  test("a paused device: 'expired' with the paused notice", async () => {
    mem.store.set(
      `profiles:${USER}`,
      JSON.stringify([
        { uuid: "44444444-4444-4444-8444-444444444444", clientEmail: "a", vlessUrl: "vless://x", createdAt: DAY * 5, deviceType: "ios", subToken: "newertokenaaaaaaaaaaaaaaaaaaaaaa" },
        { uuid: UUID, clientEmail: "b", vlessUrl: "vless://x", createdAt: DAY, deviceType: "ios", subToken: TOKEN },
      ]),
    );
    mem.store.set(`subs:${USER}`, JSON.stringify([{ id: "one", kind: "plan1", slots: 1, startedAt: 1, expiresAt: NOW + 30 * DAY }]));
    const payload = await payloadOf(await manifest(TOKEN));
    assert.equal(payload.account.status, "expired");
    assert.match(payload.account.notice, /paused/);
  });

  test("a resolver that throws costs one location; a registry that throws costs the answer, 503, and the log has no token", async () => {
    const resolveEntry = async () => {
      throw new Error("panel down");
    };
    const { result: one } = await logged(() => manifest(TOKEN, {}, { resolveEntry }));
    assert.deepEqual((await payloadOf(one)).locations.map((l) => l.id), ["nl"]);

    const entriesFor = async () => {
      throw new Error("registry down");
    };
    const { result, text } = await logged(() => manifest(TOKEN, {}, { entriesFor }));
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: "unavailable" });
    assert.ok(!text.includes(TOKEN));
  });
});

describe("the reserve in the manifest", () => {
  const ORDER = reserveOrderFor(reserveNodesFromEnv(ENV.WATAFAST_RESERVE_NODES).nodes, UUID);

  test("a listed account gets the nodes, in its device's order, last in the document", async () => {
    give(USER);
    const payload = await payloadOf(await manifest(TOKEN));
    assert.deepEqual(payload.reserve, ORDER);
    assert.equal(Object.keys(payload).at(-1), "reserve");
  });

  test("'*' opens it to everyone; a linked Telegram id counts as the account", async () => {
    give("*");
    assert.deepEqual((await payloadOf(await manifest(TOKEN))).reserve, ORDER);
    give("tg_555000111");
    seedAccount({ userId: "em_person@example.com", user: { telegramId: "555000111" } });
    assert.deepEqual((await payloadOf(await manifest(TOKEN))).reserve, ORDER);
  });

  test("the owner is given it without the set", async () => {
    seedAccount({ userId: gate.WATAFAST_RESERVE_OWNER_ID });
    assert.deepEqual((await payloadOf(await manifest(TOKEN))).reserve, ORDER);
  });

  test("no nodes, or nodes but no way to issue a credential: no reserve, and the gate is not asked", async () => {
    give("*");
    for (const env of [
      { ...ENV, WATAFAST_RESERVE_NODES: undefined },
      { ...ENV, WATAFAST_ISSUER_KEY: undefined },
      { ...ENV, WATAFAST_ID_KEY: "c3" },
      { ...ENV, WATAFAST_RESERVE_RATE_KBPS: "fast" },
    ]) {
      mem.calls.clear();
      const { result } = await logged(() => manifest(TOKEN, {}, { env }));
      assert.equal("reserve" in (await payloadOf(result)), false);
      assert.equal(asksFor("smismember"), 0);
    }
  });

  test("a gate that cannot be read is 'no', and the list still goes out", async () => {
    give("*");
    mem.failNext("smismember");
    const { result } = await logged(() => manifest(TOKEN));
    assert.equal(result.status, 200);
    assert.equal("reserve" in (await payloadOf(result)), false);
  });
});

describe("a credential", () => {
  beforeEach(() => give(USER));

  test("200: 160 bytes that verify under the issuer key, for this key and this device, for three days", async () => {
    const { result: res, text } = await logged(() => credential(TOKEN));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.deepEqual(Object.keys(body), ["v", "credential", "not_before", "not_after"]);
    assert.equal(body.v, 1);
    assert.match(body.credential, /^[0-9a-f]{320}$/);

    const bytes = Buffer.from(body.credential, "hex");
    assert.equal(credentialVerifies(bytes), true);
    assert.equal(bytes[0], 1, "version");
    assert.equal(bytes[1], ISSUER_KEY_ID);
    const ids = credentialIds(Buffer.from(ID_KEY_HEX, "hex"), USER, UUID);
    assert.deepEqual(bytes.subarray(2, 18), ids.deviceId);
    assert.equal(bytes.subarray(34, 66).toString("hex"), DEVICE_PUBLIC);
    assert.equal(bytes[66], 0, "Kovra has no PRO");
    assert.equal(Number(bytes.readBigUInt64BE(80)), body.not_before);
    assert.equal(Number(bytes.readBigUInt64BE(88)), body.not_after);
    assert.equal(body.not_after - body.not_before, CREDENTIAL_TTL_S + 300);

    assert.deepEqual([...mem.zsets.get(`wfk:${TOKEN}`).keys()], [`k${DEVICE_PUBLIC}`]);
    for (const secret of [TOKEN, DEVICE_PUBLIC, body.credential, ISSUER_SEED_HEX, ID_KEY_HEX]) {
      assert.ok(!text.includes(secret), "the log carries no token, key or credential");
    }
    assert.match(text, /issued/);
  });

  test("400 for what the route cannot read, before the store is asked", async () => {
    for (const options of [{ key: "zz" }, { key: DEVICE_PUBLIC.slice(2) }, { key: "00".repeat(32) }, { hwid: undefined }, { hwid: "x".repeat(257) }]) {
      mem.calls.clear();
      const res = await credential(TOKEN, options);
      assert.equal(res.status, 400, JSON.stringify(options).slice(0, 60));
      assert.deepEqual(await res.json(), { error: "bad_request" });
      assert.equal(storeCalls(), 0);
    }
    assert.equal((await credential("short")).status, 404);
  });

  test("a deployment that offers no reserve says not_offered to everyone, unread and uncounted", async () => {
    for (const env of [
      { ...ENV, WATAFAST_RESERVE_NODES: undefined },
      { ...ENV, WATAFAST_ISSUER_KEY: undefined },
      { ...ENV, WATAFAST_ISSUER_KEY: "9:00" },
      { ...ENV, WATAFAST_ID_KEY: undefined },
      { ...ENV, WATAFAST_RESERVE_RATE_KBPS: "-1" },
    ]) {
      mem.calls.clear();
      limiter.asked.length = 0;
      const { result } = await logged(() => credential(TOKEN, {}, { env }));
      assert.equal(result.status, 403);
      assert.deepEqual(await result.json(), { error: "not_offered" });
      assert.equal(storeCalls(), 0);
      assert.equal(limiter.asked.length, 0);
    }
  });

  test("the limiter: 30 in ten minutes per link and device id; it fails closed", async () => {
    await credential(TOKEN, { hwid: "device-a" });
    const sha = createHash("sha256").update("device-a", "utf8").digest("hex").slice(0, 16);
    assert.deepEqual(limiter.asked, [{ key: `wfc:${TOKEN}:${sha}`, max: 30, windowSec: 600 }]);

    limiter.answer = { ok: false, retryAfter: 120 };
    const limited = await credential(TOKEN);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "120");

    limiter.fault = new Error("limiter down");
    const { result } = await logged(() => credential(TOKEN));
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: "unavailable" });
  });

  test("the link decides: unknown or deleted 404, another device 403 second_device, no plan 403 not_active", async () => {
    assert.equal((await credential("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")).status, 404);

    assert.equal((await credential(TOKEN, { hwid: "device-a" })).status, 200);
    const other = await credential(TOKEN, { hwid: "device-b" });
    assert.equal(other.status, 403);
    assert.deepEqual(await other.json(), { error: "second_device" });

    mem.store.set(`subs:${USER}`, JSON.stringify([plan3(-1)]));
    const closed = await credential(TOKEN, { hwid: "device-a" });
    assert.equal(closed.status, 403);
    assert.deepEqual(await closed.json(), { error: "not_active" });

    mem.store.set(`sub_deleted:${TOKEN}`, USER);
    assert.equal((await credential(TOKEN, { hwid: "device-a" })).status, 404);
  });

  test("an account not given the reserve gets not_offered, and its ledger is not written", async () => {
    give("tg_999999999");
    const res = await credential(TOKEN);
    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "not_offered" });
    assert.equal(mem.zsets.has(`wfk:${TOKEN}`), false);

    give();
    mem.failNext("smismember");
    const { result } = await logged(() => credential(TOKEN));
    assert.equal(result.status, 403, "a gate that cannot be read is 'no'");
  });

  test(`a link holds keys for ${MAX_KEYS_PER_LINK} devices; the next is told to wait an hour, a known one is not`, async () => {
    for (let n = 0; n < MAX_KEYS_PER_LINK; n += 1) {
      const { result } = await logged(() => credential(TOKEN, { key: keyNumber(n) }));
      assert.equal(result.status, 200, `key ${n}`);
    }
    const full = await credential(TOKEN, { key: OTHER_PUBLIC });
    assert.equal(full.status, 429);
    assert.equal(full.headers.get("retry-after"), "3600");
    assert.deepEqual(await full.json(), { error: "rate_limited" });
    const { result: known } = await logged(() => credential(TOKEN, { key: keyNumber(0) }));
    assert.equal(known.status, 200);
  });

  test("a ledger that cannot count signs nothing: 503", async () => {
    mem.failNext("eval");
    const { result } = await logged(() => credential(TOKEN));
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { error: "unavailable" });
  });

  test("the two routes agree: a credential goes exactly to the links whose manifest names a reserve node", async () => {
    for (const members of [[USER], ["*"], [], ["tg_999999999"]]) {
      give(...members);
      const { result: m } = await logged(() => manifest(TOKEN));
      const named = "reserve" in (await payloadOf(m));
      const { result: c } = await logged(() => credential(TOKEN));
      assert.equal(c.status === 200, named, JSON.stringify(members));
    }
  });
});

describe("the routes", () => {
  test("they hand the request to the endpoint with the deployment's settings: none here, so the safe answers", async () => {
    for (const key of Object.keys(ENV)) delete process.env[key];
    const { result: m } = await logged(() =>
      manifestRoute.GET(new NextRequest(`https://kovra.test/api/watafast/v1/${TOKEN}`, { headers: headersOf() }), {
        params: Promise.resolve({ token: TOKEN }),
      }),
    );
    assert.equal(m.status, 503);
    const c = await credentialRoute.GET(
      new NextRequest(`https://kovra.test/api/watafast/v1/${TOKEN}/credential/${DEVICE_PUBLIC}`, { headers: headersOf() }),
      { params: Promise.resolve({ token: TOKEN, key: DEVICE_PUBLIC }) },
    );
    assert.equal(c.status, 403);
    assert.deepEqual(await c.json(), { error: "not_offered" });
    assert.equal(mem.store.has(`sub:${TOKEN}:hwid`), false);
    assert.equal(manifestRoute.runtime, "nodejs");
    assert.equal(credentialRoute.dynamic, "force-dynamic");
  });

  test("no name of the other brand is written into the endpoint's code", () => {
    for (const path of [
      "src/lib/watafast-endpoint.ts",
      "src/lib/watafast-manifest.ts",
      "src/lib/watafast-access.ts",
      "src/lib/watafast-reserve-gate.ts",
      "src/lib/watafast-reserve.ts",
    ]) {
      const text = readFileSync(new URL(`../${path}`, import.meta.url), "utf8").toLowerCase();
      for (const name of ["proxysvpn.com", "proksya", "tidalgrain"]) assert.ok(!text.includes(name), `${path}: ${name}`);
    }
  });
});
