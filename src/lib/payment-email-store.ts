// src/lib/payment-email-store.ts
//
// The address a customer last paid lava.top with, kept per account so the
// next payment is prefilled instead of asked again. It is NEVER written into
// the login record (`user:{id}`): a payment address is not an identity.
//
// Key: `lava_email:{userId}` (lava_* like `lava_charge:`), refreshed on every
// use and gone after a year of no lava payments.

import { redis } from "./redis";
import { getUserRecord } from "./accounts";
import { checkPaymentEmail, maskEmail } from "./payment-email";

const TTL_SEC = 365 * 24 * 3600;
const key = (userId: string): string => `lava_email:${userId}`;

/** The saved payment address, or null (also on a Redis error or a value that no longer passes the check). */
export async function readSavedPaymentEmail(userId: string): Promise<string | null> {
  try {
    const raw = await redis.get<unknown>(key(userId));
    if (typeof raw !== "string") return null;
    const c = checkPaymentEmail(raw);
    return c.ok ? c.email : null;
  } catch (err) {
    console.error("[payment-email] read failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** What the form starts with: the saved payment address, else the account's own e-mail, else null. */
export async function defaultPaymentEmail(userId: string): Promise<string | null> {
  const saved = await readSavedPaymentEmail(userId);
  if (saved !== null) return saved;
  try {
    const user = await getUserRecord(userId);
    const c = checkPaymentEmail(user?.email);
    return c.ok ? c.email : null;
  } catch (err) {
    console.error("[payment-email] account read failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/** Remember the address after a SUCCESSFUL invoice. Best effort: the invoice is already out. */
export async function savePaymentEmail(userId: string, email: string): Promise<void> {
  const c = checkPaymentEmail(email);
  if (!c.ok) return;
  try {
    await redis.set(key(userId), c.email, { ex: TTL_SEC });
  } catch (err) {
    console.error(
      "[payment-email] save failed:",
      maskEmail(c.email),
      err instanceof Error ? err.message : String(err),
    );
  }
}
