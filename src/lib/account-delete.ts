// src/lib/account-delete.ts
//
// Self-service account deletion: the page /dashboard/account/delete and its
// endpoints under /api/account/delete. The Kovra app for iPhone and iPad
// links here (App Review Guideline 5.1.1(v): deletion must be possible from
// the app; a link to a web page that completes it is acceptable, "write to
// support" is not).
//
// The flow:
//   GET  /api/account/delete           what would be lost (wallet, plans,
//                                      devices) and where the code will go
//   POST /api/account/delete/confirm   a six-digit code to the account's own
//                                      channel: Telegram chat or e-mail
//   POST /api/account/delete {code}    check the code, take every device off
//                                      every panel, delete the records the
//                                      admin bot's wipe deletes, end every
//                                      session of the account
//
// OWNER FIRST. Deletion is open only to the accounts in the Redis set
// `acctdel:users` (or everyone with "*"); the rest are told to write to
// support.
//
//   SADD acctdel:users em_<address> | tg_<id>   one more account
//   SADD acctdel:users "*"                      everyone
//   SREM acctdel:users "*"                      back to the list
//
// The owner's own account (tg_<ADMIN_TG_ID>, or an account with that Telegram
// linked) is always let in, and for it the last step is a DRY RUN: the code
// is sent and checked, the plan is counted, nothing is deleted. Losing the
// admin account to a test is not an option; a real deletion is tried on a
// test account added to the set.
//
// DEVICES FIRST. Each device goes through lib/profile-delete.ts, the same
// path as "Delete device" in the cabinet: off every panel, then out of the
// list, with its link answering "removed" from then on. A panel that does not
// confirm keeps that device and stops the deletion (502 panel_failed): the
// code stays valid, the devices already removed stay removed, and the retry
// the page offers continues from there. Only with no device left are the
// account's records deleted (admin-ops executeWipe, without its own panel
// step, which knows the active inbound only).
//
// Handlers take their outside world (Telegram, e-mail, panels, the clock) as
// `deps`, so tests run them against an in-memory Redis
// (tests/account-delete.test.mjs).

import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { redis } from "./redis";
import { ADMIN_TG_ID } from "./bot-owner";
import { alertAdmin, escapeHtml } from "./admin-alert";
import { createTelegramApi } from "./bot-v2/telegram";
import { clearSessionCookie, destroySession, getSession, revokeUserSessions, sessionIdFromRequest, type Session } from "./session";
import { acquireLock, rateLimit, secureCode6 } from "./ratelimit";
import { getAccount, getProfiles, getUserRecord, resolveUserId, type UserRecord } from "./accounts";
import { audit, executeWipe, planWipe, wipeMoneyFingerprint, type WipeMoneyEntry } from "./admin-ops";
import { deleteOwnProfile, type DeleteOwnProfileResult } from "./profile-delete";
import { deleteCodeEmail, deleteCodeTelegram, type DeleteCodeEmail } from "./account-delete-copy";

// ─── Gate ───────────────────────────────────────────────────────────────────

export const ACCOUNT_DELETE_USERS_KEY = "acctdel:users";
export const ACCOUNT_DELETE_EVERYONE = "*";
const OWNER_USER_ID = `tg_${ADMIN_TG_ID}`;

/** The owner's account: its own Telegram id, or an account that has it linked. */
export function isOwnerAccount(userId: string, user: UserRecord | null): boolean {
  return userId === OWNER_USER_ID || user?.telegramId === ADMIN_TG_ID;
}

/** Whether this account may delete itself here. Never throws: a failed read is "no". */
export async function accountDeleteEnabled(userId: string, user: UserRecord | null): Promise<boolean> {
  // The owner never depends on the set: the gate must not lock out the person checking it.
  if (isOwnerAccount(userId, user)) return true;
  try {
    const flags = await redis.smismember(ACCOUNT_DELETE_USERS_KEY, [userId, ACCOUNT_DELETE_EVERYONE]);
    return flags.some((flag) => Number(flag) === 1);
  } catch (err) {
    console.warn("[account-delete] gate read failed:", err instanceof Error ? err.message : "error");
    return false;
  }
}

// ─── Limits ─────────────────────────────────────────────────────────────────

export const CODE_TTL_SEC = 600;
/** Codes sent per account per hour. */
export const CODE_SENDS_PER_HOUR = 3;
/** Deletion attempts per account per hour; also bounds guessing: 5 in 10^6. */
export const DELETE_ATTEMPTS_PER_HOUR = 5;
/** Wrong codes after which the code is burnt and a new one must be asked for. */
export const MAX_WRONG_CODES = 5;
/**
 * The account lock, with the TTL device creation takes it with
 * (api/vpn/create): nothing may add a device while the account is taken
 * apart. A device that slips in after it runs out is caught by the second
 * look at the list (DEVICE_ROUNDS).
 */
const USER_LOCK_TTL_SEC = 15;
/** Looks at the device list before giving up on a device that keeps appearing. */
const DEVICE_ROUNDS = 3;
/** How long a finished deletion answers a repeated request with "deleted". */
const DONE_TTL_SEC = 86_400;
const HOUR_SEC = 3600;

export const deleteCodeKey = (userId: string): string => `acctdel:code:${userId}`;

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

/** The mark that answers a repeated request after the session is gone. Keyed by a hash of the session id. */
export const deleteDoneKey = (sid: string): string => `acctdel:done:${sha256(sid)}`;

// ─── Code ───────────────────────────────────────────────────────────────────

interface CodeRecord {
  /** SHA-256 of salt and code, hex. The code itself is never stored. */
  readonly h: string;
  readonly s: string;
  /** Expiry, ms. The Redis TTL is the same; this one tells "expired" from "never asked". */
  readonly exp: number;
  /** Wrong attempts so far. */
  readonly n: number;
}

const hashCode = (salt: string, code: string): string => sha256(`${salt}:${code}`);

/** Constant-time comparison of two hex digests of the same length. */
function sameDigest(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

function parseCodeRecord(raw: unknown): CodeRecord | null {
  if (raw === null || raw === undefined) return null;
  try {
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<CodeRecord> | null;
    if (typeof v?.h !== "string" || typeof v.s !== "string" || !Number.isFinite(Number(v.exp))) return null;
    return { h: v.h, s: v.s, exp: Number(v.exp), n: Number(v.n) || 0 };
  } catch {
    return null;
  }
}

async function storeCode(userId: string, code: string, now: number): Promise<void> {
  const s = randomBytes(8).toString("hex");
  const rec: CodeRecord = { h: hashCode(s, code), s, exp: now + CODE_TTL_SEC * 1000, n: 0 };
  await redis.set(deleteCodeKey(userId), JSON.stringify(rec), { ex: CODE_TTL_SEC });
}

export type CodeCheck = "ok" | "invalid" | "expired";

/**
 * Check a submitted code. A match consumes nothing here: the code stays valid
 * until the deletion finishes, so a retry after a panel failure needs no new
 * one. A miss counts; the fifth burns it.
 */
async function checkCode(userId: string, code: string, now: number): Promise<CodeCheck> {
  const key = deleteCodeKey(userId);
  const rec = parseCodeRecord(await redis.get(key));
  if (!rec) return "expired";
  if (now > rec.exp) {
    await redis.del(key);
    return "expired";
  }
  if (sameDigest(hashCode(rec.s, code), rec.h)) return "ok";
  const n = rec.n + 1;
  if (n >= MAX_WRONG_CODES) {
    await redis.del(key);
  } else {
    const leftSec = Math.max(1, Math.ceil((rec.exp - now) / 1000));
    await redis.set(key, JSON.stringify({ ...rec, n }), { ex: leftSec });
  }
  return "invalid";
}

// ─── Outside world ──────────────────────────────────────────────────────────

export interface AccountDeleteDeps {
  /** Send an HTML message to a Telegram chat; resolves to whether Telegram accepted it. */
  sendTelegram(chatId: string, html: string): Promise<boolean>;
  /** Send a letter; resolves to whether the provider accepted it. */
  sendEmail(to: string, letter: DeleteCodeEmail): Promise<boolean>;
  /** Tell the owner; never throws. */
  notifyOwner(html: string): Promise<void>;
  /** Take one device off every panel and out of the list (lib/profile-delete.ts). */
  deleteDevice(userId: string, uuid: string): Promise<DeleteOwnProfileResult>;
  newCode(): string;
  now(): number;
}

async function sendTelegramHtml(chatId: string, html: string): Promise<boolean> {
  const sent = await createTelegramApi(process.env.TELEGRAM_BOT_TOKEN || "").call("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  // The description never carries the token (bot-v2/telegram.ts).
  if (!sent.ok) console.warn(`[account-delete] Telegram refused the code: ${sent.errorCode}`);
  return sent.ok;
}

async function sendEmailLetter(to: string, letter: DeleteCodeEmail): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const { Resend } = await import("resend");
    const sent = await new Resend(apiKey).emails.send({ from: letter.from, to, subject: letter.subject, html: letter.html });
    // Resend reports a refused letter in the result, not by throwing.
    if (sent.error) {
      console.warn(`[account-delete] Resend refused the letter: ${sent.error.name}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[account-delete] e-mail send failed:", err instanceof Error ? err.name : "error");
    return false;
  }
}

export function defaultAccountDeleteDeps(): AccountDeleteDeps {
  return {
    sendTelegram: sendTelegramHtml,
    sendEmail: sendEmailLetter,
    notifyOwner: async (html) => {
      await alertAdmin(html);
    },
    deleteDevice: (userId, uuid) => deleteOwnProfile(userId, uuid),
    newCode: secureCode6,
    now: () => Date.now(),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type Channel = { readonly kind: "telegram"; readonly to: string } | { readonly kind: "email"; readonly to: string };

/**
 * Where the code can go, the account's own kind first: an e-mail account gets
 * a letter, a Telegram account a message; a linked account falls back to the
 * other one when the first does not deliver.
 */
function channelsOf(userId: string, user: UserRecord | null): Channel[] {
  const tg = userId.startsWith("tg_") ? userId.slice(3) : user?.telegramId;
  const email = userId.startsWith("em_") ? userId.slice(3) : user?.email;
  const telegram: Channel | null = tg && /^\d{1,20}$/.test(tg) ? { kind: "telegram", to: tg } : null;
  const mail: Channel | null = email && email.includes("@") ? { kind: "email", to: email } : null;
  const ordered = userId.startsWith("em_") ? [mail, telegram] : [telegram, mail];
  return ordered.filter((c): c is Channel => c !== null);
}

/** The session of a request and the id it came under (Bearer first, lib/session.ts). */
async function sessionOf(req: NextRequest): Promise<{ sid: string | null; session: Session | null }> {
  const { sid } = sessionIdFromRequest(req);
  if (!sid) return { sid: null, session: null };
  return { sid, session: await getSession(sid) };
}

/** A structured log line without personal data: the account is a hash prefix. */
function logEvent(event: string, userId: string, extra: Record<string, unknown> = {}): void {
  console.info("[account-delete]", JSON.stringify({ event, uid: sha256(userId).slice(0, 12), ...extra }));
}

function json(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function tooMany(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "rate_limited", retryAfter },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}

async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** An account whose id is itself an alias of another is not the one to delete here. */
async function isPrimary(userId: string): Promise<boolean> {
  return (await resolveUserId(userId)) === userId;
}

/** The money a plan deletes, summed: wallet cents, running plans, the furthest end. */
function moneyTotals(money: readonly WipeMoneyEntry[]): { walletCents: number; plans: number; plansUntil: number } {
  let walletCents = 0;
  let plans = 0;
  let plansUntil = 0;
  for (const m of money) {
    walletCents += Math.max(0, Number(m.walletCents) || 0);
    plans += m.runningSubs.length;
    for (const s of m.runningSubs) plansUntil = Math.max(plansUntil, Number(s.expiresAt) || 0);
  }
  return { walletCents, plans, plansUntil };
}

const usd = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

// ─── GET: what would be lost ────────────────────────────────────────────────

export async function handleDeleteStatus(req: NextRequest): Promise<NextResponse> {
  try {
    const { session } = await sessionOf(req);
    if (!session) return json({ error: "unauthorized" }, 401);
    const userId = session.userId;
    const user = await getUserRecord(userId);
    if (!(await accountDeleteEnabled(userId, user))) return json({ enabled: false });

    const [plan, profiles] = await Promise.all([planWipe(userId), getProfiles(userId)]);
    const money = moneyTotals(plan.money);
    return json({
      enabled: true,
      dryRun: isOwnerAccount(userId, user),
      primary: await isPrimary(userId),
      channel: channelsOf(userId, user)[0]?.kind ?? null,
      walletCents: money.walletCents,
      plans: money.plans,
      plansUntil: money.plansUntil,
      devices: profiles.length,
      linked: {
        email: userId.startsWith("em_") || Boolean(user?.email),
        telegram: userId.startsWith("tg_") || Boolean(user?.telegramId),
      },
    });
  } catch (err) {
    console.error("[account-delete] status failed:", err instanceof Error ? err.message : "error");
    return json({ error: "internal" }, 500);
  }
}

// ─── POST /confirm: send the code ───────────────────────────────────────────

export async function handleDeleteCode(req: NextRequest, deps: AccountDeleteDeps): Promise<NextResponse> {
  try {
    const { session } = await sessionOf(req);
    if (!session) return json({ error: "unauthorized" }, 401);
    const userId = session.userId;

    const rl = await rateLimit(`acctdel-code:${userId}`, CODE_SENDS_PER_HOUR, HOUR_SEC);
    if (!rl.ok) return tooMany(rl.retryAfter);
    const user = await getUserRecord(userId);
    if (!(await accountDeleteEnabled(userId, user))) return json({ error: "not_enabled" }, 403);
    if (!(await isPrimary(userId))) return json({ error: "linked_account" }, 409);

    const body = await readBody(req);
    const channels = channelsOf(userId, user);
    if (channels.length === 0) return json({ error: "no_channel" }, 409);

    const code = deps.newCode();
    await storeCode(userId, code, deps.now());
    for (const ch of channels) {
      const delivered =
        ch.kind === "telegram"
          ? await deps.sendTelegram(ch.to, deleteCodeTelegram(body.lang, code))
          : await deps.sendEmail(ch.to, deleteCodeEmail(body.lang, code));
      if (delivered) {
        logEvent("code_sent", userId, { channel: ch.kind });
        return json({ status: "sent", channel: ch.kind });
      }
    }
    await redis.del(deleteCodeKey(userId));
    logEvent("code_undelivered", userId, { channels: channels.map((c) => c.kind) });
    return json({ error: "send_failed" }, 502);
  } catch (err) {
    console.error("[account-delete] code failed:", err instanceof Error ? err.message : "error");
    return json({ error: "internal" }, 500);
  }
}

// ─── POST: delete ───────────────────────────────────────────────────────────

function deletedResponse(status: 200 | 202): NextResponse {
  const res = json({ status: "deleted" }, status);
  clearSessionCookie(res);
  return res;
}

/**
 * Take every device off the panels. Resolves to the uuid of the first device
 * a panel did not let go of, or null when the list is empty. A device that
 * appears while this runs (the lock ran out) is met on the next round.
 */
async function removeDevices(userId: string, deps: AccountDeleteDeps): Promise<{ removed: number; failed: string | null }> {
  let removed = 0;
  for (let round = 0; round < DEVICE_ROUNDS; round++) {
    const profiles = await getProfiles(userId);
    if (profiles.length === 0) return { removed, failed: null };
    for (const p of profiles) {
      const r = await deps.deleteDevice(userId, p.uuid);
      if (r === "panel_failed") return { removed, failed: p.uuid };
      if (r === "deleted") removed++;
    }
  }
  const left = await getProfiles(userId);
  return { removed, failed: left.length === 0 ? null : (left[0]?.uuid ?? null) };
}

export async function handleDelete(req: NextRequest, deps: AccountDeleteDeps): Promise<NextResponse> {
  try {
    const { sid, session } = await sessionOf(req);
    if (!session) {
      // The same request again after it succeeded: its session is gone, the
      // mark of this session id says what happened.
      if (sid && (await redis.get(deleteDoneKey(sid)))) return deletedResponse(200);
      return json({ error: "unauthorized" }, 401);
    }
    const userId = session.userId;

    const rl = await rateLimit(`acctdel:${userId}`, DELETE_ATTEMPTS_PER_HOUR, HOUR_SEC);
    if (!rl.ok) return tooMany(rl.retryAfter);
    const [account, user] = await Promise.all([getAccount(userId), getUserRecord(userId)]);
    if (!(await accountDeleteEnabled(userId, user))) return json({ error: "not_enabled" }, 403);

    const body = await readBody(req);
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!/^\d{6}$/.test(code)) return json({ error: "code_invalid" }, 400);
    if (!(await isPrimary(userId))) return json({ error: "linked_account" }, 409);

    // Deleted already, from a session the deletion did not reach.
    if (!account && !user) {
      if (sid) await destroySession(sid);
      return deletedResponse(200);
    }

    const unlock = await acquireLock(`user:${userId}`, USER_LOCK_TTL_SEC);
    if (!unlock) return json({ error: "busy" }, 409);
    try {
      const check = await checkCode(userId, code, deps.now());
      if (check !== "ok") {
        logEvent("code_rejected", userId, { reason: check });
        return json({ error: check === "expired" ? "code_expired" : "code_invalid" }, 400);
      }

      const first = await planWipe(userId);

      if (isOwnerAccount(userId, user)) {
        await redis.del(deleteCodeKey(userId));
        await audit("account.delete.self.dryrun", { userId, keys: first.redisKeys.length, devices: first.vpnClients.length });
        logEvent("dry_run", userId, { keys: first.redisKeys.length, devices: first.vpnClients.length });
        return json({ status: "dry_run", keys: first.redisKeys.length, devices: first.vpnClients.length });
      }

      const devices = await removeDevices(userId, deps);
      if (devices.failed !== null) {
        // profile-delete.ts has told the owner which panel; the code stays valid.
        logEvent("panel_failed", userId, { removed: devices.removed });
        return json({ error: "panel_failed" }, 502);
      }

      // Read again with no device left: the money is the wipe's own, read
      // under the lock right before the delete; a payment credited since the
      // first look is in it, and the owner is told.
      const plan = await planWipe(userId);
      if (plan.vpnClients.length > 0) return json({ error: "busy" }, 409);
      const moneyChanged = wipeMoneyFingerprint(plan.money) !== wipeMoneyFingerprint(first.money);
      const result = await executeWipe(plan, { deleteFrom3xui: false });
      await redis.del(deleteCodeKey(userId));

      // Every session of the account, and of the Telegram id linked to it
      // (those sessions are listed under that id, lib/session.ts).
      let sessionsEnded = 0;
      for (const id of new Set([userId, ...plan.aliasSources])) sessionsEnded += await revokeUserSessions(id);
      if (sid) {
        await redis.set(deleteDoneKey(sid), "1", { ex: DONE_TTL_SEC });
        await destroySession(sid);
      }

      const money = moneyTotals(plan.money);
      await audit("account.delete.self", {
        userId,
        devicesRemoved: devices.removed,
        redisDeleted: result.redisDeleted,
        walletCents: money.walletCents,
        plans: money.plans,
        moneyChanged,
        sessionsEnded,
      });
      logEvent("deleted", userId, { devices: devices.removed, keys: result.redisDeleted, sessions: sessionsEnded });

      await deps
        .notifyOwner(
          [
            "🗑 <b>Kovra: аккаунт удалён самим пользователем</b>",
            "",
            `<code>${escapeHtml(userId)}</code>`,
            `кошелёк: ${usd(money.walletCents)}, тарифов в силе: ${money.plans}`,
            ...(moneyChanged ? ["⚠️ Деньги изменились во время удаления: пришла оплата или покупка. Проверить платежи и вернуть"] : []),
            `устройств снято с панелей: ${devices.removed}, ключей удалено: ${result.redisDeleted}`,
          ].join("\n"),
        )
        .catch(() => undefined);

      return deletedResponse(202);
    } finally {
      await unlock().catch(() => undefined);
    }
  } catch (err) {
    console.error("[account-delete] delete failed:", err instanceof Error ? err.message : "error");
    return json({ error: "internal" }, 500);
  }
}
