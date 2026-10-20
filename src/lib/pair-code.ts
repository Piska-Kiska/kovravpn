// src/lib/pair-code.ts
//
// "Code for the app" (contract pair-code v1.1): a short code the cabinet
// shows, typed into the Kovra app on its sign-in screen. The app trades it for
// the device's subscription link.
//
// Ported from the ProxysVPN site (the app is one codebase for both brands and
// speaks the same contract); only the hosts differ: the Kovra app's ladder is
// kovravpn.com alone (src-tauri/src/brand.rs `KOVRA` in the app).
//
//   ISSUE   (authenticated)  the subscription link of one of the person's own
//                            devices, derived on the server, is stored under
//                            `paircode:<CODE>` for 10 minutes;
//   REDEEM  (public)         POST /api/pair/code {"code", "requestId"?} takes
//                            the code back with GETDEL inside one Lua script
//                            (PAIR_CODE_REDEEM_SCRIPT): one use, and of two
//                            parallel redeems exactly one gets the link.
//
// The code: 8 characters from 31 (no 0 1 I L O, nothing to misread), drawn
// with crypto.randomInt, shown as XXXX-XXXX. 31^8 ≈ 8.5e11 codes; with at most
// a few thousand alive at once and 60 guesses a day per address, guessing one
// is not a plan. Every answer to a code that does not work is the same
// `not_found`: wrong, expired and already used are not told apart.
//
// v1.1, a redeem that survives a lost answer. GETDEL spends the code before
// the 200 leaves; in v1, if that answer never reached the app (a timeout, a
// reset), the app's ladder asked the next name and heard the final
// `not_found` about a code typed correctly. Now the app sends a request id
// with the code: 32 CSPRNG bytes as base64url without padding, one per code
// the person submits, the same to every name of the ladder and on every
// retry. It is optional and must match /^[A-Za-z0-9_-]{22,64}$/; absent or
// malformed it is ignored (no replay for that request), never an error.
//   * A redeem that takes the record and carries an id writes
//     `paircode:done:<CODE>` = {"subUrl", "rid": sha256 hex of the id} for
//     300 s in the same script as the GETDEL, then answers the v1 200. There
//     is no moment when the code is gone and its record not there yet: not
//     for a twin request with the same id, and not for the Upstash client's
//     own retry of a script whose answer was lost between Vercel and Upstash
//     (it retries a failed fetch 5 times by default), which then finds the
//     record and replays. A record the script could not write is logged and
//     the 200 still goes out: the answer matters more than its replay.
//   * A redeem that finds the code gone and carries an id whose hash equals
//     the stored `rid` (compared in constant time) gets that 200 again.
//   * Every other case is the v1 404 `not_found`, the same status, body and
//     headers: never existed, expired, used by someone else, a wrong id.
//   * A replay only reads: it does not extend the 300 s, is not a second
//     redeem in the log (outcome `replayed`), and counts against the
//     address's limits as any redeem does. Of parallel redeems with
//     different ids exactly one gets the link; with the same id, all may.
// Only the hash of an id is stored. A v1 app sends no id and sees v1 exactly.
//
// This module is the pure part and the logic over an injected store, limiter,
// clock and logger, so all of it is unit-tested without Redis
// (tests/pair-code.test.mjs). lib/pair-code-server.ts wires the site's Redis.
//
// Logging: never the code, the link, a subscription token, a uuid, a request
// id or its hash. Only the event, the userId and, for a redeem, the outcome
// class.

import { createHash, randomInt as cryptoRandomInt, timingSafeEqual } from "crypto";

/** The 31 characters a code is made of: no 0 1 I L O. */
export const PAIR_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Characters in a code, without the dash. */
export const PAIR_CODE_LENGTH = 8;

/** How long a code lives, seconds. The hint says «10 минут». */
export const PAIR_CODE_TTL_SEC = 600;

/** Redis key prefix of a stored code. */
export const PAIR_CODE_KEY_PREFIX = "paircode:";

/** Redis key prefix of a redeemed code's replay record (v1.1). Never a code key: `done:` is not 8 characters of the alphabet. */
export const PAIR_CODE_DONE_KEY_PREFIX = "paircode:done:";

/** How long a redeemed code's answer can be replayed to the same request id, seconds. */
export const PAIR_CODE_DONE_TTL_SEC = 300;

/** A request id as the app sends it: base64url without padding (43 characters from 32 bytes). */
export const PAIR_REQUEST_ID_RE = /^[A-Za-z0-9_-]{22,64}$/;

/** Codes one account may issue per window (the cabinet; a bot button would share the budget). */
export const PAIR_CODE_ISSUE_MAX = 20;
export const PAIR_CODE_ISSUE_WINDOW_SEC = 3_600;

/** Redeem attempts per client address: a typo or two a minute, a family a day. */
export const PAIR_CODE_REDEEM_LIMITS: readonly { readonly scope: string; readonly max: number; readonly windowSec: number }[] = Object.freeze([
  Object.freeze({ scope: "min", max: 10, windowSec: 60 }),
  Object.freeze({ scope: "day", max: 60, windowSec: 86_400 }),
]);

/**
 * Hosts a stored link may point at: the Kovra app's own host ladder, which is
 * the one name. The app refuses any other host on its side as well; checking
 * here too means a bug in the derivation can never hand out a link the app
 * would refuse.
 */
export const PAIR_SUB_HOSTS: readonly string[] = Object.freeze(["kovravpn.com"]);

/** Attempts at a free code before giving up; one collision is already a 1e-8 event. */
const ISSUE_ATTEMPTS = 5;

/** Raw input longer than this is malformed without further work. */
const RAW_CODE_MAX = 64;

/** Longer than any userId we issue (`em_<normalized email>`, `tg_<id>`). */
const USER_ID_MAX = 320;

/** A device id is a uuid; a little slack, never a free-form string. */
const DEVICE_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Longer than any subscription link we build. */
const SUB_URL_MAX = 2_048;

const CODE_RE = new RegExp(`^[${PAIR_CODE_ALPHABET}]{${PAIR_CODE_LENGTH}}$`);

// ── Pure helpers ──────────────────────────────────────────────────────────

/**
 * What normalisation drops: Unicode White_Space plus U+FEFF, and the dash.
 * JavaScript's `\s` is White_Space plus U+FEFF without U+0085, hence the
 * extra entry. The same set as the app (pair_code.rs normalise_pair_code:
 * char::is_whitespace, U+FEFF, '-'; its window's src/pairCode.ts), so a
 * code pasted with a no-break space or a tab is one code on both sides.
 */
const DROPPED_RE = /[\s\u0085-]/g;

/**
 * The code a person typed, normalised the way the app normalises it:
 * uppercase, whitespace and dashes dropped. Exactly 8 characters of the
 * alphabet after that, or null (malformed). O(n) in the input, capped at 64
 * characters.
 */
export function normalisePairCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > RAW_CODE_MAX) return null;
  const code = input.toUpperCase().replace(DROPPED_RE, "");
  return CODE_RE.test(code) ? code : null;
}

/**
 * A fresh code. `randomInt(max)` must return an integer in [0, max): the
 * default is crypto.randomInt (a CSPRNG); tests inject their own.
 */
export function generatePairCode(randomInt: (max: number) => number = cryptoRandomInt): string {
  let code = "";
  for (let i = 0; i < PAIR_CODE_LENGTH; i += 1) {
    const n = randomInt(PAIR_CODE_ALPHABET.length);
    if (!Number.isSafeInteger(n) || n < 0 || n >= PAIR_CODE_ALPHABET.length) {
      throw new RangeError(`generatePairCode: randomInt returned ${String(n)}, not an index below ${PAIR_CODE_ALPHABET.length}`);
    }
    code += PAIR_CODE_ALPHABET[n];
  }
  return code;
}

/** XXXX-XXXX for a code in any accepted spelling. Throws on a malformed one. */
export function formatPairCode(code: string): string {
  const clean = normalisePairCode(code);
  if (clean === null) throw new RangeError("formatPairCode: not a pair code");
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

/** The Redis key of a normalised code. */
export function pairCodeKey(code: string): string {
  return `${PAIR_CODE_KEY_PREFIX}${code}`;
}

/** The Redis key of a normalised code's replay record. */
export function pairCodeDoneKey(code: string): string {
  return `${PAIR_CODE_DONE_KEY_PREFIX}${code}`;
}

/**
 * The request id of a redeem body, or null when there is none or it is
 * malformed: then the redeem is v1's, with no replay. Never trimmed or
 * re-cased, so one id is one string on both sides.
 */
export function normalisePairRequestId(input: unknown): string | null {
  return typeof input === "string" && PAIR_REQUEST_ID_RE.test(input) ? input : null;
}

/** What a replay record stores instead of a request id: its SHA-256, lowercase hex. */
export function pairRequestIdHash(requestId: string): string {
  return createHash("sha256").update(requestId, "utf8").digest("hex");
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/** Two SHA-256 hex digests compared in constant time; anything not one is unequal. */
function sameDigest(a: string, b: string): boolean {
  if (!SHA256_HEX_RE.test(a) || !SHA256_HEX_RE.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Whether a link may be stored under a code (and, on the way out, handed to
 * the app): https on a ladder host, the default port, no credentials, a path.
 */
export function isPairableSubUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > SUB_URL_MAX) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  if (url.pathname.length <= 1) return false;
  return PAIR_SUB_HOSTS.includes(url.hostname.toLowerCase());
}

function isUserId(v: unknown): v is string {
  return typeof v === "string" && v !== "" && v !== "*" && v.length <= USER_ID_MAX;
}

function isDeviceId(v: unknown): v is string {
  return typeof v === "string" && DEVICE_ID_RE.test(v);
}

/** What lives under `paircode:<CODE>`. */
export interface PairCodeRecord {
  readonly subUrl: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly createdAt: number;
}

/**
 * The stored record, or null when it is not one. Upstash hands back a JSON
 * value already parsed, a plain client the string: both are accepted.
 */
export function parsePairCodeRecord(raw: unknown): PairCodeRecord | null {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const r = v as Readonly<Record<string, unknown>>;
  if (!isPairableSubUrl(r.subUrl) || !isUserId(r.userId) || !isDeviceId(r.deviceId)) return null;
  if (typeof r.createdAt !== "number" || !Number.isFinite(r.createdAt)) return null;
  return { subUrl: r.subUrl, userId: r.userId, deviceId: r.deviceId, createdAt: r.createdAt };
}

/** What lives under `paircode:done:<CODE>`: the answer, and whose request it was. */
export interface PairCodeDoneRecord {
  readonly subUrl: string;
  /** pairRequestIdHash of the request id the code was redeemed with. */
  readonly rid: string;
}

/**
 * The replay record, or null when it is not one: the link must still pass
 * isPairableSubUrl on the way out, the hash must be a SHA-256 hex digest.
 * A JSON string or an already parsed value, as parsePairCodeRecord.
 */
export function parsePairCodeDoneRecord(raw: unknown): PairCodeDoneRecord | null {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const r = v as Readonly<Record<string, unknown>>;
  if (!isPairableSubUrl(r.subUrl) || typeof r.rid !== "string" || !SHA256_HEX_RE.test(r.rid)) return null;
  return { subUrl: r.subUrl, rid: r.rid };
}

// URLs, pair codes (bare or dashed), uuids, long hex runs (subscription tokens,
// request id hashes) and long base64url runs (request ids).
const SECRET_PATTERNS: readonly RegExp[] = [
  /https?:\/\/\S+/gi,
  /paircode:\S*/gi,
  new RegExp(`\\b[${PAIR_CODE_ALPHABET}]{4}-?[${PAIR_CODE_ALPHABET}]{4}\\b`, "g"),
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  /\b[0-9a-f]{16,}\b/gi,
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{22,}(?![A-Za-z0-9_-])/g,
];

/**
 * An error as one log-safe line: its name and message with links, codes,
 * uuids, tokens and request ids cut out, at most 300 characters. A Redis
 * error that echoes its command would otherwise carry the code into the logs.
 */
export function redactForLog(err: unknown): string {
  let text: string;
  if (err instanceof Error) text = `${err.name}: ${err.message}`;
  else if (typeof err === "string") text = err;
  else text = typeof err;
  for (const re of SECRET_PATTERNS) text = text.replace(re, "<redacted>");
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

// ── Over an injected store ────────────────────────────────────────────────

/**
 * What one redeem step found, in Redis and in a single atomic step:
 *   taken  the code was there and is gone now; `replaySaved` when its replay
 *          record was written with it (only ever with a request id);
 *   done   the code was gone and a replay record is there (only looked for
 *          with a request id);
 *   none   neither.
 * The values are the stored ones, a JSON string or already parsed.
 */
export type PairCodeTake =
  | { readonly kind: "taken"; readonly value: unknown; readonly replaySaved: boolean }
  | { readonly kind: "done"; readonly value: unknown }
  | { readonly kind: "none" };

/** The Redis operations a code needs. */
export interface PairCodeStore {
  /** SET key value EX ttl NX: true when written, false when the key exists. */
  putNew(key: string, value: string, ttlSec: number): Promise<boolean>;
  /**
   * PAIR_CODE_REDEEM_SCRIPT, one atomic step: take `codeKey`; with `rid` (the
   * request id's SHA-256 hex) leave the replay record under `doneKey` for
   * `doneTtlSec` when the code was there, or read it when it was not.
   */
  redeem(codeKey: string, doneKey: string, rid: string | null, doneTtlSec: number): Promise<PairCodeTake>;
}

/**
 * The redeem of a code as one Lua script, so that taking the code and leaving
 * its replay record cannot come apart. Run twice for one request (the
 * Upstash client retries a fetch that failed after Upstash had run it), the
 * second run finds the record the first one left.
 *
 *   KEYS  paircode:<CODE>, paircode:done:<CODE>
 *   ARGV  the request id's SHA-256 hex or "" for none, the record's TTL in s
 *   reply {"taken", <record>, 1|0}  the code, gone now; 1: the record is written
 *         {"done", <replay record>}  the code was gone, the record is there
 *         nil                        neither
 *
 * Only the hash goes in; the hashes are compared in Node, in constant time.
 * Decoding the record runs under pcall: a record cjson cannot read, or no
 * cjson at all, still gives the code back (Node calls it corrupt or answers
 * it) with 0 for "no replay record", never a script error after the GETDEL.
 * tests/pair-code-script.test.mjs runs this text under a local Lua when
 * there is one, against the model the in-memory fakes run.
 */
export const PAIR_CODE_REDEEM_SCRIPT = `-- pair-code v1.1 redeem (src/lib/pair-code.ts)
local taken = redis.call("GETDEL", KEYS[1])
if taken then
  local saved = 0
  if ARGV[1] ~= "" then
    local ok, value = pcall(function()
      local record = cjson.decode(taken)
      if type(record) ~= "table" or type(record.subUrl) ~= "string" then return nil end
      return cjson.encode({ subUrl = record.subUrl, rid = ARGV[1] })
    end)
    if ok and type(value) == "string" then
      local reply = redis.pcall("SET", KEYS[2], value, "EX", ARGV[2])
      if type(reply) ~= "table" or reply.err == nil then saved = 1 end
    end
  end
  return { "taken", taken, saved }
end
if ARGV[1] ~= "" then
  local done = redis.call("GET", KEYS[2])
  if done then return { "done", done } end
end
return false
`;

/**
 * The reply of PAIR_CODE_REDEEM_SCRIPT, or a throw for anything else: an
 * unexpected reply is a fault (the route's 503), never a quiet not_found.
 * The thrown message carries nothing of the reply.
 */
export function parsePairCodeRedeemReply(reply: unknown): PairCodeTake {
  if (reply === null || reply === undefined) return { kind: "none" };
  if (Array.isArray(reply)) {
    const [tag, value, saved] = reply as readonly unknown[];
    if (tag === "taken" && reply.length === 3 && value !== null && value !== undefined && (saved === 0 || saved === 1)) {
      return { kind: "taken", value, replaySaved: saved === 1 };
    }
    if (tag === "done" && reply.length === 2 && value !== null && value !== undefined) return { kind: "done", value };
  }
  throw new Error("redeem: an unexpected reply from the redeem script");
}

/** The slice of the Upstash client the store uses. */
export interface PairCodeRedis {
  set(key: string, value: string, opts: { nx: true; ex: number }): Promise<unknown>;
  eval(script: string, keys: string[], args: string[]): Promise<unknown>;
}

export function createRedisPairCodeStore(client: PairCodeRedis): PairCodeStore {
  return Object.freeze({
    async putNew(key: string, value: string, ttlSec: number): Promise<boolean> {
      const answer = await client.set(key, value, { nx: true, ex: ttlSec });
      return answer === "OK";
    },
    async redeem(codeKey: string, doneKey: string, rid: string | null, doneTtlSec: number): Promise<PairCodeTake> {
      if (!Number.isSafeInteger(doneTtlSec) || doneTtlSec <= 0) throw new RangeError("redeem: the replay TTL must be a positive whole number of seconds");
      if (rid !== null && !SHA256_HEX_RE.test(rid)) throw new RangeError("redeem: rid must be a SHA-256 hex digest");
      const reply = await client.eval(PAIR_CODE_REDEEM_SCRIPT, [codeKey, doneKey], [rid ?? "", String(doneTtlSec)]);
      return parsePairCodeRedeemReply(reply);
    },
  });
}

/** lib/ratelimit.ts rateLimit, or a fake. May reject: a fault is not an overrun. */
export type PairCodeLimiter = (key: string, max: number, windowSec: number) => Promise<{ readonly ok: boolean; readonly retryAfter: number }>;

/**
 * Outcome classes of a redeem, as logged. `replayed` is a lost answer given
 * again to its own request id: not a second redeem.
 */
export type PairCodeRedeemOutcome = "ready" | "replayed" | "not_found" | "bad_code" | "corrupt" | "rate_limited";

/** Every line this feature logs. Nothing in here may be secret. */
export type PairCodeEvent =
  | { readonly event: "pair_code_issued"; readonly userId: string }
  | { readonly event: "pair_code_issue_limited"; readonly userId: string }
  | { readonly event: "pair_code_limiter_down"; readonly scope: "issue" | "redeem"; readonly error: string }
  | { readonly event: "pair_code_redeem"; readonly outcome: PairCodeRedeemOutcome; readonly userId?: string }
  /** The redeem script took the code but could not write its replay record; the 200 went out anyway. */
  | { readonly event: "pair_code_replay_unsaved" };

export function defaultPairCodeLog(event: PairCodeEvent): void {
  const line = `[pair-code] ${JSON.stringify(event)}`;
  if (event.event === "pair_code_limiter_down" || event.event === "pair_code_replay_unsaved") console.warn(line);
  else console.info(line);
}

export interface PairCodeDeps {
  readonly store: PairCodeStore;
  readonly limit: PairCodeLimiter;
  /** Defaults to crypto.randomInt. */
  readonly randomInt?: (max: number) => number;
  /** Clock in ms. Defaults to Date.now. */
  readonly now?: () => number;
  /** Defaults to defaultPairCodeLog. */
  readonly log?: (event: PairCodeEvent) => void;
}

export interface PairCodeIssueInput {
  readonly userId: string;
  readonly deviceId: string;
  /** Derived on the server from the person's own device; never from a client. */
  readonly subUrl: string;
}

export interface PairCodeIssued {
  readonly ok: true;
  /** The bare code, `K7QM2XPA`. */
  readonly code: string;
  /** As shown, `K7QM-2XPA`. */
  readonly display: string;
  /** Seconds the code lives. */
  readonly expiresIn: number;
}

export type PairCodeIssueResult =
  | PairCodeIssued
  | { readonly ok: false; readonly reason: "bad_input" }
  | { readonly ok: false; readonly reason: "rate_limited"; readonly retryAfter: number };

/** A logger that throws must not cost the person their code. */
function safeLog(log: (event: PairCodeEvent) => void, event: PairCodeEvent): void {
  try {
    log(event);
  } catch {
    // Nothing to do: the line is lost, the answer is not.
  }
}

/**
 * Issue a code for one device's link. The caller has checked the gate and
 * that the device is the person's own (lib/pair-code-server.ts). At most
 * PAIR_CODE_ISSUE_MAX codes per account per hour; a limiter fault lets the
 * code through: the write below fails on its own
 * if Redis is really down. A store error rejects.
 */
export async function issuePairCode(deps: PairCodeDeps, input: PairCodeIssueInput): Promise<PairCodeIssueResult> {
  const log = deps.log ?? defaultPairCodeLog;
  const now = deps.now ?? Date.now;
  if (input === null || typeof input !== "object") return { ok: false, reason: "bad_input" };
  const { userId, deviceId, subUrl } = input;
  if (!isUserId(userId) || !isDeviceId(deviceId) || !isPairableSubUrl(subUrl)) return { ok: false, reason: "bad_input" };

  try {
    const rl = await deps.limit(`pair-code-issue:${userId}`, PAIR_CODE_ISSUE_MAX, PAIR_CODE_ISSUE_WINDOW_SEC);
    if (!rl.ok) {
      safeLog(log, { event: "pair_code_issue_limited", userId });
      const retryAfter = Number.isFinite(rl.retryAfter) && rl.retryAfter > 0 ? Math.ceil(rl.retryAfter) : PAIR_CODE_ISSUE_WINDOW_SEC;
      return { ok: false, reason: "rate_limited", retryAfter };
    }
  } catch (err) {
    safeLog(log, { event: "pair_code_limiter_down", scope: "issue", error: redactForLog(err) });
  }

  const record: PairCodeRecord = { subUrl, userId, deviceId, createdAt: now() };
  const value = JSON.stringify(record);
  for (let attempt = 0; attempt < ISSUE_ATTEMPTS; attempt += 1) {
    const code = generatePairCode(deps.randomInt);
    if (await deps.store.putNew(pairCodeKey(code), value, PAIR_CODE_TTL_SEC)) {
      safeLog(log, { event: "pair_code_issued", userId });
      return { ok: true, code, display: formatPairCode(code), expiresIn: PAIR_CODE_TTL_SEC };
    }
  }
  throw new Error(`issuePairCode: no free code in ${ISSUE_ATTEMPTS} attempts`);
}

export type PairCodeRedeemResult =
  | { readonly status: "ready"; readonly subUrl: string; readonly userId: string; readonly deviceId: string }
  /** The same answer as `ready`, given again to the request id the code was redeemed with. */
  | { readonly status: "replayed"; readonly subUrl: string }
  | { readonly status: "bad_code" }
  | { readonly status: "not_found" };

/**
 * Trade a code for its link, once. Malformed input is `bad_code`; wrong,
 * expired, used and unreadable are one `not_found`. The record is taken with
 * GETDEL, so of two parallel redeems exactly one sees it.
 *
 * With a request id (v1.1; a malformed one is no id at all), the same atomic
 * step that takes the record leaves a replay record for
 * PAIR_CODE_DONE_TTL_SEC, and a later redeem of the spent code with the same
 * id gets the same link back (`replayed`): the ladder's next name, the app's
 * next press, or the store's own retry of a step whose answer was lost. A
 * replay record the step could not write is logged and does not cost the
 * answer. A store error rejects; the code may then be spent already, and a
 * retry with the same id is how the app gets its link back.
 */
export async function redeemPairCode(
  deps: Pick<PairCodeDeps, "store" | "log">,
  rawCode: unknown,
  rawRequestId?: unknown,
): Promise<PairCodeRedeemResult> {
  const log = deps.log ?? defaultPairCodeLog;
  const code = normalisePairCode(rawCode);
  if (code === null) {
    safeLog(log, { event: "pair_code_redeem", outcome: "bad_code" });
    return { status: "bad_code" };
  }
  const requestId = normalisePairRequestId(rawRequestId);
  const rid = requestId === null ? null : pairRequestIdHash(requestId);

  const step = await deps.store.redeem(pairCodeKey(code), pairCodeDoneKey(code), rid, PAIR_CODE_DONE_TTL_SEC);
  switch (step.kind) {
    case "taken": {
      // A record that is broken where the script cannot see it (a bad userId)
      // may still leave a replay record; its link passes isPairableSubUrl on
      // the way out like any other, so nothing foreign is ever handed out.
      const record = parsePairCodeRecord(step.value);
      if (record === null) {
        safeLog(log, { event: "pair_code_redeem", outcome: "corrupt" });
        return { status: "not_found" };
      }
      if (rid !== null && !step.replaySaved) safeLog(log, { event: "pair_code_replay_unsaved" });
      safeLog(log, { event: "pair_code_redeem", outcome: "ready", userId: record.userId });
      return { status: "ready", subUrl: record.subUrl, userId: record.userId, deviceId: record.deviceId };
    }
    case "done": {
      // Only ever found for an id; a store that answers it to none is not believed.
      if (rid === null) break;
      const done = parsePairCodeDoneRecord(step.value);
      if (done === null) {
        safeLog(log, { event: "pair_code_redeem", outcome: "corrupt" });
        return { status: "not_found" };
      }
      if (sameDigest(done.rid, rid)) {
        safeLog(log, { event: "pair_code_redeem", outcome: "replayed" });
        return { status: "replayed", subUrl: done.subUrl };
      }
      break;
    }
    case "none":
      break;
  }
  safeLog(log, { event: "pair_code_redeem", outcome: "not_found" });
  return { status: "not_found" };
}

/** Origins of our own sites: a page there is trusted as the site itself is. */
const OWN_ORIGINS: ReadonlySet<string> = new Set(PAIR_SUB_HOSTS.map((host) => `https://${host}`));

/** Why a redeem request is refused before it counts, or null to go on. */
export type PairCodeRequestRefusal = "foreign_origin" | "not_json";

/**
 * Whether a redeem request is one the app could have sent, judged on its
 * headers alone and before the address's limits are asked, so that what is
 * refused here costs that address nothing.
 *
 * The limits are per address, and any web page a person opens can make
 * their browser POST here: a no-cors fetch or a form with no preflight
 * (text/plain, a form type), or, as the CORS answer is "*", a JSON fetch
 * whose preflight passes. Counted, ten of those a minute would lock the
 * person's own app out of redeeming for a day. The app (reqwest, URLSession)
 * sends `Content-Type: application/json` and no Origin; a browser sends an
 * Origin with every cross-site POST and cannot send JSON without a CORS
 * request, which carries one too. So:
 *   foreign_origin  an Origin that is not one of our sites ("null" included);
 *   not_json        a media type other than application/json (a charset is fine).
 */
export function redeemRequestRefusal(headers: { get(name: string): string | null }): PairCodeRequestRefusal | null {
  const origin = headers.get("origin");
  if (origin !== null && !OWN_ORIGINS.has(origin.toLowerCase())) return "foreign_origin";
  const mediaType = (headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  return mediaType === "application/json" ? null : "not_json";
}

/**
 * Seconds a redeem from this address has to wait, or null. Both windows
 * count every attempt; the first one over its limit answers. A limiter fault
 * is not an overrun (one warning): Redis down fails the GETDEL anyway, and
 * the code space keeps guessing hopeless either way.
 */
export async function redeemRetryAfter(
  limit: PairCodeLimiter,
  ip: string,
  log: (event: PairCodeEvent) => void = defaultPairCodeLog,
): Promise<number | null> {
  try {
    for (const { scope, max, windowSec } of PAIR_CODE_REDEEM_LIMITS) {
      const rl = await limit(`pair-code-redeem:${scope}:${ip}`, max, windowSec);
      if (!rl.ok) {
        safeLog(log, { event: "pair_code_redeem", outcome: "rate_limited" });
        return Number.isFinite(rl.retryAfter) && rl.retryAfter > 0 ? Math.ceil(rl.retryAfter) : windowSec;
      }
    }
  } catch (err) {
    safeLog(log, { event: "pair_code_limiter_down", scope: "redeem", error: redactForLog(err) });
  }
  return null;
}
