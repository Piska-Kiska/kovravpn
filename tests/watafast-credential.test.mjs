// tests/watafast-credential.test.mjs
//
// WataFast device credentials (src/lib/watafast-credential.ts): the byte
// layout against a credential signed by the protocol's own code, the issuer
// key and the id key out of their variables, the check of a device's public
// key, the two derived ids and the dates of an issued credential.
//
// Every seed, key and id below is synthetic: counting bytes, the public test
// keys of RFC 7748, and ids that spell out their own offsets. Nothing here is
// a key of ours.
//
// No Redis: the module is pure (node:crypto only).
//
// Run: npm test

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, verify as edVerify } from "node:crypto";

import "./support/load-ts.mjs";

const {
  CREDENTIAL_LEN,
  CREDENTIAL_TTL_S,
  CREDENTIAL_BACKDATE_S,
  encodeCredentialBody,
  signCredential,
  issuerKeyFromEnv,
  idKeyFromEnv,
  parseDevicePublicKey,
  credentialIds,
  rateLimitFromEnv,
  issueCredential,
} = await import("../src/lib/watafast-credential.ts");

// ── A credential signed by the protocol's own tool ──────────────────────────
//
// Made once with `wf-keys credential` of watafast-core (crates/wf-keys, which
// signs through wf-proto/src/credential.rs, the code a node verifies with):
//
//   --issuer <a file holding SEED_HEX> --key-id 7 --days 3 --plan 1
//   --rate-kbps 2048 --quota-bytes 123456789012
//   --device-public <DEVICE_PUBLIC> --device-id <DEVICE_ID> --account-id <ACCOUNT_ID>
//
// Ed25519 signatures are deterministic, so signing the same fields with the
// same seed here must give these 160 bytes exactly. If it does not, the two
// halves of the format have drifted and no node would accept what the site
// issues.
const SEED_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
/** Alice's public key of RFC 7748 §6.1. */
const DEVICE_PUBLIC = "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a";
/** Bob's public key of RFC 7748 §6.1. */
const OTHER_PUBLIC = "de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f";
const DEVICE_ID = "000102030405060708090a0b0c0d0e0f";
const ACCOUNT_ID = "f0e0d0c0b0a090807060504030201000";
const REFERENCE_HEX =
  "0107000102030405060708090a0b0c0d0e0ff0e0d0c0b0a090807060504030201000" +
  "8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a" +
  "0100000008000000001cbe991a14000000006acbc5ef000000006acfbb9b" +
  "4abaf7c61ea1f320b4cfd9c58d09c49a18591aa0bd8e895fa370ffb1fbc4e6a0" +
  "06475e0cc6332592e57467049ddc20bc1e724e8209d59f94e8c3096b9b7df700";

const REFERENCE_FIELDS = Object.freeze({
  keyId: 7,
  deviceId: Buffer.from(DEVICE_ID, "hex"),
  accountId: Buffer.from(ACCOUNT_ID, "hex"),
  deviceStatic: Buffer.from(DEVICE_PUBLIC, "hex"),
  plan: 1,
  rateLimitKbps: 2048,
  quotaBytes: 123456789012n,
  notBefore: 0x6acbc5ef,
  notAfter: 0x6acfbb9b,
});

const issuerOf = (keyId = 7, seedHex = SEED_HEX) => {
  const read = issuerKeyFromEnv(`${keyId}:${seedHex}`);
  assert.equal(read.ok, true);
  return read.issuer;
};

/** The public half of a seed, the way a node would hold it. */
function publicKeyOf(seedHex) {
  const priv = createPrivateKey({
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(seedHex, "hex")]),
    format: "der",
    type: "pkcs8",
  });
  return createPublicKey(priv);
}

/** What a node checks first: the signature over the domain prefix and the 96 bytes. */
function signatureHolds(credential, seedHex = SEED_HEX) {
  const message = Buffer.concat([Buffer.from("wf1-credential\0", "latin1"), credential.subarray(0, 96)]);
  return edVerify(null, message, publicKeyOf(seedHex), credential.subarray(96));
}

describe("the byte layout", () => {
  test("the same fields under the same seed give the 160 bytes the protocol's own signer gave", () => {
    const bytes = signCredential(REFERENCE_FIELDS, issuerOf());
    assert.ok(bytes);
    assert.equal(bytes.length, CREDENTIAL_LEN);
    assert.equal(bytes.toString("hex"), REFERENCE_HEX);
  });

  test("every field sits at the offset the specification gives it", () => {
    const body = encodeCredentialBody(REFERENCE_FIELDS);
    assert.ok(body);
    assert.equal(body.length, 96);
    assert.equal(body[0], 1, "version");
    assert.equal(body[1], 7, "key_id");
    assert.equal(body.subarray(2, 18).toString("hex"), DEVICE_ID);
    assert.equal(body.subarray(18, 34).toString("hex"), ACCOUNT_ID);
    assert.equal(body.subarray(34, 66).toString("hex"), DEVICE_PUBLIC);
    assert.equal(body[66], 1, "plan");
    assert.equal(body[67], 0, "flags");
    assert.equal(body.readUInt32BE(68), 2048);
    assert.equal(body.readBigUInt64BE(72), 123456789012n);
    assert.equal(body.readBigUInt64BE(80), BigInt(REFERENCE_FIELDS.notBefore));
    assert.equal(body.readBigUInt64BE(88), BigInt(REFERENCE_FIELDS.notAfter));
  });

  test("the signature is over the domain prefix and the body, and one changed bit breaks it", () => {
    const bytes = signCredential(REFERENCE_FIELDS, issuerOf());
    assert.equal(signatureHolds(bytes), true);
    for (const offset of [0, 1, 2, 18, 34, 66, 67, 68, 72, 80, 88, 95]) {
      const changed = Buffer.from(bytes);
      changed[offset] ^= 0x01;
      assert.equal(signatureHolds(changed), false, `a change at offset ${offset} went unnoticed`);
    }
    assert.equal(signatureHolds(bytes, "ff".repeat(32)), false, "another issuer's key verified it");
  });

  test("the largest values that fit are written, not wrapped", () => {
    const body = encodeCredentialBody({
      ...REFERENCE_FIELDS,
      keyId: 255,
      rateLimitKbps: 0xffffffff,
      quotaBytes: 0xffffffffffffffffn,
      notBefore: 0,
      notAfter: Number.MAX_SAFE_INTEGER,
    });
    assert.ok(body);
    assert.equal(body[1], 255);
    assert.equal(body.readUInt32BE(68), 0xffffffff);
    assert.equal(body.readBigUInt64BE(72), 0xffffffffffffffffn);
    assert.equal(body.readBigUInt64BE(88), BigInt(Number.MAX_SAFE_INTEGER));
  });

  test("a field that does not fit its place is refused, never truncated", () => {
    const bad = [
      ["key id above a byte", { keyId: 256 }],
      ["a negative key id", { keyId: -1 }],
      ["a fractional key id", { keyId: 1.5 }],
      ["a short device id", { deviceId: Buffer.alloc(15) }],
      ["a long account id", { accountId: Buffer.alloc(17) }],
      ["a short device key", { deviceStatic: Buffer.alloc(31) }],
      ["an unknown plan", { plan: 2 }],
      ["a rate above 32 bits", { rateLimitKbps: 0x1_0000_0000 }],
      ["a negative rate", { rateLimitKbps: -1 }],
      ["a fractional rate", { rateLimitKbps: 0.5 }],
      ["a quota above 64 bits", { quotaBytes: 1n << 64n }],
      ["a negative quota", { quotaBytes: -1n }],
      ["a quota that is not a bigint", { quotaBytes: 5 }],
      ["a fractional start", { notBefore: 1.5 }],
      ["a negative start", { notBefore: -1 }],
      ["an end that is not a number", { notAfter: Number.NaN }],
      ["an end before its start", { notBefore: 200, notAfter: 100 }],
    ];
    for (const [what, change] of bad) {
      const fields = { ...REFERENCE_FIELDS, ...change };
      assert.equal(encodeCredentialBody(fields), null, what);
      assert.equal(signCredential(fields, issuerOf()), null, what);
    }
  });

  test("a credential is not signed with a key of another id than it names", () => {
    assert.equal(signCredential(REFERENCE_FIELDS, issuerOf(8)), null);
    assert.ok(signCredential({ ...REFERENCE_FIELDS, keyId: 8 }, issuerOf(8)));
  });
});

describe("the issuer key, out of WATAFAST_ISSUER_KEY", () => {
  test("<key id>:<64 hex characters> is read, in either case and with blank space around", () => {
    for (const value of [`7:${SEED_HEX}`, `  7:${SEED_HEX.toUpperCase()}\n`, `007:${SEED_HEX}`]) {
      const read = issuerKeyFromEnv(value);
      assert.equal(read.ok, true, value.length);
      assert.equal(read.issuer.keyId, 7);
      assert.equal(signCredential(REFERENCE_FIELDS, read.issuer).toString("hex"), REFERENCE_HEX);
    }
    assert.equal(issuerKeyFromEnv(`0:${SEED_HEX}`).issuer.keyId, 0);
    assert.equal(issuerKeyFromEnv(`255:${SEED_HEX}`).issuer.keyId, 255);
  });

  test("anything else is a refusal that names the variable and never its value", () => {
    const bad = [
      undefined,
      "",
      "   ",
      SEED_HEX,
      `:${SEED_HEX}`,
      `7:${SEED_HEX.slice(2)}`,
      `7:${SEED_HEX}00`,
      `256:${SEED_HEX}`,
      `-1:${SEED_HEX}`,
      `7:${"zz".repeat(32)}`,
      `7:${Buffer.from(SEED_HEX, "hex").toString("base64")}`,
      `7 : ${SEED_HEX}`,
    ];
    for (const value of bad) {
      const read = issuerKeyFromEnv(value);
      assert.equal(read.ok, false, String(value).length);
      assert.match(read.reason, /^WATAFAST_ISSUER_KEY /);
      assert.ok(!read.reason.includes(SEED_HEX), "the reason quotes the seed");
      assert.ok(!read.reason.includes(SEED_HEX.slice(2, 20)), "the reason quotes a part of the seed");
    }
  });
});

describe("the device's public key", () => {
  test("64 hex characters of a real point are taken, in either case", () => {
    assert.equal(parseDevicePublicKey(DEVICE_PUBLIC)?.toString("hex"), DEVICE_PUBLIC);
    assert.equal(parseDevicePublicKey(DEVICE_PUBLIC.toUpperCase())?.toString("hex"), DEVICE_PUBLIC);
    assert.equal(parseDevicePublicKey(OTHER_PUBLIC)?.toString("hex"), OTHER_PUBLIC);
  });

  test("anything that is not exactly that is refused", () => {
    const bad = [
      undefined,
      null,
      42,
      {},
      [DEVICE_PUBLIC],
      "",
      DEVICE_PUBLIC.slice(2),
      `${DEVICE_PUBLIC}00`,
      ` ${DEVICE_PUBLIC}`,
      `${DEVICE_PUBLIC}\n`,
      `0x${DEVICE_PUBLIC.slice(2)}`,
      DEVICE_PUBLIC.replace("8", "g"),
      Buffer.from(DEVICE_PUBLIC, "hex").toString("base64"),
    ];
    for (const value of bad) assert.equal(parseDevicePublicKey(value), null, JSON.stringify(value));
  });

  test("a point of small order is refused: a credential for it would need no private key", () => {
    // The points of order 1, 2, 4 and 8 on Curve25519 and its twist, and the
    // same values written unreduced (RFC 7748 §6.1 takes them modulo p).
    const smallOrder = [
      "0000000000000000000000000000000000000000000000000000000000000000",
      "0100000000000000000000000000000000000000000000000000000000000000",
      "e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800",
      "5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157",
      "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
      "edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
      "eeffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
    ];
    for (const point of smallOrder) assert.equal(parseDevicePublicKey(point), null, point);
  });
});

describe("the ids a credential names a device and an account by", () => {
  const KEY_A = Buffer.alloc(32, 0xa1);
  const KEY_B = Buffer.alloc(32, 0xb2);
  const USER = "tg_100200300";
  const UUID_1 = "11111111-1111-4111-8111-111111111111";
  const UUID_2 = "22222222-2222-4222-8222-222222222222";

  test("the key is read from 64 hex characters and from nothing else", () => {
    assert.deepEqual(idKeyFromEnv("a1".repeat(32)), { ok: true, idKey: KEY_A });
    assert.deepEqual(idKeyFromEnv(` ${"A1".repeat(32)}\n`), { ok: true, idKey: KEY_A });
    for (const value of [undefined, "", "a1".repeat(31), "a1".repeat(33), "zz".repeat(32)]) {
      const read = idKeyFromEnv(value);
      assert.equal(read.ok, false);
      assert.match(read.reason, /^WATAFAST_ID_KEY /);
    }
  });

  test("sixteen bytes each, the same every time for the same device", () => {
    const first = credentialIds(KEY_A, USER, UUID_1);
    const again = credentialIds(KEY_A, USER, UUID_1);
    assert.equal(first.deviceId.length, 16);
    assert.equal(first.accountId.length, 16);
    assert.deepEqual(first, again);
  });

  test("two devices of one account share the account id and nothing else", () => {
    const one = credentialIds(KEY_A, USER, UUID_1);
    const two = credentialIds(KEY_A, USER, UUID_2);
    assert.deepEqual(one.accountId, two.accountId);
    assert.notDeepEqual(one.deviceId, two.deviceId);
    assert.notDeepEqual(one.deviceId, one.accountId);
  });

  test("another account, or another key, gives ids that share nothing", () => {
    const base = credentialIds(KEY_A, USER, UUID_1);
    const otherUser = credentialIds(KEY_A, "tg_100200301", UUID_1);
    const otherKey = credentialIds(KEY_B, USER, UUID_1);
    for (const other of [otherUser, otherKey]) {
      assert.notDeepEqual(other.deviceId, base.deviceId);
      assert.notDeepEqual(other.accountId, base.accountId);
    }
  });

  test("where one part ends and the next begins is part of what is hashed", () => {
    assert.notDeepEqual(credentialIds(KEY_A, "ab", "c").deviceId, credentialIds(KEY_A, "a", "bc").deviceId);
  });

  test("an id is not a plain hash of the account: nobody without the key can make it", () => {
    const { accountId } = credentialIds(KEY_A, USER, UUID_1);
    for (const guess of [USER, `wf1-account-id${USER}`, `wf1-account-id\0${USER}`]) {
      const plain = createHash("sha256").update(guess, "utf8").digest().subarray(0, 16);
      assert.notDeepEqual(accountId, plain, guess);
    }
  });
});

describe("the speed cap, out of WATAFAST_RESERVE_RATE_KBPS", () => {
  test("unset, blank and 0 are no cap; a whole number in range is the cap", () => {
    assert.equal(rateLimitFromEnv(undefined), 0);
    assert.equal(rateLimitFromEnv(""), 0);
    assert.equal(rateLimitFromEnv("  "), 0);
    assert.equal(rateLimitFromEnv("0"), 0);
    assert.equal(rateLimitFromEnv(" 20000 "), 20000);
    assert.equal(rateLimitFromEnv("4294967295"), 0xffffffff);
  });

  test("a value that is not one never reads as 'no cap'", () => {
    for (const value of ["4294967296", "-1", "1.5", "20 000", "20mbit", "0x10", "1e3"]) {
      assert.equal(rateLimitFromEnv(value), null, value);
    }
  });
});

describe("an issued credential", () => {
  const NOW_MS = Date.UTC(2026, 9, 12, 9, 30, 15, 250);
  const NOW_S = Math.floor(NOW_MS / 1000);
  const ID_KEY = Buffer.alloc(32, 0xc3);
  const input = (change = {}) => ({
    issuer: issuerOf(),
    idKey: ID_KEY,
    userId: "tg_100200300",
    deviceUuid: "11111111-1111-4111-8111-111111111111",
    devicePublicKey: Buffer.from(DEVICE_PUBLIC, "hex"),
    pro: false,
    rateLimitKbps: 0,
    now: NOW_MS,
    ...change,
  });

  test("is good from five minutes ago for three days, verifies, and names the key it was asked for", () => {
    const issued = issueCredential(input());
    assert.ok(issued);
    assert.equal(CREDENTIAL_TTL_S, 72 * 60 * 60);
    assert.equal(CREDENTIAL_BACKDATE_S, 300);
    assert.equal(issued.notBefore, NOW_S - 300);
    assert.equal(issued.notAfter, NOW_S + 72 * 60 * 60);
    assert.equal(issued.bytes.length, CREDENTIAL_LEN);
    assert.equal(signatureHolds(issued.bytes), true);

    const body = issued.bytes.subarray(0, 96);
    assert.equal(body[0], 1);
    assert.equal(body[1], 7);
    assert.deepEqual(body.subarray(2, 18), issued.deviceId);
    assert.deepEqual(body.subarray(2, 18), credentialIds(ID_KEY, "tg_100200300", "11111111-1111-4111-8111-111111111111").deviceId);
    assert.equal(body.subarray(34, 66).toString("hex"), DEVICE_PUBLIC);
    assert.equal(body[66], 0, "a base device");
    assert.equal(body[67], 0);
    assert.equal(body.readUInt32BE(68), 0, "no cap");
    assert.equal(body.readBigUInt64BE(72), 0n, "no quota");
    assert.equal(Number(body.readBigUInt64BE(80)), issued.notBefore);
    assert.equal(Number(body.readBigUInt64BE(88)), issued.notAfter);
  });

  test("carries the plan and the cap it was given", () => {
    const body = issueCredential(input({ pro: true, rateLimitKbps: 20000 })).bytes;
    assert.equal(body[66], 1);
    assert.equal(body.readUInt32BE(68), 20000);
  });

  test("one link is one device to a node, whichever key it asks with", () => {
    const first = issueCredential(input());
    const second = issueCredential(input({ devicePublicKey: Buffer.from(OTHER_PUBLIC, "hex") }));
    assert.deepEqual(first.deviceId, second.deviceId);
    assert.notDeepEqual(first.bytes.subarray(34, 66), second.bytes.subarray(34, 66));
  });

  test("nothing is issued for a moment that is not one, or a key of the wrong size", () => {
    assert.equal(issueCredential(input({ now: Number.NaN })), null);
    assert.equal(issueCredential(input({ now: -1 })), null);
    assert.equal(issueCredential(input({ devicePublicKey: Buffer.alloc(31) })), null);
    assert.equal(issueCredential(input({ rateLimitKbps: -5 })), null);
  });
});
