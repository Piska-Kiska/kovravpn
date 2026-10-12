// src/lib/lava-lookup.ts
//
// Finding the contract a lava.top event speaks of. PURE: no network, no
// storage, no environment — the reads are handed in, so the rule is tested
// without them (tests/lava-unknown-contract.test.mjs).
//
// WHY THIS EXISTS (11–12.10.2026). `GET /api/v2/invoices/{id}` began to answer
// 404 for contracts whose `payment.success` lava.top's own sender had just
// delivered. The webhook read that 404 as "not our contract" and confirmed the
// event with 200; lava.top never repeats a confirmed event, so the payment was
// dropped and nobody was told. Seen on the sister site (ProxysVPN), where the
// same code credited no payment for two days.
//
// The rule now: a 404 by id is not proof that the payment does not exist. A
// `payment.success` is looked up a second way — in the LIST of executed
// contracts of the same API key — and only a contract neither read knows is
// "unknown". What "unknown" means for the answer is the webhook's decision: it
// knows whether the contract is ours.

import type { LavaInvoice } from "./lava";

const CONTRACT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Their list takes ISO dates without milliseconds (scripts/lava-check.mjs --recent). */
export function listDate(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface CompletedPage {
  /** Executed contracts this page brought for the first time. */
  readonly completed: readonly LavaInvoice[];
  /** Contracts with a well-formed id not seen on an earlier page, any status. */
  readonly fresh: number;
  /** Rows on the page, whatever they hold. */
  readonly rows: number;
  /** How many contracts the window holds by their count, when the page says. */
  readonly total: number | null;
}

/**
 * One page of `GET /api/v2/invoices`, read defensively. The shape of their
 * answers has parted from the specification before (the product feed), so
 * both a page with `items` and a bare array are read, and the status is
 * compared without regard to case: the event itself spells it in lower case.
 *
 * `seen` collects the ids across pages and is added to. Throws when the answer
 * holds no list at all — that is a broken read, not an empty window.
 * O(rows on the page).
 */
export function readCompletedPage(raw: unknown, seen: Set<string>): CompletedPage {
  const body = Array.isArray(raw) ? null : (raw as { items?: unknown; total?: unknown } | null);
  const rows: unknown = Array.isArray(raw) ? raw : body?.items;
  if (!Array.isArray(rows)) throw new Error("lava: the contract list has no items");
  const completed: LavaInvoice[] = [];
  let fresh = 0;
  for (const row of rows) {
    const invoice = row as LavaInvoice | null;
    if (invoice === null || typeof invoice !== "object") continue;
    if (typeof invoice.id !== "string" || !CONTRACT_ID_RE.test(invoice.id) || seen.has(invoice.id)) continue;
    seen.add(invoice.id);
    fresh += 1;
    if (typeof invoice.status !== "string" || invoice.status.toUpperCase() !== "COMPLETED") continue;
    completed.push(invoice.status === "COMPLETED" ? invoice : { ...invoice, status: "COMPLETED" });
  }
  const total = typeof body?.total === "number" && Number.isFinite(body.total) ? body.total : null;
  return { completed, fresh, rows: rows.length, total };
}

export type LavaLookup =
  /** `via` says which read answered: the webhook reports a "list" once a day. */
  | { readonly kind: "found"; readonly invoice: LavaInvoice; readonly via: "id" | "list" }
  /** Neither read knows the contract. */
  | { readonly kind: "unknown" }
  /** A read failed for a reason other than "not found": ask for a retry. */
  | { readonly kind: "failed"; readonly error: string };

export interface LavaLookupReads {
  /** The lookup by id; throws on any refusal. */
  readonly byId: (contractId: string) => Promise<LavaInvoice>;
  /** The executed contract from the list of the same key, or null. */
  readonly inList: (contractId: string) => Promise<LavaInvoice | null>;
  /** Whether `byId` threw because their API does not know the contract. */
  readonly isNotFound: (err: unknown) => boolean;
}

function reason(err: unknown): string {
  return err instanceof Error ? err.message : "unknown";
}

/**
 * The contract of an event, by id first and — for a `payment.success` their
 * lookup by id does not know — from the list of executed contracts.
 *
 * Only a success is looked up in the list: the list holds executed contracts
 * and nothing else, so a failed payment cannot be there.
 *
 * Never throws. At most one read by id and one read of the list.
 */
export async function lookupContract(
  reads: LavaLookupReads,
  contractId: string,
  event: string,
): Promise<LavaLookup> {
  try {
    return { kind: "found", invoice: await reads.byId(contractId), via: "id" };
  } catch (err) {
    if (!reads.isNotFound(err)) return { kind: "failed", error: reason(err) };
  }
  if (event !== "payment.success") return { kind: "unknown" };
  try {
    const invoice = await reads.inList(contractId);
    return invoice === null ? { kind: "unknown" } : { kind: "found", invoice, via: "list" };
  } catch (err) {
    return { kind: "failed", error: reason(err) };
  }
}
