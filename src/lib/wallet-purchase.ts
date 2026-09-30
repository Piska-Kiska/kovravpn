// src/lib/wallet-purchase.ts
//
// Buy a plan (purchase or renewal) or a device add-on with the prepaid USD
// wallet (`balance_usd:{userId}`, integer cents). One implementation for the
// bot, the Mini App and the web cabinet: the "unified balance".
//
// Guarantees
// ──────────
// • Exact money: prices are integer cents, never floats.
// • One purchase at a time per user: a Redis lock `lock:wallet:{userId}`.
//   A second concurrent call gets `conflict/busy` and changes nothing.
// • Idempotent by requestId: the record `wallet:req:{userId}:{requestId}` is
//   written BEFORE the charge. A repeat of a finished request returns the
//   same result without charging again; a repeat while one is running is
//   `conflict/in_progress`; the same id for another product is
//   `conflict/request_reused`.
// • Charge, then grant; a failed grant is refunded in full. If the refund
//   itself fails, the record stays as evidence (`failed`) and the log line
//   says REFUND FAILED — that case needs a person.
// • "Insufficient" writes nothing, so the same requestId works after a top-up.
//
// Expiry sync with the VPN panels runs after the lock is released: it is slow
// (network), it never throws, and it is not part of the money transaction.

import { redis } from "./redis";
import { acquireLock } from "./ratelimit";
import { addBalanceCents, chargeBalanceCents, getBalanceCents, usdToCents } from "./bot-wallet";
import {
  DEVICE_ADDON_PRICE,
  activePlanKindOf,
  applyDeviceAddonTerm,
  applyPlanPurchase,
  getSubscriptions,
  resolvePlan,
  type PlanKind,
  type Term,
} from "./subscriptions";
import { syncAllExpiry } from "./balance";

export type WalletProductKind = PlanKind | "device";

export interface WalletProduct {
  kind: WalletProductKind;
  term: Term;
}

/** Where the purchase was started; recorded for audit only. */
export type WalletPurchaseSource = "bot" | "web" | "miniapp";

export interface WalletPurchaseInput {
  userId: string;
  product: WalletProduct;
  /** Client-generated id of this purchase attempt, 8–80 chars of [A-Za-z0-9_-]. */
  requestId: string;
  source: WalletPurchaseSource;
}

export type WalletPurchaseResult =
  | {
      status: "ok";
      product: WalletProduct;
      priceCents: number;
      /** Wallet balance right after this purchase's charge. */
      balanceCents: number;
      /** True when this answers a repeat of an already finished request. */
      replayed: boolean;
    }
  | {
      status: "insufficient";
      product: WalletProduct;
      priceCents: number;
      balanceCents: number;
      needCents: number;
    }
  | {
      status: "conflict";
      reason: "busy" | "in_progress" | "request_reused" | "other_plan_active";
      /** For `other_plan_active`: the tier that is running (renew that one). */
      activePlan?: PlanKind;
    }
  | {
      status: "error";
      reason: "invalid_request" | "grant_failed" | "internal";
      /** For `grant_failed`: whether the charge was returned to the wallet. */
      refunded?: boolean;
    };

/** Side effects, injectable for tests. Defaults are the real ones. */
export interface WalletPurchaseDeps {
  grantPlan(userId: string, kind: PlanKind, term: Term): Promise<void>;
  grantDevice(userId: string, term: Term): Promise<void>;
  syncExpiry(userId: string): Promise<void>;
  now(): number;
}

const defaultDeps: WalletPurchaseDeps = {
  async grantPlan(userId, kind, term) {
    const plan = resolvePlan(kind, term);
    if (!plan) throw new Error(`invalid plan ${kind}/${term}`);
    await applyPlanPurchase(userId, plan);
  },
  async grantDevice(userId, term) {
    await applyDeviceAddonTerm(userId, term);
  },
  syncExpiry: syncAllExpiry,
  now: () => Date.now(),
};

/** Longer than charge + grant (a handful of Redis calls), short enough to self-heal. */
const LOCK_TTL_SEC = 30;
/** How long a finished request can be replayed. */
const REQUEST_TTL_SEC = 7 * 24 * 60 * 60;

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const USER_ID_MAX = 200;

export function isValidRequestId(v: unknown): v is string {
  return typeof v === "string" && REQUEST_ID_RE.test(v);
}

/** Validate an untrusted {kind, term}. Null when it is not something we sell. */
export function parseWalletProduct(kind: unknown, term: unknown): WalletProduct | null {
  const tm = typeof term === "string" && /^\d{1,2}$/.test(term) ? Number(term) : term;
  if (tm !== 1 && tm !== 6 && tm !== 12) return null;
  if (kind !== "plan1" && kind !== "plan3" && kind !== "device") return null;
  return { kind, term: tm };
}

/** Price of a product in integer cents (server-side, authoritative). */
export function productPriceCents(product: WalletProduct): number {
  if (product.kind === "device") {
    const monthly = usdToCents(DEVICE_ADDON_PRICE);
    if (monthly === null) throw new Error("device add-on price is not a valid amount");
    return monthly * product.term;
  }
  const plan = resolvePlan(product.kind, product.term);
  const cents = plan ? usdToCents(plan.price) : null;
  if (cents === null) throw new Error(`no price for ${product.kind}/${product.term}`);
  return cents;
}

function requestKey(userId: string, requestId: string): string {
  return `wallet:req:${userId}:${requestId}`;
}

type RequestRecord =
  | { state: "pending"; product: WalletProduct; priceCents: number; source: WalletPurchaseSource; at: number }
  | {
      state: "done";
      product: WalletProduct;
      priceCents: number;
      balanceCents: number;
      source: WalletPurchaseSource;
      at: number;
    }
  | { state: "failed"; product: WalletProduct; priceCents: number; refunded: false; source: WalletPurchaseSource; at: number };

function parseRecord(raw: unknown): RequestRecord | null {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof v !== "object" || v === null) return null;
  const r = v as { state?: unknown; product?: { kind?: unknown; term?: unknown } };
  if (r.state !== "pending" && r.state !== "done" && r.state !== "failed") return null;
  if (!r.product || parseWalletProduct(r.product.kind, r.product.term) === null) return null;
  return v as RequestRecord;
}

function sameProduct(a: WalletProduct, b: WalletProduct): boolean {
  return a.kind === b.kind && a.term === b.term;
}

function audit(evt: string, fields: Record<string, unknown>): void {
  console.info(JSON.stringify({ evt: `wallet.${evt}`, ...fields }));
}

/**
 * Charge the wallet and grant the product. Never throws: every outcome is a
 * typed result (see the header for the guarantees).
 *
 * Complexity: O(1) Redis round trips (≈8 on success) plus the grant itself.
 */
export async function purchaseFromWallet(
  input: WalletPurchaseInput,
  overrides: Partial<WalletPurchaseDeps> = {},
): Promise<WalletPurchaseResult> {
  const deps: WalletPurchaseDeps = { ...defaultDeps, ...overrides };
  const { userId, requestId, source } = input;

  if (typeof userId !== "string" || userId.length === 0 || userId.length > USER_ID_MAX || /\s/.test(userId)) {
    return { status: "error", reason: "invalid_request" };
  }
  if (!isValidRequestId(requestId)) return { status: "error", reason: "invalid_request" };
  const product = input.product ? parseWalletProduct(input.product.kind, input.product.term) : null;
  if (!product) return { status: "error", reason: "invalid_request" };

  let priceCents: number;
  try {
    priceCents = productPriceCents(product);
  } catch (err) {
    console.error("[wallet] price error:", err instanceof Error ? err.message : err);
    return { status: "error", reason: "internal" };
  }

  let unlock: (() => Promise<void>) | null;
  try {
    unlock = await acquireLock(`wallet:${userId}`, LOCK_TTL_SEC);
  } catch (err) {
    console.error("[wallet] lock error:", err instanceof Error ? err.message : err);
    return { status: "error", reason: "internal" };
  }
  if (!unlock) return { status: "conflict", reason: "busy" };

  const key = requestKey(userId, requestId);
  let result: WalletPurchaseResult;
  try {
    result = await chargeAndGrantLocked({ userId, requestId, source, product, priceCents, key, deps });
  } catch (err) {
    // Only reads before the claim can land here (every later step handles
    // its own errors), so no money moved.
    console.error("[wallet] purchase error:", err instanceof Error ? err.message : err);
    result = { status: "error", reason: "internal" };
  } finally {
    try {
      await unlock();
    } catch (err) {
      console.warn("[wallet] unlock failed (lock expires by TTL):", err instanceof Error ? err.message : err);
    }
  }

  if (result.status === "ok" && !result.replayed) {
    try {
      await deps.syncExpiry(userId);
    } catch (err) {
      console.error("[wallet] expiry sync failed after purchase:", err instanceof Error ? err.message : err);
    }
  }
  return result;
}

interface LockedArgs {
  userId: string;
  requestId: string;
  source: WalletPurchaseSource;
  product: WalletProduct;
  priceCents: number;
  key: string;
  deps: WalletPurchaseDeps;
}

async function chargeAndGrantLocked(a: LockedArgs): Promise<WalletPurchaseResult> {
  const { userId, requestId, source, product, priceCents, key, deps } = a;

  // 1. A repeat of an earlier request answers from its record.
  const prior = parseRecord(await redis.get(key));
  if (prior) {
    if (!sameProduct(prior.product, product)) return { status: "conflict", reason: "request_reused" };
    if (prior.state === "done") {
      return { status: "ok", product, priceCents: prior.priceCents, balanceCents: prior.balanceCents, replayed: true };
    }
    if (prior.state === "failed") return { status: "error", reason: "grant_failed", refunded: false };
    return { status: "conflict", reason: "in_progress" };
  }

  // 2. While a plan runs, only that tier can be bought (it renews). Same rule
  //    as the bot's and the cabinet's buy screens.
  if (product.kind !== "device") {
    const running = activePlanKindOf(await getSubscriptions(userId), deps.now());
    if (running !== null && running !== product.kind) {
      return { status: "conflict", reason: "other_plan_active", activePlan: running };
    }
  }

  // 3. Enough money? Nothing is written when not.
  const balanceCents = await getBalanceCents(userId);
  if (balanceCents < priceCents) {
    return { status: "insufficient", product, priceCents, balanceCents, needCents: priceCents - balanceCents };
  }

  // 4. Claim the request before touching money.
  const pending: RequestRecord = { state: "pending", product, priceCents, source, at: deps.now() };
  const claimed = await redis.set(key, JSON.stringify(pending), { nx: true, ex: REQUEST_TTL_SEC });
  if (claimed === null) return { status: "conflict", reason: "in_progress" };

  // 5. Charge.
  let charge: Awaited<ReturnType<typeof chargeBalanceCents>>;
  try {
    charge = await chargeBalanceCents(userId, priceCents);
  } catch (err) {
    // We cannot tell whether the decrement happened. The pending record
    // stays (the same requestId answers in_progress) and a person checks.
    console.error(
      `[wallet] AMBIGUOUS CHARGE, needs review: user=${userId} request=${requestId} cents=${priceCents}:`,
      err instanceof Error ? err.message : err,
    );
    return { status: "error", reason: "internal" };
  }
  if (!charge.ok) {
    await releaseClaim(key);
    return {
      status: "insufficient",
      product,
      priceCents,
      balanceCents: charge.balanceCents,
      needCents: Math.max(0, priceCents - charge.balanceCents),
    };
  }

  // 6. Grant; refund in full when it fails.
  try {
    if (product.kind === "device") await deps.grantDevice(userId, product.term);
    else await deps.grantPlan(userId, product.kind, product.term);
  } catch (err) {
    console.error("[wallet] grant failed, refunding:", err instanceof Error ? err.message : err);
    let refunded = false;
    try {
      await addBalanceCents(userId, priceCents);
      refunded = true;
    } catch (refundErr) {
      console.error(
        `[wallet] REFUND FAILED, needs review: user=${userId} request=${requestId} cents=${priceCents}:`,
        refundErr instanceof Error ? refundErr.message : refundErr,
      );
    }
    if (refunded) {
      await releaseClaim(key);
    } else {
      const failed: RequestRecord = { state: "failed", product, priceCents, refunded: false, source, at: deps.now() };
      try {
        await redis.set(key, JSON.stringify(failed), { ex: REQUEST_TTL_SEC });
      } catch {
        /* the pending record stays, which also blocks a replay */
      }
    }
    audit("purchase_failed", { userId, requestId, source, product, priceCents, refunded });
    return { status: "error", reason: "grant_failed", refunded };
  }

  // 7. Done: remember the result for replays.
  const done: RequestRecord = {
    state: "done",
    product,
    priceCents,
    balanceCents: charge.balanceCents,
    source,
    at: deps.now(),
  };
  try {
    await redis.set(key, JSON.stringify(done), { ex: REQUEST_TTL_SEC });
  } catch (err) {
    // Paid and granted; only the replay record is stale (it says pending).
    console.error("[wallet] could not finalize request record:", err instanceof Error ? err.message : err);
  }
  audit("purchase", { userId, requestId, source, product, priceCents, balanceCents: charge.balanceCents });
  return { status: "ok", product, priceCents, balanceCents: charge.balanceCents, replayed: false };
}

/** Drop a claim whose charge did not stick, so the same requestId can retry. */
async function releaseClaim(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.warn("[wallet] could not release request claim:", err instanceof Error ? err.message : err);
  }
}
