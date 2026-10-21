// src/lib/lava-pending.ts
//
// A lava.top `payment.success` we received for a contract WE issued and could
// not credit on the spot: lib/lava-webhook-handler.ts answers 503, lava.top
// repeats for about five hours, and until then the person sees "checking the
// payment". What came in is kept here — when, which sum, why it was refused —
// so that the owner's "credit now" (lib/lava-admin-credit.ts) shows the
// evidence before crediting on our own record, and a credit later forgets it.
//
// Evidence, not a queue: nothing re-feeds it by itself. Nothing here throws:
// a storage failure must change neither the answer to lava.top nor the
// owner's message.

import { redis } from "./redis";

const TTL_SECONDS = 7 * 24 * 60 * 60;
const key = (contractId: string): string => `lava_pending:${contractId}`;

export interface PendingLavaEvent {
  /** When the event reached us, ms since the epoch. */
  readonly receivedAt: number;
  /** Whether it carried our webhook secret. */
  readonly auth: "ok" | "unconfigured";
  /** Why it was not credited then, in the words of the admin's alert. */
  readonly reason: string;
  /** The sum and currency the event named, when they were a sum and a currency. */
  readonly amount: number | null;
  readonly currency: string | null;
  /** The status the event named, as spelled, cut short. */
  readonly eventStatus: string | null;
}

function sumOf(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/** What is kept of an event, read from its body. Pure. */
export function pendingFromPayload(
  payload: Readonly<Record<string, unknown>>,
  auth: "ok" | "unconfigured",
  reason: string,
  now: number,
): PendingLavaEvent {
  return {
    receivedAt: now,
    auth,
    reason: reason.slice(0, 200),
    amount: sumOf(payload.amount),
    currency: typeof payload.currency === "string" ? payload.currency.slice(0, 8) : null,
    eventStatus: typeof payload.status === "string" ? payload.status.slice(0, 40) : null,
  };
}

function isPending(value: unknown): value is PendingLavaEvent {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.receivedAt === "number" &&
    Number.isFinite(v.receivedAt) &&
    (v.auth === "ok" || v.auth === "unconfigured") &&
    typeof v.reason === "string" &&
    (v.amount === null || typeof v.amount === "number") &&
    (v.currency === null || typeof v.currency === "string") &&
    (v.eventStatus === null || typeof v.eventStatus === "string")
  );
}

/** Keep the event; the latest one for a contract wins. Never throws. */
export async function rememberPendingEvent(contractId: string, event: PendingLavaEvent): Promise<boolean> {
  try {
    await redis.set(key(contractId), JSON.stringify(event), { ex: TTL_SECONDS });
    return true;
  } catch (err) {
    console.error("[lava-pending] remember failed:", err);
    return false;
  }
}

/** The kept event, or null when there is none or it cannot be read. Never throws. */
export async function getPendingEvent(contractId: string): Promise<PendingLavaEvent | null> {
  try {
    const raw = await redis.get(key(contractId));
    const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    return isPending(parsed) ? parsed : null;
  } catch (err) {
    console.error("[lava-pending] read failed:", err);
    return null;
  }
}

/** The contract was credited: the evidence has served. Never throws. */
export async function forgetPendingEvent(contractId: string): Promise<void> {
  try {
    await redis.del(key(contractId));
  } catch (err) {
    console.error("[lava-pending] forget failed:", err);
  }
}
