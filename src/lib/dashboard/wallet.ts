// src/lib/dashboard/wallet.ts
//
// Client side of the unified balance (the bot's USD wallet, shared with the
// cabinet and the Mini App): the purchase request id, the answers of
// POST /api/wallet/purchase, and the top-up amount rules.
//
// Pure: storage and randomness are passed in, so tests run in Node.
//
// Request ids. "Pay from balance" sends a client-made id; the server charges
// once per id (lib/wallet-purchase.ts). The id is kept per product in
// sessionStorage until the purchase SUCCEEDS: a lost answer, a reload or a
// double tap repeats the same id and gets the first result back instead of
// a second charge. It is dropped on success, and when the server says the id
// belongs to another product.

import type { PlanKind, Term } from "./types";

export type WalletProductKind = PlanKind | "device";

export interface WalletProduct {
  kind: WalletProductKind;
  term: Term;
}

/** The parts of Storage used here (sessionStorage satisfies it). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const WALLET_REQ_PREFIX = "kovra_wallet_req:";
/** Same rule as the server (lib/wallet-purchase.ts isValidRequestId). */
export const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

function requestKey(p: WalletProduct): string {
  return `${WALLET_REQ_PREFIX}${p.kind}:${p.term}`;
}

/** 24 characters of base64url from 18 random bytes (144 bits). */
export function newRequestId(fill: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = fill(new Uint8Array(18));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The id for this product: the stored one while an earlier attempt has not
 * succeeded, otherwise a new one (stored before it is used). Without storage
 * the id lives only for this call; `memory` then keeps it for the page view.
 */
export function requestIdFor(
  store: KeyValueStore | null,
  product: WalletProduct,
  memory: Map<string, string>,
  make: () => string = newRequestId,
): string {
  const key = requestKey(product);
  let stored: string | null = null;
  try {
    stored = store?.getItem(key) ?? null;
  } catch {
    stored = null;
  }
  const existing = stored && REQUEST_ID_RE.test(stored) ? stored : memory.get(key);
  if (existing && REQUEST_ID_RE.test(existing)) {
    memory.set(key, existing);
    return existing;
  }
  const id = make();
  memory.set(key, id);
  try {
    store?.setItem(key, id);
  } catch {
    // Storage blocked or full: the in-memory copy covers this page view.
  }
  return id;
}

/** Forget the id of a product (after success, or when the server refused it as reused). */
export function clearRequestId(store: KeyValueStore | null, product: WalletProduct, memory: Map<string, string>): void {
  const key = requestKey(product);
  memory.delete(key);
  try {
    store?.removeItem(key);
  } catch {
    // Nothing to clean up without storage.
  }
}

/** What an answer of POST /api/wallet/purchase means for the page. */
export type PurchaseOutcome =
  | { kind: "ok"; balanceCents: number; priceCents: number; replayed: boolean }
  | { kind: "insufficient"; needCents: number; balanceCents: number; priceCents: number }
  /** Another purchase of this person is running (busy / in_progress): try again shortly, same id. */
  | { kind: "busy" }
  /** A different plan is running; only that one can be renewed. */
  | { kind: "other_plan"; activePlan: PlanKind | null }
  /** An extra slot without a running plan: a plan comes first. */
  | { kind: "no_plan" }
  /** The grant failed and the money went back to the balance. */
  | { kind: "refunded" }
  /** The grant failed and the refund too: a person has to look (support). */
  | { kind: "stuck" }
  | { kind: "rate_limited" }
  | { kind: "unauthorized" }
  /** The server refused the id as used for another product: drop it. */
  | { kind: "reused" }
  | { kind: "error" };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Maps status + JSON body to an outcome. Never throws on odd bodies. */
export function purchaseOutcome(status: number, body: unknown): PurchaseOutcome {
  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (status === 200 && b.ok === true) {
    const balanceCents = num(b.balanceCents);
    const priceCents = num(b.priceCents);
    if (balanceCents !== null && priceCents !== null) {
      return { kind: "ok", balanceCents, priceCents, replayed: b.replayed === true };
    }
    return { kind: "error" };
  }
  if (status === 401) return { kind: "unauthorized" };
  if (status === 429) return { kind: "rate_limited" };
  if (status === 402 && b.error === "insufficient_balance") {
    return {
      kind: "insufficient",
      needCents: Math.max(0, num(b.needCents) ?? 0),
      balanceCents: Math.max(0, num(b.balanceCents) ?? 0),
      priceCents: Math.max(0, num(b.priceCents) ?? 0),
    };
  }
  if (status === 409) {
    if (b.error === "busy" || b.error === "in_progress") return { kind: "busy" };
    if (b.error === "request_reused") return { kind: "reused" };
    if (b.error === "other_plan_active") {
      const ap = b.activePlan === "plan1" || b.activePlan === "plan3" ? b.activePlan : null;
      return { kind: "other_plan", activePlan: ap };
    }
    if (b.error === "no_plan") return { kind: "no_plan" };
  }
  if (status === 500 && b.error === "grant_failed") return b.refunded === true ? { kind: "refunded" } : { kind: "stuck" };
  return { kind: "error" };
}

/**
 * Does the id stay for the next tap? Yes unless the purchase went through or
 * the server refused the id itself. After "insufficient" nothing was written
 * server-side, after "refunded" the claim was released, after "stuck" the
 * same id must keep answering "failed" instead of charging again.
 */
export function keepsRequestId(o: PurchaseOutcome): boolean {
  return o.kind !== "ok" && o.kind !== "reused";
}

export type TopupAmountCheck =
  | { ok: true; amountUsd: number; cents: number }
  | { ok: false; reason: "empty" | "format" | "min" | "max" };

/**
 * A typed top-up amount: "20", "20.5", "20,50" (comma for de/fr/es/ru),
 * "$20". At most two decimals; between `minUsd` and `maxUsd` inclusive.
 * Money is compared in integer cents.
 */
export function checkTopupAmount(raw: string, minUsd: number, maxUsd: number): TopupAmountCheck {
  const s = raw.trim().replace(/^\$\s*/, "").replace(/\s*\$$/, "").replace(",", ".");
  if (s === "") return { ok: false, reason: "empty" };
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return { ok: false, reason: "format" };
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) return { ok: false, reason: "format" };
  if (cents < Math.round(minUsd * 100)) return { ok: false, reason: "min" };
  if (cents > Math.round(maxUsd * 100)) return { ok: false, reason: "max" };
  return { ok: true, amountUsd: cents / 100, cents };
}

/** Dollars (as the pricing API gives them) to integer cents; null when not a price. */
export function usdToCentsClient(usd: number): number | null {
  if (!Number.isFinite(usd) || usd < 0) return null;
  return Math.round(usd * 100);
}

/**
 * The balance covers the price. Both in cents; an unknown balance (null)
 * never covers anything.
 */
export function balanceCovers(balanceCents: number | null, priceCents: number | null): boolean {
  return balanceCents !== null && priceCents !== null && priceCents > 0 && balanceCents >= priceCents;
}
