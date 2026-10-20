// src/lib/watafast-credential.ts
//
// WataFast device credentials: the site's half of the protocol's "Identities
// and credentials" (watafast-core docs/SPEC.md §4). A credential is a signed
// statement that binds a device's own key to an account and its limits. Nodes
// of our own protocol hold no list of people: they take whoever presents a
// credential that verifies against an issuer key they know, inside its dates,
// for the very key the handshake has just authenticated.
//
// The byte layout is the protocol's and must match it exactly (the node's
// reader is `wf-proto/src/credential.rs`); tests/watafast-credential.test.mjs
// holds a credential signed by that code and requires this module to produce
// the same 160 bytes.
//
//   offset size field
//   0      1    version = 1
//   1      1    key_id
//   2      16   device_id
//   18     16   account_id            (opaque to nodes)
//   34     32   device_static         (X25519 public key)
//   66     1    plan                  (0 free, 1 pro; Kovra has no PRO: 0)
//   67     1    flags                 (reserved, 0)
//   68     4    rate_limit_kbps       (0 = unlimited)
//   72     8    quota_bytes           (0 = unlimited)
//   80     8    not_before            (unix seconds)
//   88     8    not_after             (unix seconds)
//   96     64   signature             Ed25519 over "wf1-credential\0" || bytes[0..96]
//
// Integers are big-endian.
//
// PURE ON PURPOSE, like lib/watafast-manifest.ts: node:crypto and nothing
// else, no redis, no next, no clock of its own. Who may have a credential is
// the route's decision (src/app/api/watafast/v1/[token]/credential/[key]/route.ts);
// this module only checks what it is handed and signs it. The issuer key is
// read by the route from the environment and passed in, so no other module of
// the site ever touches it.
//
// ── Kovra and ProxysVPN on the same nodes ───────────────
// Kovra's devices use the nodes ProxysVPN's use. This module is ProxysVPN's,
// byte for byte; what keeps the two services apart is the keys. Kovra signs
// with an issuer key of its own under a key id of its own (a node knows each
// issuer key by its id and takes either), and derives the ids with an id key
// of its own, so `tg_<id>` here and the same `tg_<id>` there are two
// different accounts to a node. Neither service can speak for the other's
// people.

import {
  createHmac,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  sign as edSign,
  type KeyObject,
} from "node:crypto";
import { ed25519PrivateKeyFromSeed } from "./watafast-manifest";

/** Size of a credential on the wire, signature included. */
export const CREDENTIAL_LEN = 160;
/** The format this module writes. */
export const CREDENTIAL_VERSION = 1;

const BODY_LEN = 96;
const ID_LEN = 16;
const KEY_LEN = 32;

/** Domain separation: an issuer signature is never a signature of anything else. */
const SIGNED_PREFIX = Buffer.from("wf1-credential\0", "latin1");

/**
 * How long a credential is good for: 72 hours, the long end of what the
 * protocol recommends (24 to 72).
 *
 * The reserve path is what a person is left with when nothing else connects,
 * and on such a day our own names may not answer either: a credential issued
 * the last time the app reached us has to still be good then. The other side
 * of it: nodes do not ask the site about a device, so a link that was removed
 * or an account that ran out keeps the reserve path until the credential it
 * already holds runs out. Three days is the bound on that.
 */
export const CREDENTIAL_TTL_S = 72 * 60 * 60;

/**
 * How far before the moment of issue a credential is already good, seconds. A
 * node's clock a little behind ours must not refuse a credential issued this
 * minute; nodes allow their own skew on top.
 */
export const CREDENTIAL_BACKDATE_S = 5 * 60;

/** `plan` of a credential: a policy input of the node. */
export type CredentialPlan = 0 | 1;

export interface CredentialFields {
  /** Which issuer key signs it, 0 to 255. */
  readonly keyId: number;
  /** 16 bytes: the device, stable across credentials. */
  readonly deviceId: Buffer;
  /** 16 bytes: the account, opaque to nodes. */
  readonly accountId: Buffer;
  /** 32 bytes: the device's X25519 public key. */
  readonly deviceStatic: Buffer;
  readonly plan: CredentialPlan;
  /** kbit/s, 0 for no cap; an unsigned 32-bit integer. */
  readonly rateLimitKbps: number;
  /** Bytes left at issue, 0 for no quota; an unsigned 64-bit integer. */
  readonly quotaBytes: bigint;
  /** Unix seconds. */
  readonly notBefore: number;
  /** Unix seconds. */
  readonly notAfter: number;
}

const U32_MAX = 0xffff_ffff;
const U64_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);

function isUnixSeconds(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * The 96 bytes that are signed, or null when a field does not fit its place.
 * Never throws: a field out of range must become the route's own refusal, not
 * a stack trace with a key in it.
 */
export function encodeCredentialBody(fields: CredentialFields): Buffer | null {
  if (!Number.isInteger(fields.keyId) || fields.keyId < 0 || fields.keyId > 0xff) return null;
  if (fields.deviceId.length !== ID_LEN || fields.accountId.length !== ID_LEN) return null;
  if (fields.deviceStatic.length !== KEY_LEN) return null;
  if (fields.plan !== 0 && fields.plan !== 1) return null;
  if (!Number.isInteger(fields.rateLimitKbps) || fields.rateLimitKbps < 0 || fields.rateLimitKbps > U32_MAX) return null;
  if (typeof fields.quotaBytes !== "bigint" || fields.quotaBytes < BigInt(0) || fields.quotaBytes > U64_MAX) return null;
  if (!isUnixSeconds(fields.notBefore) || !isUnixSeconds(fields.notAfter)) return null;
  // The node's own signer refuses an empty interval; so does this one.
  if (fields.notBefore > fields.notAfter) return null;

  const body = Buffer.alloc(BODY_LEN);
  body.writeUInt8(CREDENTIAL_VERSION, 0);
  body.writeUInt8(fields.keyId, 1);
  fields.deviceId.copy(body, 2);
  fields.accountId.copy(body, 18);
  fields.deviceStatic.copy(body, 34);
  body.writeUInt8(fields.plan, 66);
  body.writeUInt8(0, 67);
  body.writeUInt32BE(fields.rateLimitKbps, 68);
  body.writeBigUInt64BE(fields.quotaBytes, 72);
  body.writeBigUInt64BE(BigInt(fields.notBefore), 80);
  body.writeBigUInt64BE(BigInt(fields.notAfter), 88);
  return body;
}

// ── The issuer key ──────────────────────────────────────

export interface IssuerKey {
  readonly keyId: number;
  readonly key: KeyObject;
}

export type IssuerKeyResult =
  | { readonly ok: true; readonly issuer: IssuerKey }
  /** `reason` is for our own log only: it names the variable and never its value. */
  | { readonly ok: false; readonly reason: string };

const ISSUER_KEY_RE = /^(\d{1,3}):([0-9a-fA-F]{64})$/;

/**
 * The issuer key out of `WATAFAST_ISSUER_KEY`: `<key id>:<64 hex characters of
 * the 32-byte Ed25519 seed>`. The same shape the protocol's own key tool
 * prints the PUBLIC half in (`issuer=ID:HEX`, what a node is given), so the
 * two halves of one key are written the same way and carry the same id.
 *
 * Separate from the manifest's signing key on purpose: one signs what the app
 * is told, the other signs who a node lets in, and neither may stand in for
 * the other.
 */
export function issuerKeyFromEnv(value: string | undefined): IssuerKeyResult {
  if (typeof value !== "string" || value.trim() === "") return { ok: false, reason: "WATAFAST_ISSUER_KEY missing" };
  const match = ISSUER_KEY_RE.exec(value.trim());
  if (!match) return { ok: false, reason: "WATAFAST_ISSUER_KEY is not <key id>:<64 hex characters>" };
  const keyId = Number(match[1]);
  if (keyId > 0xff) return { ok: false, reason: "WATAFAST_ISSUER_KEY names a key id above 255" };
  const key = ed25519PrivateKeyFromSeed(Buffer.from(match[2], "hex"));
  if (!key) return { ok: false, reason: "WATAFAST_ISSUER_KEY is not a valid Ed25519 seed" };
  return { ok: true, issuer: { keyId, key } };
}

/**
 * Sign `fields` into the 160 bytes a device presents, or null when a field
 * does not fit or the credential names another key than the one signing it.
 */
export function signCredential(fields: CredentialFields, issuer: IssuerKey): Buffer | null {
  if (fields.keyId !== issuer.keyId) return null;
  const body = encodeCredentialBody(fields);
  if (!body) return null;
  let signature: Buffer;
  try {
    // `null`: pure Ed25519 (RFC 8032), what the node verifies strictly.
    signature = edSign(null, Buffer.concat([SIGNED_PREFIX, body]), issuer.key);
  } catch {
    return null;
  }
  if (signature.length !== CREDENTIAL_LEN - BODY_LEN) return null;
  return Buffer.concat([body, signature]);
}

// ── The device's key ────────────────────────────────────

const DEVICE_KEY_RE = /^[0-9a-fA-F]{64}$/;

/** SubjectPublicKeyInfo header of a raw X25519 public key (RFC 8410 `id-X25519`). */
const X25519_SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

/**
 * A key pair of this process, used for one thing: asking whether a public key
 * a stranger sent is a point an exchange can be made with. Its private half
 * protects nothing and is never sent, stored or logged.
 */
let probeKey: KeyObject | null = null;

function contributes(devicePublic: Buffer): boolean {
  try {
    probeKey ??= generateKeyPairSync("x25519").privateKey;
    const publicKey = createPublicKey({
      key: Buffer.concat([X25519_SPKI_PREFIX, devicePublic]),
      format: "der",
      type: "spki",
    });
    // The library refuses an exchange whose result is all zeros, which is
    // what every point of small order gives whatever the private key.
    return diffieHellman({ privateKey: probeKey, publicKey }).length === KEY_LEN;
  } catch {
    return false;
  }
}

/**
 * The device's public key out of a request: 64 hex characters, as the
 * protocol's own files write a key. Null for anything else, and for a point
 * of small order: a credential for such a "key" could be used by whoever
 * holds the credential, with no private key at all, and binding a credential
 * to a key the device alone holds is the whole point of it.
 */
export function parseDevicePublicKey(value: unknown): Buffer | null {
  if (typeof value !== "string" || !DEVICE_KEY_RE.test(value)) return null;
  const key = Buffer.from(value, "hex");
  return contributes(key) ? key : null;
}

// ── Who a credential names ──────────────────────────────

export type IdKeyResult =
  | { readonly ok: true; readonly idKey: Buffer }
  | { readonly ok: false; readonly reason: string };

/**
 * The key the two ids of a credential are derived with, out of
 * `WATAFAST_ID_KEY` (64 hex characters).
 *
 * A key of its own and not the issuer's seed: the ids must stay what they are
 * when the issuer key is replaced, or a device would be a new one to every
 * node, and to whatever counts its traffic, on the day of a rotation.
 */
export function idKeyFromEnv(value: string | undefined): IdKeyResult {
  if (typeof value !== "string" || value.trim() === "") return { ok: false, reason: "WATAFAST_ID_KEY missing" };
  if (!DEVICE_KEY_RE.test(value.trim())) return { ok: false, reason: "WATAFAST_ID_KEY is not 64 hex characters" };
  return { ok: true, idKey: Buffer.from(value.trim(), "hex") };
}

export interface CredentialIds {
  readonly deviceId: Buffer;
  readonly accountId: Buffer;
}

function derivedId(idKey: Buffer, label: string, parts: readonly string[]): Buffer {
  const mac = createHmac("sha256", idKey);
  mac.update(label, "utf8");
  for (const part of parts) {
    // A length before each part: two different pairs never make the same bytes.
    const bytes = Buffer.from(part, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length, 0);
    mac.update(length);
    mac.update(bytes);
  }
  return mac.digest().subarray(0, ID_LEN);
}

/**
 * The ids a credential carries for one device of one account.
 *
 * Keyed, and not a plain hash: an account's id here is `tg_<telegram id>` or
 * `em_<email>`, few enough to try them all, and a credential is seen by every
 * node the device connects to. With the key, what a node holds says nothing
 * about who the person is; without it nobody can make the same id.
 *
 * One link is one device (lib/sub-access.ts), and so is one `deviceId`: it
 * is derived from the device the link names, not from the key the request
 * brought, so a link that asks for credentials for several keys gets the same
 * id every time and a node holds them to one device's worth of sessions.
 */
export function credentialIds(idKey: Buffer, userId: string, deviceUuid: string): CredentialIds {
  return {
    deviceId: derivedId(idKey, "wf1-device-id", [userId, deviceUuid]),
    accountId: derivedId(idKey, "wf1-account-id", [userId]),
  };
}

// ── A speed cap, from a setting ─────────────────────────

/**
 * `WATAFAST_RESERVE_RATE_KBPS`: the speed cap written into every credential,
 * kbit/s. Unset, blank or 0 is no cap. A value that is not a whole number in
 * range is a mistake in the variable, and a mistake must not quietly become
 * "no cap": it reads as null and the route issues nothing until it is fixed.
 */
export function rateLimitFromEnv(value: string | undefined): number | null {
  if (typeof value !== "string" || value.trim() === "") return 0;
  if (!/^\d{1,10}$/.test(value.trim())) return null;
  const kbps = Number(value.trim());
  return kbps <= U32_MAX ? kbps : null;
}

// ── Issue ────────────────────────────────────────────────

export interface IssueCredentialInput {
  readonly issuer: IssuerKey;
  readonly idKey: Buffer;
  readonly userId: string;
  readonly deviceUuid: string;
  /** Already checked (`parseDevicePublicKey`). */
  readonly devicePublicKey: Buffer;
  readonly pro: boolean;
  readonly rateLimitKbps: number;
  /** Unix ms, as `Date.now()` gives it. */
  readonly now: number;
}

export interface IssuedCredential {
  /** The 160 bytes. */
  readonly bytes: Buffer;
  /** Unix seconds. */
  readonly notBefore: number;
  /** Unix seconds. */
  readonly notAfter: number;
  /** The device id, for the log line of the issue: never the whole of it. */
  readonly deviceId: Buffer;
}

/** A credential for one device, or null when something handed in does not fit. */
export function issueCredential(input: IssueCredentialInput): IssuedCredential | null {
  if (!Number.isFinite(input.now) || input.now < 0) return null;
  const nowS = Math.floor(input.now / 1000);
  const notBefore = Math.max(0, nowS - CREDENTIAL_BACKDATE_S);
  const notAfter = nowS + CREDENTIAL_TTL_S;
  const ids = credentialIds(input.idKey, input.userId, input.deviceUuid);
  const bytes = signCredential(
    {
      keyId: input.issuer.keyId,
      deviceId: ids.deviceId,
      accountId: ids.accountId,
      deviceStatic: input.devicePublicKey,
      plan: input.pro ? 1 : 0,
      rateLimitKbps: input.rateLimitKbps,
      // No quota yet: nodes do not report usage to the site, so there is no
      // figure to write here that would be true.
      quotaBytes: BigInt(0),
      notBefore,
      notAfter,
    },
    input.issuer,
  );
  if (!bytes) return null;
  return { bytes, notBefore, notAfter, deviceId: ids.deviceId };
}
