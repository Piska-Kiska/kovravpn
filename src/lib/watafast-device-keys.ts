// src/lib/watafast-device-keys.ts
//
// How many different device keys one link is given credentials for.
//
// A credential (lib/watafast-credential.ts) is a statement about one public
// key, and the route that issues it takes whatever key the request names. The
// device binding ties a link to a device id, not to a key: the device a link
// is bound to could ask for a credential for one key after another, thirty in
// ten minutes, each good for three days, and hand them to whoever it liked.
// A node counts sessions per device and not keys, so the bound belongs here:
// the protocol leaves device limits to the service (watafast-core SPEC §4).
//
// A device makes its key once and keeps it. A new one appears when the app is
// installed again (a phone takes the key away with the app) or the link moves
// to another device, so a link has one key, now and then two. The bound is
// wider than that on purpose: someone who cannot connect installs the app
// again, and again, in one evening, and that is the evening the reserve is
// for. `MAX_KEYS_PER_LINK` different keys are remembered for as long as a
// credential issued for them can live; one more is told to come back later.
// A key that keeps being asked for stays; one that is not asked for any more
// is forgotten `KEY_MEMORY_S` after its last credential and makes room.
//
// Kept as a sorted set per link, the member a key and the score the time of
// its last credential. The count is read and the key written in ONE script,
// and that is the point of it: read first and written after, thirty requests
// sent at the same moment all read "no keys yet" and all were let in (the
// review of 12.10.2026 showed it against this very code). A script runs with
// nothing in between.
//
// The bound is the link's, whichever device holds it: moving a link to
// another device is one more key, and a link that has been through as many
// keys as it may in three days waits for the oldest to be forgotten.
// `DEL wfk:<token>` lets it in at once.
//
// PURE OF NEXT: the store is passed in, so tests run it against their own.

/** Different keys one link may hold credentials for at a time. */
export const MAX_KEYS_PER_LINK = 5;

/**
 * How long a key is remembered after its last credential: a little longer
 * than the credential lives (72 hours and the clock allowance), so a key is
 * never forgotten while a credential for it still opens a node.
 */
export const KEY_MEMORY_S = 80 * 60 * 60;

/** What the ledger needs of Redis: one script (the Upstash client runs it). */
export interface DeviceKeyStore {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export type KeyAdmission =
  /** A key this link already holds a credential for. */
  | "known"
  /** One more key, and there was room for it. */
  | "new"
  /** The link holds as many keys as it may: nothing was written. */
  | "full";

/**
 * KEYS[1] the link's ledger. ARGV: the key's member, now (ms), the moment up
 * to which a key is forgotten (ms), how long the ledger is kept (ms), how many
 * keys a link may hold. Answers 0 full, 1 known, 2 new.
 *
 * Every number comes in as text and goes to Redis as that text: nothing here
 * depends on how a script prints a large number. The first line is what the
 * in-memory stores of the tests know the script by; they run its model
 * (tests/support/device-key-admit-model.mjs), and
 * tests/watafast-device-keys.test.mjs runs this text itself against the model.
 */
export const ADMIT_DEVICE_KEY_SCRIPT = `-- watafast: admit a device key v1
redis.call("ZREMRANGEBYSCORE", KEYS[1], "0", ARGV[3])
local known = redis.call("ZSCORE", KEYS[1], ARGV[1])
if not known and redis.call("ZCARD", KEYS[1]) >= tonumber(ARGV[5]) then
  return 0
end
redis.call("ZADD", KEYS[1], ARGV[2], ARGV[1])
redis.call("PEXPIRE", KEYS[1], ARGV[4])
if known then
  return 1
end
return 2`;

/** Deleted with the device (lib/accounts.ts removeProfile): the ledger goes with the link it belongs to. */
const ledgerKey = (token: string): string => `wfk:${token}`;

/**
 * The member a key is kept under. The letter in front keeps the client from
 * reading a key made of digits alone back as a number.
 */
const memberOf = (devicePublicKeyHex: string): string => `k${devicePublicKeyHex.toLowerCase()}`;

const DEVICE_KEY_HEX_RE = /^[0-9a-fA-F]{64}$/;

/**
 * No request is older than this (September 2020, in milliseconds). A time in
 * seconds is far below it: written as a score it would make every key look
 * long forgotten, or never to be forgotten.
 */
const EARLIEST_NOW_MS = 1_600_000_000_000;

/**
 * Asks whether `token` may be given a credential for this key, and writes the
 * key down when it may, in one step. Throws what the store throws, and on an
 * argument or an answer that does not read: the caller issues nothing while
 * the ledger cannot count.
 */
export async function admitDeviceKey(
  store: DeviceKeyStore,
  token: string,
  devicePublicKeyHex: string,
  nowMs: number,
): Promise<KeyAdmission> {
  if (token === "" || !DEVICE_KEY_HEX_RE.test(devicePublicKeyHex) || !Number.isSafeInteger(nowMs) || nowMs < EARLIEST_NOW_MS) {
    throw new Error("the ledger of device keys was asked about something that is not a link, a key and a time");
  }
  const memoryMs = KEY_MEMORY_S * 1000;

  const reply = await store.eval(
    ADMIT_DEVICE_KEY_SCRIPT,
    [ledgerKey(token)],
    [memberOf(devicePublicKeyHex), String(nowMs), String(nowMs - memoryMs), String(memoryMs), String(MAX_KEYS_PER_LINK)],
  );

  // A number, or the same number as text: never compared as it came.
  const answer = typeof reply === "number" ? reply : typeof reply === "string" && reply !== "" ? Number(reply) : NaN;
  if (answer === 0) return "full";
  if (answer === 1) return "known";
  if (answer === 2) return "new";
  throw new Error("the ledger of device keys gave an answer that does not read");
}
