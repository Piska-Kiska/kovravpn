// src/lib/accounts.ts
import { redis } from "./redis";
import { randomBytes } from "crypto";
import { isHappEncryptedEnabled } from "./feature-flags";

export interface UserAccount {
  plan: "free" | "active" | "base" | "optimal" | "max";
  maxProfiles: number;
  extraProfiles: number;
  paidUntil: number;
  createdAt: number;
  balance?: number;
  balanceUpdatedAt?: number;
}

export interface VpnProfile {
  uuid: string;
  clientEmail: string;
  vlessUrl: string;
  createdAt: number;
  deviceType?: string;
  subToken?: string;
}

const PLAN_LIMITS: Record<string, number> = {
  free: 1,
  base: 3,
  optimal: 3,
  max: 3,
};

export async function getAccount(userId: string): Promise<UserAccount | null> {
  const raw = await redis.get(`account:${userId}`);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw as UserAccount;
}

export const WELCOME_BONUS = 0;          // no free balance
export const WELCOME_BONUS_REFERRED = 0; // referral bonus comes from referrer reward, not welcome

export async function createAccount(
  userId: string,
  plan: UserAccount["plan"] = "active",
  welcomeBonus?: number
): Promise<UserAccount> {
  const bonus = welcomeBonus ?? WELCOME_BONUS;
  const account: UserAccount = {
    plan: plan === "free" ? "active" : plan,
    maxProfiles: 100,
    extraProfiles: 0,
    paidUntil: 0,
    createdAt: Date.now(),
    balance: bonus,
    balanceUpdatedAt: Date.now(),
  };
  await redis.set(`account:${userId}`, JSON.stringify(account));
  return account;
}

export async function getProfiles(userId: string): Promise<VpnProfile[]> {
  const raw = await redis.get(`profiles:${userId}`);
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw as VpnProfile[];
}

export async function addProfile(userId: string, profile: VpnProfile): Promise<void> {
  const profiles = await getProfiles(userId);
  profiles.push(profile);
  await redis.set(`profiles:${userId}`, JSON.stringify(profiles));
}

export async function removeProfile(userId: string, uuid: string): Promise<void> {
  const profiles = await getProfiles(userId);
  const removed = profiles.find((p) => p.uuid === uuid);
  const filtered = profiles.filter((p) => p.uuid !== uuid);
  await redis.set(`profiles:${userId}`, JSON.stringify(filtered));

  // Revoke Hysteria2 access immediately (auth: http checks hy2:<uuid> per-connect)
  try {
    await redis.del(`hy2:${uuid}`);
  } catch (err) {
    console.error("[removeProfile] failed to clean hy2 index:", err);
  }

  // Clean orphaned subscription tokens — otherwise sub_prof:<token> stays
  // in Redis pointing to a deleted profile, and /api/sub/<token>* returns 404
  // ("Profile not found"). This caused Happ "ошибка 39" reports.
  if (removed?.subToken) {
    try {
      await redis.del(`sub_prof:${removed.subToken}`);
      // Clear the HWID binding so the freed link can bind a new device later,
      // and flag the token so the client shows a "removed" notice (30d) rather
      // than a stale 404 if it keeps polling.
      await redis.del(`sub:${removed.subToken}:hwid`);
      await redis.set(`sub_deleted:${removed.subToken}`, userId, {
        ex: 30 * 24 * 60 * 60,
      });
    } catch (err) {
      console.error("[removeProfile] failed to clean sub_prof:", err);
    }
  }
}

export function getProfileLimit(_account: UserAccount): number {
  return 100;
}

/** Resolve alias to primary userId. Returns candidateId if no alias found. */
export async function resolveUserId(candidateId: string): Promise<string> {
  const aliased = await redis.get(`alias:${candidateId}`);
  if (aliased && typeof aliased === "string") return aliased;
  return candidateId;
}

export interface UserRecord {
  passwordHash?: string;
  authMethod: string;
  email?: string;
  telegramId?: string;
  createdAt: number;
  // Telegram identity cache (updated on every bot interaction).
  // Kept in UserRecord so it persists across auth methods.
  tgUsername?: string;           // lowercase, без '@'
  tgFirstName?: string;
  tgLastName?: string;
  tgIdentityUpdatedAt?: number;  // unix ms
  lang?: string;                 // bot UI language (en|ru|es|de|fr)
}

/** Get parsed user record */
export async function getUserRecord(userId: string): Promise<UserRecord | null> {
  const raw = await redis.get(`user:${userId}`);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : (raw as UserRecord);
}

/** Save user record */
export async function saveUserRecord(userId: string, record: UserRecord): Promise<void> {
  await redis.set(`user:${userId}`, JSON.stringify(record));
}

/** Create alias: identity → primaryUserId */
export async function createAlias(identity: string, primaryUserId: string): Promise<void> {
  await redis.set(`alias:${identity}`, primaryUserId);
}

/** Check if user has ever topped up */
export async function hasTopup(userId: string): Promise<boolean> {
  const val = await redis.get(`has_topup:${userId}`);
  return !!val;
}

/** Mark user as having topped up */
export async function markTopup(userId: string): Promise<void> {
  await redis.set(`has_topup:${userId}`, "1");
}


/** Get or create subscription token for user */
export async function getOrCreateSubToken(userId: string): Promise<string> {
  const existing = await redis.get(`sub_token_of:${userId}`);
  if (existing) return String(existing);
  const token = randomBytes(16).toString("hex");
  await redis.set(`sub_token:${token}`, userId);
  await redis.set(`sub_token_of:${userId}`, token);
  return token;
}

/** Build subscription URL. If userId enabled for encrypted-Happ rollout,
 *  returns the deep-link import page; otherwise the plain endpoint. */
export function getSubUrl(token: string, userId?: string | null): string {
  if (isHappEncryptedEnabled(userId)) {
    return `https://kovravpn.com/p/${token}`;
  }
  return `https://kovravpn.com/api/sub/${token}`;
}

/** Generate per-profile subscription token and store mapping */
export async function createProfileSubToken(userId: string, uuid: string): Promise<string> {
  const token = randomBytes(16).toString("hex");
  await redis.set(`sub_prof:${token}`, JSON.stringify({ userId, uuid }));
  return token;
}

/**
 * Get the profile's per-profile subscription token.
 * Lazily creates and persists one if the profile was made before
 * per-profile tokens existed.
 */
export async function ensureProfileSubToken(userId: string, uuid: string): Promise<string> {
  const profiles = await getProfiles(userId);
  const idx = profiles.findIndex((p) => p.uuid === uuid);
  if (idx === -1) throw new Error("Profile not found");
  const existing = profiles[idx].subToken;
  if (existing) return existing;
  const token = await createProfileSubToken(userId, uuid);
  profiles[idx] = { ...profiles[idx], subToken: token };
  await redis.set(`profiles:${userId}`, JSON.stringify(profiles));
  return token;
}

/** Device type display names */
export const DEVICE_NAMES: Record<string, string> = {
  android: "Android",
  iphone: "iPhone",
  iphone_ru: "iPhone",
  mac: "Mac",
  mac_ru: "Mac",
  windows: "Windows",
  tv: "Apple TV",
};

/** Get device display name with counter for duplicates */
export function getDeviceLabel(profiles: VpnProfile[], index: number): string {
  const p = profiles[index];
  const type = p.deviceType || "";
  const name = DEVICE_NAMES[type] || "Устройство";
  // Count how many of same type before this one
  const sameTypeBefore = profiles.slice(0, index).filter(x => (x.deviceType || "") === type).length;
  const sameTypeTotal = profiles.filter(x => (x.deviceType || "") === type).length;
  if (sameTypeTotal > 1) return `${name} ${sameTypeBefore + 1}`;
  return name;
}

// ─── Telegram identity sync (support/lookup) ────────────────────────────

export interface TelegramIdentity {
  username?: string;
  first_name?: string;
  last_name?: string;
}

/**
 * Upsert Telegram identity into UserRecord + maintain `username:{name}→userId` index.
 *
 * Contract:
 *   - Idempotent: identical data skips Redis writes.
 *   - Creates minimal UserRecord if missing (authMethod='telegram').
 *   - Normalises username: strips '@', lowercases, trims.
 *   - On username rename: del old index, set new (last-write-wins ok).
 *
 * Caller MUST pass a userId already resolved via resolveUserId(), so
 * aliased accounts don't create ghost UserRecords.
 */
export async function syncTelegramIdentity(
  userId: string,
  tg: TelegramIdentity,
): Promise<void> {
  const next = {
    username: normaliseUsername(tg.username),
    firstName: emptyToUndef(tg.first_name),
    lastName: emptyToUndef(tg.last_name),
  };

  const existing =
    (await getUserRecord(userId)) ??
    ({ authMethod: "telegram", createdAt: Date.now() } as UserRecord);

  const unchanged =
    existing.tgUsername === next.username &&
    existing.tgFirstName === next.firstName &&
    existing.tgLastName === next.lastName &&
    existing.tgIdentityUpdatedAt !== undefined;
  if (unchanged) return;

  const prevUsername = existing.tgUsername;

  const updated: UserRecord = {
    ...existing,
    tgUsername: next.username,
    tgFirstName: next.firstName,
    tgLastName: next.lastName,
    tgIdentityUpdatedAt: Date.now(),
  };
  await saveUserRecord(userId, updated);

  // Maintain secondary index username → userId
  if (prevUsername && prevUsername !== next.username) {
    await redis.del(`username:${prevUsername}`);
  }
  if (next.username) {
    await redis.set(`username:${next.username}`, userId);
  }
}

/**
 * Reverse lookup: '@alice' / 'Alice' / 'alice' → primary userId.
 * Case-insensitive, strips leading '@'. Returns null if not found.
 */
export async function lookupUserIdByUsername(
  rawUsername: string,
): Promise<string | null> {
  const name = normaliseUsername(rawUsername);
  if (!name) return null;
  const value = await redis.get(`username:${name}`);
  return typeof value === "string" ? value : null;
}

/** Human-readable display label: '@alice (Алиса Иванова)' or '—' if empty. */
export function formatTelegramIdentity(rec: UserRecord | null): string {
  if (!rec) return "—";
  const parts: string[] = [];
  if (rec.tgUsername) parts.push(`@${rec.tgUsername}`);
  const name = [rec.tgFirstName, rec.tgLastName].filter(Boolean).join(" ");
  if (name) parts.push(`(${name})`);
  return parts.length > 0 ? parts.join(" ") : "—";
}

function normaliseUsername(s?: string): string | undefined {
  if (!s) return undefined;
  const trimmed = s.trim().replace(/^@/, "").toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

function emptyToUndef(s?: string): string | undefined {
  const v = s?.trim();
  return v && v.length > 0 ? v : undefined;
}


/** Get stored bot UI language for a user (null if unset). */
export async function getUserLang(userId: string): Promise<string | null> {
  const rec = await getUserRecord(userId);
  return rec?.lang ?? null;
}

/** Persist bot UI language choice. Creates a minimal record if missing. */
export async function setUserLang(userId: string, lang: string): Promise<void> {
  const rec =
    (await getUserRecord(userId)) ??
    ({ authMethod: "telegram", createdAt: Date.now() } as UserRecord);
  rec.lang = lang;
  await saveUserRecord(userId, rec);
}
