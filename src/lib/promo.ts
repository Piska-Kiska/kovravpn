// src/lib/promo.ts
import { redis } from "./redis";
import { randomBytes } from "crypto";
import { acquireLock } from "./ratelimit";
import { addBalanceCents, usdToCents } from "./bot-wallet";

export interface PromoCode {
  code: string;
  type: "balance";         // credits the USD wallet (balance_usd)
  amount: number;          // USD amount
  maxUses: number;         // 0 = unlimited
  usedCount: number;
  expiresAt: number;       // timestamp, 0 = no expiry
  createdAt: number;
  createdBy: string;       // admin userId
  description: string;     // internal note
}

/** Generate a random promo code */
export function generatePromoCode(length = 8): string {
  return randomBytes(length)
    .toString("base64url")
    .slice(0, length)
    .toUpperCase();
}

/** Create a new promo code */
export async function createPromo(params: {
  code?: string;
  amount: number;
  maxUses?: number;
  expiresInDays?: number;
  description?: string;
  createdBy: string;
}): Promise<PromoCode> {
  const code = (params.code || generatePromoCode()).toUpperCase().trim();

  // Check if already exists
  const existing = await redis.get(`promo:${code}`);
  if (existing) throw new Error(`Промокод ${code} уже существует`);

  const promo: PromoCode = {
    code,
    type: "balance",
    amount: params.amount,
    maxUses: params.maxUses ?? 0,
    usedCount: 0,
    expiresAt: params.expiresInDays
      ? Date.now() + params.expiresInDays * 86400000
      : 0,
    createdAt: Date.now(),
    createdBy: params.createdBy,
    description: params.description || "",
  };

  await redis.set(`promo:${code}`, JSON.stringify(promo));

  // Add to promo index for listing
  await redis.sadd("promo:index", code);

  return promo;
}

/** Get promo code data */
export async function getPromo(code: string): Promise<PromoCode | null> {
  const raw = await redis.get(`promo:${code.toUpperCase().trim()}`);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : (raw as PromoCode);
}

/** Check if user already used this promo */
export async function hasUsedPromo(code: string, userId: string): Promise<boolean> {
  const val = await redis.get(`promo_used:${code.toUpperCase()}:${userId}`);
  return !!val;
}

export type PromoRedeemError =
  | "empty"
  | "not_found"
  | "expired"
  | "used_up"
  | "already_used"
  | "busy"
  | "internal";

export type PromoRedeemResult =
  | { ok: true; code: string; amountCents: number; balanceCents: number }
  | { ok: false; error: PromoRedeemError };

/**
 * Error texts as the cabinet's classifier (lib/server-errors.ts) and the bot
 * have always shown them. `busy` and `internal` are new and in English.
 */
export const PROMO_ERROR_TEXT: Record<PromoRedeemError, string> = {
  empty: "Введите промокод",
  not_found: "Промокод не найден",
  expired: "Промокод истёк",
  used_up: "Промокод исчерпан",
  already_used: "Вы уже использовали этот промокод",
  busy: "Please try again in a moment.",
  internal: "Could not apply the promo code. Try again later.",
};

/** Codes: 3–32 letters, digits, '_' or '-', compared upper-cased. */
const PROMO_CODE_RE = /^[\p{L}\p{N}_-]{3,32}$/u;

/**
 * Redeem a promo code INTO THE WALLET (`balance_usd:{userId}`, USD cents),
 * exactly once per code and user. The one implementation for the bot, the
 * web cabinet and the Mini App.
 *
 * Order, under a per-code lock (so `maxUses` cannot be overrun by a race):
 *   1. check the code (exists, not expired, not used up);
 *   2. claim `promo_used:{code}:{userId}` with SET NX — a second redemption,
 *      or a repeat of this one, stops here;
 *   3. credit the wallet; if the credit fails, the claim is removed, so a code
 *      is never burned without the money;
 *   4. mark the claim credited and count the use.
 * Never throws; every outcome is a typed result.
 */
export async function redeemPromoToWallet(rawCode: unknown, userId: string): Promise<PromoRedeemResult> {
  const code = typeof rawCode === "string" ? rawCode.toUpperCase().trim() : "";
  if (code.length === 0) return { ok: false, error: "empty" };
  if (!PROMO_CODE_RE.test(code)) return { ok: false, error: "not_found" };
  if (typeof userId !== "string" || userId.length === 0 || userId.length > 200) {
    return { ok: false, error: "internal" };
  }

  let unlock: (() => Promise<void>) | null;
  try {
    unlock = await acquireLock(`promo:${code}`, 15);
  } catch (err) {
    console.error("[promo] lock error:", err instanceof Error ? err.message : err);
    return { ok: false, error: "internal" };
  }
  if (!unlock) return { ok: false, error: "busy" };

  try {
    return await redeemLocked(code, userId);
  } catch (err) {
    // Only the reads before the claim can land here: nothing was written.
    console.error("[promo] redeem error:", err instanceof Error ? err.message : err);
    return { ok: false, error: "internal" };
  } finally {
    try {
      await unlock();
    } catch {
      /* the lock expires by TTL */
    }
  }
}

async function redeemLocked(code: string, userId: string): Promise<PromoRedeemResult> {
  const promo = await getPromo(code);
  if (!promo) return { ok: false, error: "not_found" };
  if (promo.expiresAt > 0 && Date.now() > promo.expiresAt) return { ok: false, error: "expired" };
  if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) return { ok: false, error: "used_up" };

  const amountCents = usdToCents(promo.amount);
  if (amountCents === null) {
    console.error(`[promo] code ${code} has an unusable amount: ${promo.amount}`);
    return { ok: false, error: "internal" };
  }

  const usedKey = `promo_used:${code}:${userId}`;
  const claimed = await redis.set(
    usedKey,
    JSON.stringify({ state: "crediting", amountCents, at: Date.now() }),
    { nx: true },
  );
  if (claimed === null) return { ok: false, error: "already_used" };

  let balanceCents: number;
  try {
    balanceCents = await addBalanceCents(userId, amountCents);
  } catch (err) {
    console.error("[promo] wallet credit failed, releasing the code:", err instanceof Error ? err.message : err);
    try {
      await redis.del(usedKey);
    } catch (delErr) {
      console.error(
        `[promo] CODE BURNED WITHOUT CREDIT, needs review: code=${code} user=${userId} cents=${amountCents}:`,
        delErr instanceof Error ? delErr.message : delErr,
      );
    }
    return { ok: false, error: "internal" };
  }

  // Paid. What follows is bookkeeping: a failure is logged, never undone.
  try {
    await redis.set(usedKey, JSON.stringify({ state: "credited", amountCents, at: Date.now() }));
  } catch (err) {
    console.error("[promo] could not mark the claim credited:", err instanceof Error ? err.message : err);
  }
  try {
    const fresh = (await getPromo(code)) ?? promo;
    fresh.usedCount += 1;
    await redis.set(`promo:${code}`, JSON.stringify(fresh));
  } catch (err) {
    console.error("[promo] could not count the use:", err instanceof Error ? err.message : err);
  }
  console.info(JSON.stringify({ evt: "wallet.promo_credit", code, userId, amountCents, balanceCents }));
  return { ok: true, code, amountCents, balanceCents };
}

/** List all promo codes (admin) */
export async function listPromos(): Promise<PromoCode[]> {
  const codes = await redis.smembers("promo:index");
  if (!codes || codes.length === 0) return [];

  const promos: PromoCode[] = [];
  for (const code of codes) {
    const promo = await getPromo(String(code));
    if (promo) promos.push(promo);
  }

  return promos.sort((a, b) => b.createdAt - a.createdAt);
}

/** Delete a promo code (admin) */
export async function deletePromo(code: string): Promise<void> {
  const normalized = code.toUpperCase().trim();
  await redis.del(`promo:${normalized}`);
  await redis.srem("promo:index", normalized);
}
