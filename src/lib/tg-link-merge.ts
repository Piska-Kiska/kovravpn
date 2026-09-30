// src/lib/tg-link-merge.ts
//
// Carry a standalone Telegram account's money over when it is linked to
// another account (linkTelegramToPrimary in admin-ops.ts).
//
// The bot keeps money in two places the old "is it empty?" check never read:
// the prepaid wallet `balance_usd:{id}` (integer cents) and the subscriptions
// `subs:{id}`. Linking points alias:tg_X at the primary account, after which
// nothing reads tg_X again, so both move first (KM-02).
//
// How the move stays exact under concurrency:
//
//   • The caller holds `lock:wallet:{from}` and `lock:wallet:{to}` (the lock
//     wallet purchases take for their charge and grant), so no purchase runs
//     across the move. Credits (payment webhooks, promo codes) take no lock;
//     they are atomic INCRBYs and are handled by the script below.
//   • moveMoney holds `lock:subs:{from}` and `lock:subs:{to}`, the lock every
//     subscription grant takes (subscriptions.ts), so no read-modify-write of
//     either list straddles the move.
//   • The writes are ONE server-side script (MOVE_MONEY_LUA): nothing is
//     half-done when the function dies, and nothing runs between its reads
//     and its writes. It moves the wallet balance as it is at that moment
//     (a credit that lands later stays on tg_X; a second link of the same
//     pair sweeps it) and writes the subscription lists only if they are
//     still byte for byte what the app read and merged (compare-and-set). A
//     writer that got past the lock anyway (withSubsLock goes ahead after
//     waiting 3 s) makes it answer "conflict", and the move is re-read.
//   • The merge is idempotent: a subscription whose id the primary already
//     has is not added again, so running the move twice after a lost reply
//     cannot double a grant, and the money moves at most once because the
//     script moves what the source holds, not a remembered amount.
//
// The scripts need no Lua library (no cjson): the app parses and validates
// the lists in TypeScript, the scripts only compare, move and store strings.
// Anything that cannot be read as money (a wallet that is not a whole number
// of cents, a list that is not a JSON array of subscriptions) is refused,
// never guessed at.

import { redis } from "./redis";
import { lockSubscriptions, type Subscription } from "./subscriptions";

const walletKey = (userId: string): string => `balance_usd:${userId}`;
const subsKey = (userId: string): string => `subs:${userId}`;

/** How many times a changed subscription list is re-read before giving up. */
const MAX_CONFLICT_RETRIES = 2;

/**
 * Raw values of KEYS, each as "v<value>" or "n" for a missing key. The prefix
 * keeps the Upstash client from JSON-parsing the reply, so the app gets the
 * exact bytes it later compares against.
 */
export const READ_RAW_LUA = `
local out = {}
for i = 1, #KEYS do
  local v = redis.call('GET', KEYS[i])
  if v then out[i] = 'v' .. v else out[i] = 'n' end
end
return out
`;

/**
 * The move, one atomic script.
 *
 *   KEYS[1] balance_usd:{from}   KEYS[2] balance_usd:{to}
 *   KEYS[3] subs:{from}          KEYS[4] subs:{to}
 *   ARGV[1] subs:{from} as read ("v<raw>" / "n")
 *   ARGV[2] subs:{to} as read
 *   ARGV[3] the new subs:{to}, or "" to leave it
 *   ARGV[4] "1" to delete subs:{from}, "0" to leave it
 *
 * Reply: {"ok", <cents moved>}, {"conflict"} when a list changed since it was
 * read, or {"bad_wallet_from"} / {"bad_wallet_to"}; nothing is written unless
 * the reply is "ok". Amounts stay decimal strings (at most 15 digits, exact
 * in a double as well).
 */
export const MOVE_MONEY_LUA = `
local function state(key)
  local v = redis.call('GET', key)
  if v then return 'v' .. v end
  return 'n'
end

local function wallet(key, allowNegative)
  local v = redis.call('GET', key)
  if not v then return '0' end
  if v == '0' then return v end
  local digits
  if allowNegative then digits = string.match(v, '^%-?([1-9]%d*)$')
  else digits = string.match(v, '^([1-9]%d*)$') end
  if digits and #digits <= 15 then return v end
  return nil
end

if state(KEYS[3]) ~= ARGV[1] or state(KEYS[4]) ~= ARGV[2] then return {'conflict'} end
local cents = wallet(KEYS[1], false)
if not cents then return {'bad_wallet_from'} end
if not wallet(KEYS[2], true) then return {'bad_wallet_to'} end

if cents ~= '0' then
  redis.call('DECRBY', KEYS[1], cents)
  redis.call('INCRBY', KEYS[2], cents)
end
if ARGV[3] ~= '' then redis.call('SET', KEYS[4], ARGV[3]) end
if ARGV[4] == '1' then redis.call('DEL', KEYS[3]) end
return {'ok', cents}
`;

export type MoveResult =
  | { ok: true; movedCents: number; movedSubs: number }
  | { ok: false; reason: "busy" | "bad_data"; detail: string };

/** What is about to move, for the caller's audit trail. */
export interface MovePlan {
  cents: number;
  subs: string[];
}

export interface MoveOptions {
  now?: number;
  /** Called once, before the first move script, when anything is to move. */
  beforeMove?: (plan: MovePlan) => Promise<void>;
  /** How long to wait for a grant that holds a subscription lock. */
  lockWaitMs?: number;
}

/**
 * Cents stored in a wallet key (a missing key is 0), read exactly as
 * MOVE_MONEY_LUA reads it: "0" or up to 15 digits without a leading zero,
 * negative only when `allowNegative`. Null for anything else.
 */
export function parseWalletCents(raw: string | null, allowNegative = false): number | null {
  if (raw === null || raw === "0") return 0;
  const re = allowNegative ? /^-?[1-9]\d{0,14}$/ : /^[1-9]\d{0,14}$/;
  return re.test(raw) ? Number(raw) : null;
}

export function isSubscription(v: unknown): v is Subscription {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    s.id.length > 0 &&
    typeof s.kind === "string" &&
    Number.isSafeInteger(s.slots) &&
    typeof s.createdAt === "number" &&
    Number.isFinite(s.createdAt) &&
    typeof s.expiresAt === "number" &&
    Number.isFinite(s.expiresAt)
  );
}

/** A subscription list from its raw value (null = missing key), or null when it is not one. */
export function parseSubsRaw(raw: string | null): Subscription[] | null {
  if (raw === null) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  return Array.isArray(v) && v.every(isSubscription) ? v : null;
}

/** "v<raw>" / "n" from READ_RAW_LUA → the raw value or null; anything else throws. */
function rawOf(state: unknown): string | null {
  if (state === "n") return null;
  if (typeof state === "string" && state.startsWith("v")) return state.slice(1);
  throw new Error("move-money: unexpected read reply");
}

/** What the subscription lists become, from what was read. Pure. */
export function planSubsMove(
  fromSubs: readonly Subscription[],
  toSubs: readonly Subscription[],
  now: number,
): { added: Subscription[]; live: number; nextTo: string } {
  const known = new Set(toSubs.map((s) => s.id));
  const added: Subscription[] = [];
  let live = 0;
  for (const s of fromSubs) {
    if (s.expiresAt <= now) continue;
    live += 1;
    if (known.has(s.id)) continue;
    known.add(s.id);
    added.push(s);
  }
  return { added, live, nextTo: added.length > 0 ? JSON.stringify([...toSubs, ...added]) : "" };
}

/** A count from a script reply: the Upstash client turns "801" into 801. */
function replyCount(v: unknown): number | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : null;
  if (typeof v === "string" && /^\d{1,15}$/.test(v)) return Number(v);
  return null;
}

type ScriptOutcome =
  | { kind: "ok"; cents: number }
  | { kind: "conflict" }
  | { kind: "bad_wallet"; side: "from" | "to" };

/** Turn the move script's reply into an outcome; a reply of any other shape throws. */
export function parseMoveReply(reply: unknown): ScriptOutcome {
  if (!Array.isArray(reply) || reply.length === 0) throw new Error("move-money: unexpected script reply");
  const [status, cents] = reply as unknown[];
  if (status === "ok") {
    const n = replyCount(cents);
    if (n === null) throw new Error("move-money: unexpected script reply");
    return { kind: "ok", cents: n };
  }
  if (status === "conflict") return { kind: "conflict" };
  if (status === "bad_wallet_from") return { kind: "bad_wallet", side: "from" };
  if (status === "bad_wallet_to") return { kind: "bad_wallet", side: "to" };
  throw new Error("move-money: unexpected script reply");
}

async function release(unlock: (() => Promise<void>) | null): Promise<void> {
  if (!unlock) return;
  try {
    await unlock();
  } catch (err) {
    // The lock expires by its TTL anyway.
    console.warn("[tg-link-merge] unlock failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Move `from`'s wallet and live subscriptions to `to`. The caller holds both
 * wallet locks (see the header). Returns what moved (zeros when there was
 * nothing), or why nothing did. Throws when Redis itself fails: each script
 * then ran completely or not at all, and running the move again finishes it
 * without doubling anything.
 */
export async function moveMoney(from: string, to: string, opts: MoveOptions = {}): Promise<MoveResult> {
  if (from === to) return { ok: false, reason: "bad_data", detail: "cannot move money onto the same account" };
  const now = opts.now ?? Date.now();
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("move-money: invalid clock");

  const unlockFrom = await lockSubscriptions(from, opts.lockWaitMs);
  if (!unlockFrom) return { ok: false, reason: "busy", detail: `subscriptions of ${from} are being written` };
  let unlockTo: (() => Promise<void>) | null = null;
  try {
    unlockTo = await lockSubscriptions(to, opts.lockWaitMs);
    if (!unlockTo) return { ok: false, reason: "busy", detail: `subscriptions of ${to} are being written` };
    return await moveLocked(from, to, now, opts.beforeMove);
  } finally {
    await release(unlockTo);
    await release(unlockFrom);
  }
}

async function moveLocked(
  from: string,
  to: string,
  now: number,
  beforeMove: MoveOptions["beforeMove"],
): Promise<MoveResult> {
  const keys = [walletKey(from), walletKey(to), subsKey(from), subsKey(to)];
  let announced = false;
  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt += 1) {
    const read: unknown = await redis.eval(READ_RAW_LUA, keys, []);
    if (!Array.isArray(read) || read.length !== keys.length) throw new Error("move-money: unexpected read reply");
    const [walletFromRaw, walletToRaw, subsFromRaw, subsToRaw] = read.map(rawOf);

    const walletFrom = parseWalletCents(walletFromRaw);
    if (walletFrom === null) return { ok: false, reason: "bad_data", detail: `wallet of ${from} is not a whole number of cents >= 0` };
    if (parseWalletCents(walletToRaw, true) === null) {
      return { ok: false, reason: "bad_data", detail: `wallet of ${to} is not a whole number of cents` };
    }
    const fromSubs = parseSubsRaw(subsFromRaw);
    if (fromSubs === null) return { ok: false, reason: "bad_data", detail: `subscriptions of ${from} are not a list of subscriptions` };
    const toSubs = parseSubsRaw(subsToRaw);
    if (toSubs === null) return { ok: false, reason: "bad_data", detail: `subscriptions of ${to} are not a list of subscriptions` };

    const subs = planSubsMove(fromSubs, toSubs, now);
    if (!announced && beforeMove && (walletFrom > 0 || subs.added.length > 0)) {
      announced = true;
      await beforeMove({ cents: walletFrom, subs: subs.added.map((s) => s.kind) });
    }

    const reply: unknown = await redis.eval(MOVE_MONEY_LUA, keys, [
      subsFromRaw === null ? "n" : `v${subsFromRaw}`,
      subsToRaw === null ? "n" : `v${subsToRaw}`,
      subs.nextTo,
      subs.live > 0 ? "1" : "0",
    ]);
    const outcome = parseMoveReply(reply);
    if (outcome.kind === "conflict") continue;
    if (outcome.kind === "bad_wallet") {
      const who = outcome.side === "from" ? from : to;
      return { ok: false, reason: "bad_data", detail: `wallet of ${who} is not a whole number of cents` };
    }
    if (outcome.cents > 0 || subs.added.length > 0) {
      // `to` can be an e-mail based id; the admin audit entry names both sides.
      console.info(JSON.stringify({ evt: "link.money_moved", from, cents: outcome.cents, subs: subs.added.length }));
    }
    return { ok: true, movedCents: outcome.cents, movedSubs: subs.added.length };
  }
  return { ok: false, reason: "busy", detail: `subscriptions of ${from} or ${to} kept changing` };
}
