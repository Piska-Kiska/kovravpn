// src/lib/admin-ops.ts
//
// Pure admin operations: account lookup, account linking, account wipe.
//
// Design notes:
// - All mutations log a structured audit entry under audit:{ts}:{op}, TTL 30 days,
//   so we can post-mortem any incident without scanning the whole DB.
// - Wipe keys are derived from a single canonical list (PER_USER_PREFIXES),
//   plus reverse-index sweeps for sub_token / sub_prof / ref_lookup.
// - We never silently delete cross-references: if alias points elsewhere or
//   profiles still exist in 3X-UI, caller must opt-in via WipeOptions.
//
// Key prefixes mirror what's actually used in the codebase as of 2026-05-02.
// Source of truth: KEYS * audit on the live DB + grep over src/.

import { redis } from "./redis";
import {
  getAccount,
  getProfiles,
  getUserRecord,
  saveUserRecord,
  resolveUserId,
  lookupUserIdByUsername,
  type UserRecord,
  type UserAccount,
  type VpnProfile,
} from "./accounts";
import { getActiveInbound } from "./xpanel";
import { deleteClientSync } from "./xpanel-sync";
import { acquireLock } from "./ratelimit";
import { syncAllExpiry } from "./balance";
import { getBalanceCents } from "./bot-wallet";
import { moveMoney, type MoveResult } from "./tg-link-merge";

// ─── Lookup ──────────────────────────────────────────────────────────────────

export interface UserSnapshot {
  userId: string;          // primary, post-alias-resolution
  candidateId: string;     // what was passed in
  account: UserAccount | null;
  user: UserRecord | null;
  profiles: VpnProfile[];
  /** The real balance: `balance_usd:{userId}` in integer cents (lib/bot-wallet.ts). */
  walletCents: number;
  resolvedVia: "alias" | "direct" | "username";
}

/**
 * Resolve any identifier to a user snapshot.
 *
 * Accepts:
 *   - email-like:           "user@example.com"           → em_user@example.com
 *   - prefixed userId:      "em_x@y.com" / "tg_12345"    → as-is
 *   - bare numeric TG ID:   "12345" / "  12345  "        → tg_12345
 *   - @username / username: "@alice" / "alice"           → username:* index
 *
 * Returns null if absolutely nothing matches.
 */
export async function findUser(rawInput: string): Promise<UserSnapshot | null> {
  const input = rawInput.trim();
  if (!input || input.length < 2) return null;
  if (input.length > 200) return null; // sanity cap

  let candidate: string | null = null;
  let resolvedVia: UserSnapshot["resolvedVia"] = "direct";

  // 1. Already prefixed — but reject bare prefix only ("em_" / "tg_")
  if (input.startsWith("em_") && input.length > 3) {
    candidate = input;
  }
  else if (input.startsWith("tg_") && input.length > 3) {
    candidate = input;
  }
  // 2. Email
  else if (input.includes("@") && input.includes(".")) {
    candidate = `em_${input.toLowerCase()}`;
  }
  // 3. Pure digits → TG ID
  else if (/^\d+$/.test(input)) {
    candidate = `tg_${input}`;
  }
  // 4. Username (optionally with @)
  else {
    const viaUsername = await lookupUserIdByUsername(input);
    if (viaUsername) {
      candidate = viaUsername;
      resolvedVia = "username";
    }
  }

  if (!candidate) return null;

  const resolved = await resolveUserId(candidate);
  if (resolved !== candidate && resolvedVia === "direct") {
    resolvedVia = "alias";
  }

  const [account, user, profiles, walletCents] = await Promise.all([
    getAccount(resolved),
    getUserRecord(resolved),
    getProfiles(resolved),
    getBalanceCents(resolved),
  ]);

  // No data at all under that userId → not found
  if (!account && !user && profiles.length === 0 && walletCents <= 0) return null;

  return {
    userId: resolved,
    candidateId: candidate,
    account,
    user,
    profiles,
    walletCents,
    resolvedVia,
  };
}

// ─── Linking ─────────────────────────────────────────────────────────────────

export interface LinkResult {
  success: boolean;
  primaryUserId: string;
  telegramId: string;
  removedEmptyStandalone: boolean;
  /** Wallet cents moved from the standalone tg_ account to the primary. */
  movedCents?: number;
  /** Running subscriptions moved from the standalone tg_ account. */
  movedSubs?: number;
  reason?: string;
}

// ─── Moving what a standalone Telegram account paid for ─────────────────────
//
// A tg_ account without devices can still hold money: the USD wallet the bot
// and the Mini App top up (`balance_usd:tg_X`) and plans bought from it
// (`subs:tg_X`). Linking points alias:tg_X at the primary, after which nothing
// ever reads tg_X again, so both move to the primary first.
//
// The whole link runs under the wallet locks of both accounts (the ones
// purchaseFromWallet takes), so no purchase from either wallet and no second
// link interleaves. The move itself is lib/tg-link-merge.ts: one atomic
// script under the subscription locks of both accounts, so a failure leaves
// both accounts as they were (or, when the reply is lost, fully moved: the
// same link again finishes without doubling anything). Every step is in the
// audit log.

type MoveOutcome =
  | { ok: true; cents: number; subs: number }
  | { ok: false; reason: "busy" | "failed" };

/** Upper bound on one link, the wait for a subscription lock included. */
const LINK_LOCK_TTL_SEC = 30;

export interface LinkDeps {
  /** Push the primary's expiry to the panels once subscriptions moved in. */
  syncExpiry(userId: string): Promise<void>;
  /** How long the move waits for a grant that holds a subscription lock. */
  subsLockWaitMs: number;
}

const defaultLinkDeps: LinkDeps = { syncExpiry: syncAllExpiry, subsLockWaitMs: 3_000 };

async function moveWalletAndSubs(from: string, to: string, lockWaitMs: number): Promise<MoveOutcome> {
  let result: MoveResult;
  try {
    result = await moveMoney(from, to, {
      lockWaitMs,
      beforeMove: (plan) => audit("merge_start", { from, to, cents: plan.cents, subs: plan.subs }),
    });
  } catch (err) {
    // Redis failed: the script ran completely or not at all. Linking the
    // same pair again moves what is still on tg_X, and nothing twice.
    console.error(`[admin-ops] merge: move failed, link again to finish: from=${from}:`, errMsg(err));
    await audit("merge_failed", { from, to, step: "script", error: errMsg(err) });
    return { ok: false, reason: "failed" };
  }
  if (!result.ok) {
    await audit("merge_failed", { from, to, step: result.reason, detail: result.detail });
    return { ok: false, reason: result.reason === "busy" ? "busy" : "failed" };
  }
  if (result.movedCents > 0 || result.movedSubs > 0) {
    await audit("merge_done", { from, to, cents: result.movedCents, subs: result.movedSubs });
  }
  return { ok: true, cents: result.movedCents, subs: result.movedSubs };
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function releaseLock(unlock: () => Promise<void>): Promise<void> {
  try {
    await unlock();
  } catch (err) {
    // The lock expires by its TTL anyway.
    console.warn("[admin-ops] unlock failed:", errMsg(err));
  }
}

/**
 * Manually link a Telegram ID to a primary userId (typically email-based).
 *
 * Steps:
 *   1. Refuse linking tg_X to itself.
 *   2. Lock both wallets for the whole link (see the section header).
 *   3. Validate primary exists.
 *   4. If alias:tg_X exists pointing elsewhere → refuse (would orphan another acc).
 *   5. If standalone tg_X account exists:
 *        - without devices (legacy balance=0, paidUntil=0, no profiles) →
 *          its USD wallet and running plans move to the primary
 *          (lib/tg-link-merge.ts), then its keys are wiped;
 *        - with devices → refuse, ask admin to use full merge flow (TODO)
 *      The move runs even with no account record (a wallet can exist on its
 *      own) and on a repeated link of the same pair, which sweeps money that
 *      reached tg_X after the first one.
 *   6. Create alias:tg_X → primary.
 *   7. Patch user record: telegramId, authMethod="linked", username index.
 *   8. When subscriptions moved, push the primary's expiry to the panels.
 */
export async function linkTelegramToPrimary(
  primaryUserId: string,
  telegramId: string,
  options: { force?: boolean } = {},
  overrides: Partial<LinkDeps> = {},
): Promise<LinkResult> {
  const deps: LinkDeps = { ...defaultLinkDeps, ...overrides };
  const refuse = (reason: string): LinkResult => ({
    success: false,
    primaryUserId,
    telegramId,
    removedEmptyStandalone: false,
    reason,
  });

  // Validate Telegram ID: must be a positive integer string.
  if (!/^\d{1,20}$/.test(telegramId)) {
    return refuse(`Invalid Telegram ID format: ${telegramId}`);
  }

  const tgUserId = `tg_${telegramId}`;
  // Linking tg_X to itself would wipe the account it is linking to.
  if (primaryUserId === tgUserId) {
    return refuse(`Cannot link ${tgUserId} to itself`);
  }

  const unlockTg = await acquireLock(`wallet:${tgUserId}`, LINK_LOCK_TTL_SEC);
  if (!unlockTg) return refuse(`Wallet of tg_${telegramId} is busy, try again`);
  const unlockPrimary = await acquireLock(`wallet:${primaryUserId}`, LINK_LOCK_TTL_SEC).catch(() => null);
  if (!unlockPrimary) {
    await releaseLock(unlockTg);
    return refuse(`Wallet of tg_${telegramId} is busy, try again`);
  }

  let result: LinkResult;
  try {
    result = await linkLocked(primaryUserId, telegramId, options, refuse, deps.subsLockWaitMs);
  } finally {
    await releaseLock(unlockPrimary);
    await releaseLock(unlockTg);
  }

  // The primary may now run longer than its devices' panel expiry says.
  if (result.success && (result.movedSubs ?? 0) > 0) {
    try {
      await deps.syncExpiry(primaryUserId);
    } catch (err) {
      console.error("[admin-ops] expiry sync after link failed:", errMsg(err));
    }
  }
  return result;
}

/** Body of linkTelegramToPrimary; runs with both wallets locked. */
async function linkLocked(
  primaryUserId: string,
  telegramId: string,
  options: { force?: boolean },
  refuse: (reason: string) => LinkResult,
  subsLockWaitMs: number,
): Promise<LinkResult> {
  const tgUserId = `tg_${telegramId}`;

  const primary = await getUserRecord(primaryUserId);
  if (!primary) {
    return refuse(`Primary user ${primaryUserId} not found`);
  }

  // Existing alias check
  const existingAlias = await redis.get(`alias:${tgUserId}`);
  if (existingAlias && existingAlias !== primaryUserId && !options.force) {
    return refuse(`Telegram ${telegramId} already aliased to ${existingAlias}`);
  }

  // Standalone tg_X account check
  let removedEmpty = false;
  const standaloneAcc = await getAccount(tgUserId);
  const standaloneUser = await getUserRecord(tgUserId);
  const standaloneProfiles = await getProfiles(tgUserId);

  const hasRecords = standaloneAcc !== null || standaloneUser !== null || standaloneProfiles.length > 0;
  if (hasRecords) {
    const isEmpty =
      (!standaloneAcc ||
        ((standaloneAcc.balance || 0) === 0 &&
          (standaloneAcc.paidUntil || 0) === 0)) &&
      standaloneProfiles.length === 0;

    if (!isEmpty && !options.force) {
      return refuse(
        `Standalone tg_${telegramId} has data ` +
          `(balance=${standaloneAcc?.balance ?? 0}, ` +
          `paidUntil=${standaloneAcc?.paidUntil ?? 0}, ` +
          `profiles=${standaloneProfiles.length}). Use force or merge.`,
      );
    }
  }

  // What tg_X paid for (its USD wallet and running plans) moves first, even
  // without an account record: a wallet can exist on its own. A move that
  // cannot finish leaves both accounts as they were and refuses the link.
  const move = await moveWalletAndSubs(tgUserId, primaryUserId, subsLockWaitMs);
  if (!move.ok) {
    return refuse(
      move.reason === "busy"
        ? `Wallet of tg_${telegramId} is busy, try again`
        : `Could not move the wallet of tg_${telegramId}`,
    );
  }
  const movedCents = move.cents;
  const movedSubs = move.subs;

  if (hasRecords) {
    // Empty (or forced) — wipe just the standalone Redis footprint, no 3X-UI
    // calls needed because profiles.length === 0 (or we're force-ing past data
    // that the admin explicitly approved). balance_usd and subs are not in the
    // list: they were moved above, and a credit that lands on tg_X later must
    // stay recoverable by linking again.
    await wipeUserKeys(tgUserId, standaloneUser?.tgUsername);
    removedEmpty = true;
  }

  // Create alias and patch primary user record
  await redis.set(`alias:${tgUserId}`, primaryUserId);

  const patched: UserRecord = {
    ...primary,
    telegramId,
    authMethod: primary.passwordHash ? "linked" : primary.authMethod,
  };
  await saveUserRecord(primaryUserId, patched);

  // If standalone had a username, re-point the username index
  if (standaloneUser?.tgUsername) {
    await redis.set(`username:${standaloneUser.tgUsername}`, primaryUserId);
  }

  await audit("link", {
    primaryUserId,
    telegramId,
    removedEmptyStandalone: removedEmpty,
    movedCents,
    movedSubs,
    forced: options.force === true,
  });

  return {
    success: true,
    primaryUserId,
    telegramId,
    removedEmptyStandalone: removedEmpty,
    movedCents,
    movedSubs,
  };
}

// ─── Wipe ────────────────────────────────────────────────────────────────────

export interface WipeOptions {
  /** Also delete VPN clients from 3X-UI panel. Default: false. */
  deleteFrom3xui?: boolean;
  /** Skip confirmation (no-op here, contract for callers). */
  force?: boolean;
}

export interface WipePlan {
  userId: string;
  redisKeys: string[];
  vpnClients: { uuid: string; clientEmail: string }[];
  aliasSources: string[]; // identities that alias TO this userId (e.g. tg_X → em_Y)
}

/**
 * Compute, but do NOT execute, the full deletion plan for a userId.
 * Useful for confirmation UIs.
 */
export async function planWipe(userId: string): Promise<WipePlan> {
  const profiles = await getProfiles(userId);
  const user = await getUserRecord(userId);

  // Direct per-user keys
  const directKeys = [
    `account:${userId}`,
    `user:${userId}`,
    `profiles:${userId}`,
    `alias:${userId}`, // sometimes the userId itself is aliased (rare, but possible)
    `has_topup:${userId}`,
    `ref_code:${userId}`,
    `ref_by:${userId}`,
    `ref_list:${userId}`,
    `sub_token_of:${userId}`,
    `expiry_notified_1d:${userId}`,
    `expiry_notified_expired:${userId}`,
  ];

  // Username index
  if (user?.tgUsername) {
    directKeys.push(`username:${user.tgUsername}`);
  }

  // Reverse indices: sub_token:{TOKEN} → userId, ref_lookup:{CODE} → userId
  // Only collect ones that point to OUR userId.
  const subTokenKey = await redis.get<string | null>(`sub_token_of:${userId}`);
  if (subTokenKey && typeof subTokenKey === "string") {
    directKeys.push(`sub_token:${subTokenKey}`);
  }

  const refCode = await redis.get<string | null>(`ref_code:${userId}`);
  if (refCode && typeof refCode === "string") {
    directKeys.push(`ref_lookup:${refCode}`);
  }

  // Per-profile sub tokens
  for (const p of profiles) {
    if (p.subToken) {
      directKeys.push(`sub_prof:${p.subToken}`);
    }
  }

  // Aliases pointing TO this userId (cheap: we already have the candidates)
  const aliasSources: string[] = [];
  if (user?.telegramId) {
    aliasSources.push(`tg_${user.telegramId}`);
    directKeys.push(`alias:tg_${user.telegramId}`);
  }
  if (user?.email) {
    aliasSources.push(`em_${user.email}`);
    directKeys.push(`alias:em_${user.email}`);
  }

  // VPN clients in 3X-UI
  const vpnClients = profiles.map((p) => ({
    uuid: p.uuid,
    clientEmail: p.clientEmail,
  }));

  return {
    userId,
    redisKeys: dedupe(directKeys),
    vpnClients,
    aliasSources,
  };
}

/**
 * Execute the wipe plan. Returns counts for reporting.
 *
 * Failure mode: if 3X-UI deletion fails for one client, we log and continue —
 * better to leave one orphan in the panel than to abort and leave inconsistent
 * Redis state. Admin can clean stragglers in the panel manually.
 */
export async function executeWipe(
  plan: WipePlan,
  options: WipeOptions = {},
): Promise<{ redisDeleted: number; vpnDeleted: number; vpnFailed: number }> {
  let vpnDeleted = 0;
  let vpnFailed = 0;

  if (options.deleteFrom3xui && plan.vpnClients.length > 0) {
    try {
      const inbound = await getActiveInbound();
      for (const client of plan.vpnClients) {
        try {
          await deleteClientSync(inbound.id, client.uuid);
          vpnDeleted++;
        } catch (err) {
          vpnFailed++;
          console.warn(
            `[admin-ops] 3X-UI delete failed for ${client.uuid}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } catch (err) {
      console.warn("[admin-ops] could not load active inbound:", err);
      vpnFailed = plan.vpnClients.length;
    }
  }

  // Redis: parallel DEL is safe (Upstash supports MGET-style batching, but we
  // keep it simple and let the SDK pipeline if it wants).
  const delResults = await Promise.all(plan.redisKeys.map((k) => redis.del(k)));
  const redisDeleted = delResults.reduce((sum, n) => sum + Number(n || 0), 0);

  await audit("wipe", {
    userId: plan.userId,
    redisDeleted,
    vpnDeleted,
    vpnFailed,
    deleteFrom3xui: options.deleteFrom3xui === true,
  });

  return { redisDeleted, vpnDeleted, vpnFailed };
}

/**
 * Internal: low-level wipe of just per-user keys, no 3X-UI, no audit.
 * Used by linkTelegramToPrimary when clearing an empty standalone account.
 */
async function wipeUserKeys(userId: string, tgUsername?: string): Promise<void> {
  const keys = [
    `account:${userId}`,
    `user:${userId}`,
    `profiles:${userId}`,
    `has_topup:${userId}`,
    `ref_code:${userId}`,
    `ref_by:${userId}`,
    `ref_list:${userId}`,
    `sub_token_of:${userId}`,
    `expiry_notified_1d:${userId}`,
    `expiry_notified_expired:${userId}`,
  ];
  if (tgUsername) keys.push(`username:${tgUsername}`);
  await Promise.all(keys.map((k) => redis.del(k)));
}

// ─── Audit ───────────────────────────────────────────────────────────────────

const AUDIT_TTL_SECONDS = 30 * 24 * 60 * 60;

async function audit(op: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const entry = JSON.stringify({ op, ts: Date.now(), ...payload });
    const key = `audit:${Date.now()}:${op}`;
    await redis.set(key, entry, { ex: AUDIT_TTL_SECONDS });
  } catch (err) {
    // Never fail the admin op because of audit log issues.
    console.warn("[admin-ops] audit write failed:", err);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
