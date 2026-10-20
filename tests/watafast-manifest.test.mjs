// tests/watafast-manifest.test.mjs
//
// The signed manifest the Kovra app reads (src/lib/watafast-manifest.ts): the
// pure payload builder, the names from a setting, and the signature. The app
// verifies with the same code as ProxysVPN's, so the envelope and the signed
// message are pinned here against an independently computed vector.
//
// Every seed, key, uuid and address below is synthetic: fixed test bytes,
// names under `.example` and RFC 5737 addresses, never anything live.
//
// No Redis: the module is pure, and the resolver below hands back what a
// static entry carries, as lib/inbound-resolver.ts does for one.
//
// Run: npm test

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, verify as edVerify, sign as edSign, createHash } from "node:crypto";

import "./support/load-ts.mjs";

const {
  buildManifestPayload,
  signManifestPayload,
  signManifestWith,
  manifestSignerFromEnv,
  manifestTokenHash,
  validateManifestHosts,
  validateWithdrawnHosts,
  manifestHostSettings,
  splitLocationLabel,
  ed25519PrivateKeyFromSeed,
  MANIFEST_TTL_MS,
} = await import("../src/lib/watafast-manifest.ts");

const PREFIX = Buffer.from("watafast-manifest-v1\n", "ascii");
const derFromSeed = (seed) => Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
const publicKeyOf = (seed) => createPublicKey(createPrivateKey({ key: derFromSeed(seed), format: "der", type: "pkcs8" }));

/** What lib/inbound-resolver.ts returns for a static entry, without the panel client. */
async function resolveEntry(_uuid, entry) {
  if (!entry.address || !entry.port || !entry.publicKey) return null;
  return {
    address: entry.address,
    port: entry.port,
    serverName: entry.serverName ?? "www.example.com",
    publicKey: entry.publicKey,
    shortId: entry.shortId ?? "",
    spiderX: entry.spiderX ?? "/",
    fingerprint: entry.fingerprint ?? "chrome",
    encryption: entry.encryption ?? "none",
    flow: entry.flow ?? "",
  };
}

const DEVICE_UUID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "test-token-0123456789abcdef";
const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const ACTIVE_BASE = { status: "active", plan: "base", notice: null };

const visionEntry = {
  key: "de",
  label: "Germany",
  flag: "🇩🇪",
  enabled: true,
  priority: 2,
  source: "static",
  address: "203.0.113.40",
  port: 8443,
  serverName: "www.example.org",
  publicKey: "D".repeat(43),
  shortId: "0011223344556677",
  spiderX: "/",
  fingerprint: "chrome",
  flow: "xtls-rprx-vision",
};

const secondVisionEntry = {
  ...visionEntry,
  key: "fi",
  label: "Finland · 3.1/50 GB",
  flag: "🇫🇮",
  priority: 4,
  address: "198.51.100.20",
  port: 443,
  publicKey: "C".repeat(43),
  shortId: "",
};

const hy2Entry = {
  key: "nl",
  label: "Netherlands",
  flag: "🇳🇱",
  enabled: true,
  priority: 3,
  source: "static",
  protocol: "hysteria2",
  address: "203.0.113.30",
  port: 8443,
  hy2Pin: "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99",
};

const build = (change = {}) =>
  buildManifestPayload({
    entries: [visionEntry],
    resolveEntry,
    deviceUuid: DEVICE_UUID,
    token: TOKEN,
    account: ACTIVE_BASE,
    hosts: ["a.example", "b.example"],
    now: NOW,
    ...change,
  });

/** Runs `fn` with console.warn captured; returns what was said. */
async function capturingWarn(fn) {
  const said = [];
  const original = console.warn;
  console.warn = (...args) => said.push(args.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return said;
}

describe("buildManifestPayload: locations", () => {
  test("a VLESS Reality entry: one vision candidate with exactly what the resolver gave", async () => {
    const payload = await build();
    assert.equal(payload.locations.length, 1);
    const loc = payload.locations[0];
    assert.deepEqual(
      { id: loc.id, label: loc.label, flag: loc.flag, priority: loc.priority, note: loc.note },
      { id: "de", label: "Germany", flag: "🇩🇪", priority: 2, note: null },
    );
    assert.deepEqual(loc.candidates, [
      {
        id: "de",
        address: "203.0.113.40",
        port: 8443,
        uuid: DEVICE_UUID,
        sni: "www.example.org",
        pbk: "D".repeat(43),
        sid: "0011223344556677",
        fp: "chrome",
        spx: "/",
        protocol: "vision",
        flow: "xtls-rprx-vision",
      },
    ]);
  });

  test("empty optional parameters are left out, not written as empty strings", async () => {
    const payload = await build({ entries: [{ ...secondVisionEntry, flow: "" }] });
    const c = payload.locations[0].candidates[0];
    assert.equal("sid" in c, false);
    assert.equal("flow" in c, false);
    assert.equal(payload.locations[0].note, "3.1/50 GB", "the text after ' · ' is the note");
    assert.equal(payload.locations[0].label, "Finland");
  });

  test("an inbound with VLESS encryption is left out: the app's candidate cannot carry it", async () => {
    for (const encryption of ["mlkem768x25519plus.native.0rtt.AAAA", "aes-128-gcm"]) {
      const payload = await build({ entries: [{ ...visionEntry, encryption }, hy2Entry] });
      assert.deepEqual(payload.locations.map((l) => l.id), ["nl"], encryption);
    }
    for (const encryption of [undefined, "", "none"]) {
      const payload = await build({ entries: [{ ...visionEntry, encryption }] });
      assert.equal(payload.locations.length, 1, String(encryption));
    }
  });

  test("a resolver that throws costs that one location, and the warning names only the entry", async () => {
    const throwing = async (uuid, entry) => {
      if (entry.key === "de") throw new Error(`panel down for ${uuid}`);
      return resolveEntry(uuid, entry);
    };
    let payload;
    const said = await capturingWarn(async () => {
      payload = await build({ entries: [visionEntry, secondVisionEntry], resolveEntry: throwing });
    });
    assert.deepEqual(payload.locations.map((l) => l.id), ["fi"]);
    assert.equal(said.length, 1);
    assert.match(said[0], /entry de did not resolve/);
    assert.ok(!said[0].includes(TOKEN));
  });

  test("an entry that resolves to nothing drops the whole location, never an empty one", async () => {
    const payload = await build({ entries: [{ ...visionEntry, publicKey: undefined }] });
    assert.deepEqual(payload.locations, []);
  });

  test("a Hysteria2 entry: the registry's address and port, SNI www.bing.com, a pin means not insecure", async () => {
    const payload = await build({ entries: [hy2Entry] });
    assert.deepEqual(payload.locations[0].candidates, [
      {
        id: "nl",
        protocol: "hysteria2",
        address: "203.0.113.30",
        port: 8443,
        uuid: DEVICE_UUID,
        sni: "www.bing.com",
        pin_sha256: hy2Entry.hy2Pin,
        insecure: false,
      },
    ]);
  });

  test("a Hysteria2 entry without a pin is insecure unless the registry says not; port defaults to 443", async () => {
    const bare = { ...hy2Entry };
    delete bare.hy2Pin;
    delete bare.port;
    const c = (await build({ entries: [bare] })).locations[0].candidates[0];
    assert.equal("pin_sha256" in c, false);
    assert.equal(c.insecure, true);
    assert.equal(c.port, 443);
    const strict = (await build({ entries: [{ ...bare, hy2Insecure: false, hy2Sni: "sni.example" }] })).locations[0].candidates[0];
    assert.equal(strict.insecure, false);
    assert.equal(strict.sni, "sni.example");
  });

  test("a Hysteria2 entry without an address is left out", async () => {
    const payload = await build({ entries: [{ ...hy2Entry, address: undefined }] });
    assert.deepEqual(payload.locations, []);
  });

  test("locations follow the entries' order", async () => {
    const payload = await build({ entries: [secondVisionEntry, visionEntry, hy2Entry] });
    assert.deepEqual(payload.locations.map((l) => l.id), ["fi", "de", "nl"]);
  });

  test("an account that is not active gets no locations, whatever entries are passed, and the resolver is not asked", async () => {
    let asked = 0;
    const counting = async (uuid, entry) => {
      asked += 1;
      return resolveEntry(uuid, entry);
    };
    for (const status of ["no_funds", "expired"]) {
      const payload = await build({
        entries: [visionEntry, hy2Entry],
        resolveEntry: counting,
        account: { status, plan: "base", notice: "a notice" },
      });
      assert.deepEqual(payload.locations, []);
      assert.deepEqual(payload.account, { status, plan: "base", notice: "a notice" });
    }
    assert.equal(asked, 0);
  });
});

describe("splitLocationLabel", () => {
  test("no ' · ': the whole label, no note", () => {
    assert.deepEqual(splitLocationLabel("Germany"), { label: "Germany", note: null });
  });
  test("only the first ' · ' splits; the rest stays inside the note", () => {
    assert.deepEqual(splitLocationLabel("USA · used 3/50 GB · reset 01.11"), { label: "USA", note: "used 3/50 GB · reset 01.11" });
  });
  test("a transport-only segment is dropped, a real note next to it survives", () => {
    assert.deepEqual(splitLocationLabel("Austria · TCP"), { label: "Austria", note: null });
    assert.deepEqual(splitLocationLabel("Austria · hy2 · 3/50 GB"), { label: "Austria", note: "3/50 GB" });
    assert.deepEqual(splitLocationLabel("Austria · Realityish"), { label: "Austria", note: "Realityish" });
  });
});

describe("token_hash and expiry", () => {
  test("token_hash is the first 16 hex characters of SHA-256(token)", () => {
    const expected = createHash("sha256").update(TOKEN, "utf8").digest("hex").slice(0, 16);
    assert.equal(manifestTokenHash(TOKEN), expected);
  });

  test("manifest_version and issued_at are now; it expires in 30 days", async () => {
    const payload = await build({ entries: [] });
    assert.equal(payload.manifest_version, NOW);
    assert.equal(payload.issued_at, NOW);
    assert.equal(MANIFEST_TTL_MS, 30 * 24 * 60 * 60 * 1000);
    assert.equal(payload.expires_at, NOW + MANIFEST_TTL_MS);
    assert.equal(payload.token_hash, manifestTokenHash(TOKEN));
  });

  test("the keys come in the order the app's older readers expect", async () => {
    assert.deepEqual(Object.keys(await build()), ["manifest_version", "issued_at", "expires_at", "token_hash", "account", "hosts", "locations"]);
  });
});

describe("hosts", () => {
  test("lower-cased, deduplicated, malformed dropped, capped at 8, in order", () => {
    const raw = [
      "Main.example",
      "main.example",
      "not a host",
      `${"a".repeat(64)}.example`,
      "single-label",
      "https://scheme.example",
      "port.example:443",
      ...Array.from({ length: 9 }, (_, n) => `h${n}.example`),
    ];
    assert.deepEqual(validateManifestHosts(raw), ["main.example", ...Array.from({ length: 7 }, (_, n) => `h${n}.example`)]);
  });

  test("empty and non-string entries are dropped without throwing", () => {
    assert.deepEqual(validateManifestHosts(["", "  ", "a.b", null, undefined, 42]), ["a.b"]);
    assert.deepEqual(validateWithdrawnHosts(["", "  ", "a.b", null, undefined, 42]), ["a.b"]);
  });

  test("withdrawn names: at most sixteen, each once, and out of `hosts` whatever their spelling", async () => {
    const many = Array.from({ length: 30 }, (_, n) => `w${n}.example`);
    const out = validateWithdrawnHosts(["Gone.Example", "gone.example", ...many]);
    assert.equal(out.length, 16);
    assert.equal(out[0], "gone.example");

    const payload = await build({ hosts: ["Keep.example", "DROP.example"], withdrawn: ["drop.example"] });
    assert.deepEqual(payload.hosts, ["keep.example"]);
    assert.deepEqual(payload.withdrawn_hosts, ["drop.example"]);
    const keys = Object.keys(payload);
    assert.equal(keys[keys.indexOf("hosts") + 1], "withdrawn_hosts");
  });

  test("a document that withdraws nothing has no `withdrawn_hosts`", async () => {
    const before = JSON.stringify(await build());
    for (const withdrawn of [undefined, [], ["not a host", "single"]]) {
      assert.equal(JSON.stringify(await build({ withdrawn })), before);
    }
    assert.ok(!before.includes("withdrawn_hosts"));
  });
});

describe("manifestHostSettings", () => {
  const DEFAULTS = ["kovra-a.example", "kovra-b.example"];
  const env = (hosts, withdrawn) => ({
    ...(hosts === undefined ? {} : { WATAFAST_MANIFEST_HOSTS: hosts }),
    ...(withdrawn === undefined ? {} : { WATAFAST_MANIFEST_HOSTS_WITHDRAWN: withdrawn }),
    PATH: "/usr/bin",
  });

  test("nothing set: the defaults, nothing withdrawn", () => {
    for (const blank of [undefined, "", "   ", "\n"]) {
      assert.deepEqual(manifestHostSettings(env(blank, blank), DEFAULTS), { hosts: DEFAULTS, withdrawn: [], ignored: 0 });
    }
  });

  test("the setting is the list, in its order, split on commas, semicolons and blanks, lower-cased", () => {
    const out = manifestHostSettings(env("Spare.example, kovra-b.example;\nkovra-a.example."), DEFAULTS);
    assert.deepEqual(out.hosts, ["spare.example", "kovra-b.example", "kovra-a.example"]);
    assert.equal(out.ignored, 0);
  });

  test("what is not a host name is counted and never quoted; an address is not a name", () => {
    const out = manifestHostSettings(env("good.example, https://bad.example, 203.0.113.9, no_dot"), DEFAULTS);
    assert.deepEqual(out.hosts, ["good.example"]);
    assert.equal(out.ignored, 3);
    assert.ok(!JSON.stringify(out).includes("bad.example"));
    assert.ok(!JSON.stringify(out).includes("203.0.113.9"));
  });

  test("a value from which no name reads leaves the defaults standing", () => {
    const out = manifestHostSettings(env("https://only.example; 203.0.113.9"), DEFAULTS);
    assert.deepEqual(out.hosts, DEFAULTS);
    assert.equal(out.ignored, 2);
  });

  test("a withdrawn name leaves `hosts`, from the defaults or from the setting, and the cap counts what is left", () => {
    assert.deepEqual(manifestHostSettings(env(undefined, "kovra-b.example"), DEFAULTS).hosts, ["kovra-a.example"]);
    const nine = Array.from({ length: 9 }, (_, n) => `h${n}.example`);
    assert.deepEqual(manifestHostSettings(env(nine.join(","), "H0.example."), DEFAULTS).hosts, nine.slice(1));
  });

  test("the defaults are not changed by being used", () => {
    const defaults = [...DEFAULTS];
    manifestHostSettings(env(undefined, "kovra-a.example"), defaults);
    assert.deepEqual(defaults, DEFAULTS);
  });
});

describe("the signer from its variables", () => {
  const seed = Buffer.alloc(32, 0x05);
  const seedBase64 = seed.toString("base64");

  test("a 32-byte seed and a kid make a signer under that kid", () => {
    const read = manifestSignerFromEnv({ seedBase64, kid: " kw1 " });
    assert.equal(read.ok, true);
    assert.equal(read.signer.kid, "kw1");
  });

  test("each way of being wrong has its reason, and no reason carries the value", () => {
    const cases = [
      [{ seedBase64, kid: undefined }, /KID missing/],
      [{ seedBase64, kid: "   " }, /KID missing/],
      [{ seedBase64: undefined, kid: "kw1" }, /KEY missing/],
      [{ seedBase64: "", kid: "kw1" }, /KEY missing/],
      [{ seedBase64: Buffer.alloc(16, 0x05).toString("base64"), kid: "kw1" }, /not a valid 32-byte/],
      [{ seedBase64: Buffer.alloc(33, 0x05).toString("base64"), kid: "kw1" }, /not a valid 32-byte/],
      [{ seedBase64: "!!!not base64!!!", kid: "kw1" }, /not a valid 32-byte/],
    ];
    for (const [config, reason] of cases) {
      const read = manifestSignerFromEnv(config);
      assert.equal(read.ok, false, JSON.stringify(config));
      assert.match(read.reason, reason);
      if (config.seedBase64) assert.ok(!read.reason.includes(config.seedBase64));
    }
  });

  test("none of these throw", () => {
    assert.doesNotThrow(() => manifestSignerFromEnv({ seedBase64: "", kid: "" }));
    assert.doesNotThrow(() => signManifestPayload({ manifest_version: 1 }, { seedBase64: "%%%", kid: "kw1" }));
  });

  test("ed25519PrivateKeyFromSeed takes exactly 32 bytes", () => {
    assert.notEqual(ed25519PrivateKeyFromSeed(seed), null);
    assert.equal(ed25519PrivateKeyFromSeed(Buffer.alloc(31)), null);
    assert.equal(ed25519PrivateKeyFromSeed(Buffer.alloc(0)), null);
  });
});

describe("the signature", () => {
  test("a signed envelope verifies over the contract's prefix + payload, and one changed byte breaks it", async () => {
    const seed = Buffer.alloc(32, 0x01);
    const payload = await build({ entries: [visionEntry, hy2Entry], withdrawn: ["gone.example"] });
    const result = signManifestPayload(payload, { seedBase64: seed.toString("base64"), kid: "kw1" });
    assert.equal(result.ok, true);
    const { envelope } = result;
    assert.deepEqual(Object.keys(envelope), ["v", "kid", "payload", "sig"]);
    assert.equal(envelope.v, 1);
    assert.equal(envelope.kid, "kw1");
    assert.match(envelope.payload, /^[A-Za-z0-9_-]+$/, "base64url without padding");
    assert.match(envelope.sig, /^[A-Za-z0-9_-]+$/);

    const bytes = Buffer.from(envelope.payload, "base64url");
    assert.deepEqual(JSON.parse(bytes.toString("utf8")), payload);
    const sig = Buffer.from(envelope.sig, "base64url");
    assert.equal(sig.length, 64);
    const pub = publicKeyOf(seed);
    assert.equal(edVerify(null, Buffer.concat([PREFIX, bytes]), pub, sig), true);
    assert.equal(edVerify(null, bytes, pub, sig), false, "the prefix is part of the message");
    const tampered = Buffer.from(bytes);
    tampered[tampered.length - 2] ^= 0x01;
    assert.equal(edVerify(null, Buffer.concat([PREFIX, tampered]), pub, sig), false);
  });

  test('cross-check vector: seed of 0x07 bytes, payload {"manifest_version":1}', () => {
    const seed = Buffer.alloc(32, 0x07);
    const result = signManifestPayload({ manifest_version: 1 }, { seedBase64: seed.toString("base64"), kid: "kw1" });
    assert.equal(result.ok, true);
    const body = Buffer.from('{"manifest_version":1}', "utf8");
    const priv = createPrivateKey({ key: derFromSeed(seed), format: "der", type: "pkcs8" });
    assert.equal(result.envelope.sig, edSign(null, Buffer.concat([PREFIX, body]), priv).toString("base64url"));
    assert.equal(result.envelope.payload, body.toString("base64url"));
  });

  test("signManifestWith and signManifestPayload give the same envelope for the same key", () => {
    const seed = Buffer.alloc(32, 0x0a);
    const read = manifestSignerFromEnv({ seedBase64: seed.toString("base64"), kid: "kw1" });
    assert.equal(read.ok, true);
    const payload = { manifest_version: 2 };
    assert.deepEqual(signManifestWith(payload, read.signer), signManifestPayload(payload, { seedBase64: seed.toString("base64"), kid: "kw1" }));
  });
});

describe("the reserve", () => {
  const reserveNode = {
    id: "r1",
    protocol: "watafast",
    carrier: "h2",
    wire: 2,
    server: "site.example:443",
    addresses: ["203.0.113.5:443"],
    path: "/assets/stream",
    node_public_key: "a1".repeat(32),
    udp: false,
  };

  test("no reserve nodes: no `reserve` field at all", async () => {
    const before = JSON.stringify(await build());
    assert.equal(JSON.stringify(await build({ reserve: [] })), before);
    assert.ok(!before.includes("reserve"));
  });

  test("with them, the field is the last key and nothing before it changes", async () => {
    const before = JSON.stringify(await build());
    const payload = await build({ reserve: [reserveNode] });
    assert.equal(Object.keys(payload).at(-1), "reserve");
    assert.equal(JSON.stringify(payload), `${before.slice(0, -1)},"reserve":${JSON.stringify([reserveNode])}}`);
  });

  test("an account that is not active gets no reserve either", async () => {
    for (const status of ["no_funds", "expired"]) {
      const payload = await build({ account: { status, plan: "base", notice: "x" }, reserve: [reserveNode] });
      assert.equal("reserve" in payload, false, status);
    }
  });

  test("the field is inside what is signed", async () => {
    const seed = Buffer.alloc(32, 0x09);
    const signed = signManifestPayload(await build({ reserve: [reserveNode] }), { seedBase64: seed.toString("base64"), kid: "kw1" });
    assert.equal(signed.ok, true);
    const bytes = Buffer.from(signed.envelope.payload, "base64url");
    assert.deepEqual(JSON.parse(bytes.toString("utf8")).reserve, [reserveNode]);
    assert.equal(edVerify(null, Buffer.concat([PREFIX, bytes]), publicKeyOf(seed), Buffer.from(signed.envelope.sig, "base64url")), true);
  });
});
