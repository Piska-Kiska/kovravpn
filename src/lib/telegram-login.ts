// src/lib/telegram-login.ts
//
// Sign-in with Telegram: turn a confirmed Telegram id into a userId with an
// account.
//
// Shared by both ways a Telegram identity is confirmed:
//   • the site's 6-char code confirmed in the bot (/api/auth/telegram/verify);
//   • a Mini App initData signature (/api/auth/telegram/miniapp).
// Two copies of this would drift apart on the first fix, and one of the two
// entrances would start losing referrals or creating empty accounts.
//
// No session, no cookie and no code cleanup here: the caller decides those,
// because the site and the Mini App hand out sessions differently.

import { redis } from "./redis";
import { ensureAccount, resolveUserId } from "./accounts";
import { getReferrer, recordReferral, resolveReferralCode } from "./referrals";

export interface TelegramLoginInput {
  /**
   * Telegram user id. The site gets it from `auth:<code>`, where the bot
   * stores a NUMBER (tryAuth in the webhook); the Mini App from initData,
   * where `user.id` is a number too. Both give the same `tg_<id>` key; the
   * `user:` record keeps the value as it came, as /verify always did.
   */
  telegramId: string | number;
  /** Referral code carried by the site's sign-in code (`/register?ref=`). */
  ref?: string | null;
}

export interface TelegramLoginResult {
  userId: string;
  /** No account existed before this login; a pending referral was applied now. */
  isNewUser: boolean;
}

/** Telegram ids are positive integers; anything else never reaches Redis keys. */
export function isTelegramId(v: unknown): v is string | number {
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0;
  return typeof v === "string" && /^[1-9][0-9]{0,15}$/.test(v);
}

/** Referral codes are short hex/alnum tokens (lib/referrals.ts). */
const REF_CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** A value that can be a referral code (lib/referrals.ts makes 8 hex chars). */
export function isReferralCode(v: unknown): v is string {
  return typeof v === "string" && REF_CODE_RE.test(v);
}

/**
 * Find or create the user for a confirmed Telegram id and apply a pending
 * referral. Same keys and order as /verify had: alias → `user:` → `account:`
 * → referral (the code's `ref` first, then `pending_ref` from the bot's
 * `/start ref_…`), referral only for a NEW account.
 */
export async function loginWithTelegram(input: TelegramLoginInput): Promise<TelegramLoginResult> {
  const { telegramId } = input;
  if (!isTelegramId(telegramId)) throw new Error("loginWithTelegram: invalid telegramId");

  const userId = await resolveUserId(`tg_${telegramId}`);

  // Minimal user record on first contact. NX: never overwrite a record the
  // bot (identity sync, language) or an e-mail sign-up already wrote.
  await redis.set(
    `user:${userId}`,
    JSON.stringify({ authMethod: "telegram", telegramId, createdAt: Date.now() }),
    { nx: true },
  );

  const { created: isNewUser } = await ensureAccount(userId, "free");

  if (isNewUser) {
    let refCode: string | null = null;
    if (isReferralCode(input.ref)) refCode = input.ref;
    if (!refCode) {
      const pending = await redis.get(`pending_ref:${telegramId}`);
      if (pending !== null && pending !== undefined) {
        refCode = String(pending);
        await redis.del(`pending_ref:${telegramId}`);
      }
    }
    if (refCode) {
      const referrerId = await resolveReferralCode(refCode);
      if (referrerId && referrerId !== userId && !(await getReferrer(userId))) {
        await recordReferral(referrerId, userId);
      }
    }
  }

  return { userId, isNewUser };
}
