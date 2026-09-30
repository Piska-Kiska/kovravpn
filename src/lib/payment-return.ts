// src/lib/payment-return.ts
//
// Coming back from a payment page, on the site (`/dashboard?paid=1`) and in
// the Telegram Mini App (`https://t.me/<bot>?startapp=paid`).
//
// The cabinet shows "Checking payment…" and polls until it SEES the payment:
// the plan changed (a purchase or a renewal), or the prepaid balance went up
// (a top-up). What it compares against is the baseline saved just before the
// person left for the payment page; without one (another device, storage
// blocked), the first load after the return serves as the baseline.
//
// Pure: storage and the clock are passed in; the dashboard and the Mini App
// shell do the I/O.

/** What the person left to pay for. */
export type PaidKind = "plan" | "slot" | "topup";

export interface PaidSnapshot {
  maxExpiry: number;
  activeSlots: number;
  /** Prepaid balance in cents; null when unknown (an old response). */
  balanceCents: number | null;
}

export interface PaidBaseline extends PaidSnapshot {
  kind: PaidKind | null;
}

/**
 * localStorage key. Not sessionStorage: the Mini App comes back from a payment
 * in a NEW webview (Telegram reopens it from the t.me link), which has an
 * empty sessionStorage but the same localStorage.
 */
export const PAID_BASE_KEY = "kovra_paid_base";
/** A baseline older than this belongs to a payment abandoned long ago. */
export const PAID_BASE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** After a return, a plan created this long before the page opened counts as the payment. */
export const PAID_RECENT_MS = 30 * 60 * 1000;
/** Stop polling after this long; the notice stays until dismissed. */
export const PAID_POLL_MAX_MS = 30 * 60 * 1000;

const KINDS: readonly PaidKind[] = ["plan", "slot", "topup"];

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function serializeBaseline(base: PaidBaseline, now: number): string {
  return JSON.stringify({ ...base, at: now });
}

/** The stored baseline, or null when missing, stale or malformed. */
export function parseBaseline(raw: string | null | undefined, now: number): PaidBaseline | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!finite(o.maxExpiry) || !finite(o.activeSlots) || !finite(o.at)) return null;
  const age = now - o.at;
  if (!(age >= 0 && age < PAID_BASE_MAX_AGE_MS)) return null;
  const balanceCents = finite(o.balanceCents) ? o.balanceCents : null;
  const kind = typeof o.kind === "string" && (KINDS as readonly string[]).includes(o.kind) ? (o.kind as PaidKind) : null;
  return { maxExpiry: o.maxExpiry, activeSlots: o.activeSlots, balanceCents, kind };
}

/** `?paid=` values the payment lines return with: "1" (most), "lava" (lava.top). */
export function isPaidReturnValue(v: string | null | undefined): boolean {
  return v === "1" || v === "lava";
}

/**
 * Has the payment arrived?
 *   "plan"  — the plan or the slots changed, or (not for a top-up) a plan
 *             bought within PAID_RECENT_MS before the page opened is there
 *             (card webhooks often land before the redirect back);
 *   "topup" — the balance went up;
 *   null    — not yet.
 */
export function detectPaid(
  base: PaidBaseline | null,
  now: PaidSnapshot,
  recentPlanPurchase: boolean,
): "plan" | "topup" | null {
  const kind = base?.kind ?? null;
  if (recentPlanPurchase && kind !== "topup") return "plan";
  if (!base) return null;
  const up =
    base.balanceCents !== null && now.balanceCents !== null && now.balanceCents > base.balanceCents;
  const planChanged = now.maxExpiry !== base.maxExpiry || now.activeSlots !== base.activeSlots;
  // A top-up waits for the balance, whatever else changed meanwhile.
  if (kind === "topup") return up ? "topup" : null;
  if (planChanged) return "plan";
  if (up) return "topup";
  return null;
}

/** What `start_param` of the Mini App asks for (`https://t.me/<bot>?startapp=<p>`). */
export type StartAction =
  | { kind: "paid" }
  | { kind: "view"; view: "devices" | "plan" | "rewards" | "account" }
  | { kind: "topup" };

const START_VIEWS: Readonly<Record<string, "devices" | "plan" | "rewards" | "account">> = {
  devices: "devices",
  plan: "plan",
  rewards: "rewards",
  account: "account",
};

/**
 * `paid` — back from a payment page; `topup` — open the top-up sheet;
 * `devices` / `plan` / `rewards` / `account` — open that view. Anything else
 * (a referral code, junk) means nothing to the cabinet.
 */
export function parseStartParam(p: string | null | undefined): StartAction | null {
  if (typeof p !== "string") return null;
  if (p === "paid") return { kind: "paid" };
  if (p === "topup") return { kind: "topup" };
  const view = Object.prototype.hasOwnProperty.call(START_VIEWS, p) ? START_VIEWS[p] : undefined;
  return view ? { kind: "view", view } : null;
}

/**
 * The query a start action becomes on /tg, so the cabinet handles a Mini App
 * return with the same code as a site return: `paid` -> `?paid=1`,
 * `topup` -> `?view=topup`, a view -> `?view=<view>`.
 */
export function startActionQuery(a: StartAction): readonly [key: string, value: string] {
  if (a.kind === "paid") return ["paid", "1"];
  if (a.kind === "topup") return ["view", "topup"];
  return ["view", a.view];
}
