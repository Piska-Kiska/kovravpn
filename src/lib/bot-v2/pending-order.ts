// src/lib/bot-v2/pending-order.ts
//
// The order a person is topping up for ("Top up $32.50" on an order screen).
// Kept for a day so the top-up notice can offer "Pay for 3 devices · 6
// months" once the money arrives. Only a hint for the UI: the purchase itself
// re-checks the price and the balance.

import { redis } from "../redis";
import type { Term } from "../subscriptions";
import type { Origin, ProductKey } from "./callbacks";

export interface PendingOrder {
  product: ProductKey;
  term: Term;
  from: Origin;
}

export const pendingOrderKey = (userId: string) => `kovra:bot:order:${userId}`;
const PENDING_TTL_SEC = 24 * 3600;

export async function savePendingOrder(userId: string, order: PendingOrder): Promise<void> {
  await redis.set(pendingOrderKey(userId), JSON.stringify(order), { ex: PENDING_TTL_SEC });
}

export async function clearPendingOrder(userId: string): Promise<void> {
  try {
    await redis.del(pendingOrderKey(userId));
  } catch {
    /* expires by TTL */
  }
}

/** The pending order, or null (also on a malformed record or a Redis error). */
export async function readPendingOrder(userId: string): Promise<PendingOrder | null> {
  try {
    const raw = await redis.get<unknown>(pendingOrderKey(userId));
    const v = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<PendingOrder> | null;
    if (!v || (v.product !== "plan1" && v.product !== "plan3" && v.product !== "slot")) return null;
    if (v.term !== 1 && v.term !== 6 && v.term !== 12) return null;
    return { product: v.product, term: v.term, from: v.from === "c" ? "c" : "w" };
  } catch {
    return null;
  }
}
