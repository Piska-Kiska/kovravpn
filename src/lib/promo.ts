// src/lib/promo.ts
import { redis } from "./redis";
import { randomBytes } from "crypto";

export interface PromoCode {
  code: string;
  type: "balance";         // credits ₽ to balance
  amount: number;          // ₽ amount
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

/** Validate and redeem a promo code. Returns amount credited or throws. */
export async function redeemPromo(
  code: string,
  userId: string
): Promise<{ amount: number; description: string }> {
  const normalized = code.toUpperCase().trim();
  const promo = await getPromo(normalized);

  if (!promo) throw new Error("Промокод не найден");
  if (promo.expiresAt > 0 && Date.now() > promo.expiresAt) throw new Error("Промокод истёк");
  if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) throw new Error("Промокод исчерпан");

  const used = await hasUsedPromo(normalized, userId);
  if (used) throw new Error("Вы уже использовали этот промокод");

  // Mark as used
  await redis.set(`promo_used:${normalized}:${userId}`, "1");

  // Increment counter
  promo.usedCount += 1;
  await redis.set(`promo:${normalized}`, JSON.stringify(promo));

  return { amount: promo.amount, description: promo.description };
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
