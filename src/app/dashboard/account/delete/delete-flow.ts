// src/app/dashboard/account/delete/delete-flow.ts
//
// The account deletion page's reading of the endpoints of
// lib/account-delete.ts, without React: what an answer means for the page
// and which dictionary line explains it. Kept apart from the view so the node
// tests can pin every branch (tests/account-delete-page.test.mjs).
//
// Every answer is parsed, never trusted: an old server, a proxy error page or
// a cut connection must land on "try again", not on a crash or on a form the
// server would refuse.
//
// Pure: no imports at all.

/** The page. /login returns here (lib/login-return.ts LOGIN_RETURN_PATHS). */
export const ACCOUNT_DELETE_PATH = "/dashboard/account/delete";

/** Where a person who may not delete here writes instead (the address /support and the policy name). */
export const SUPPORT_EMAIL = "support@kovravpn.com";

export type CodeChannel = "telegram" | "email";

/** GET /api/account/delete for an account inside the gate. */
export interface DeleteStatus {
  /** The owner's account: the whole flow runs, nothing is deleted. */
  readonly dryRun: boolean;
  /** False: signed in under an identity that is an alias of another account. */
  readonly primary: boolean;
  /** Where the code goes; null: nowhere, deletion goes through support. */
  readonly channel: CodeChannel | null;
  /** US cents in the wallet (the account's and its linked Telegram id's). */
  readonly walletCents: number;
  /** Plans still running. */
  readonly plans: number;
  /** ms, the furthest end of a running plan; 0 without one. */
  readonly plansUntil: number;
  readonly devices: number;
  readonly linkedEmail: boolean;
  readonly linkedTelegram: boolean;
}

export type StatusRead =
  | { readonly kind: "auth" }
  | { readonly kind: "closed" }
  | { readonly kind: "open"; readonly status: DeleteStatus }
  | { readonly kind: "error" };

/** Stable error codes of the endpoints, plus what the page makes of a broken answer. */
export type DeleteError =
  | "code_invalid"
  | "code_expired"
  | "rate_limited"
  | "busy"
  | "send_failed"
  | "no_channel"
  | "panel_failed"
  | "not_enabled"
  | "linked_account"
  | "unauthorized"
  | "internal";

export interface Failure {
  readonly kind: "error";
  readonly error: DeleteError;
  /** Seconds, with rate_limited. */
  readonly retryAfter?: number;
}

export type CodeOutcome = { readonly kind: "sent"; readonly channel: CodeChannel } | Failure;

export type DeleteOutcome =
  | { readonly kind: "deleted" }
  | { readonly kind: "dry_run"; readonly keys: number; readonly devices: number }
  | Failure;

const KNOWN_ERRORS: ReadonlySet<string> = new Set<DeleteError>([
  "code_invalid",
  "code_expired",
  "rate_limited",
  "busy",
  "send_failed",
  "no_channel",
  "panel_failed",
  "not_enabled",
  "linked_account",
  "unauthorized",
  "internal",
]);

function record(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function count(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function channelOf(v: unknown): CodeChannel | null {
  return v === "telegram" || v === "email" ? v : null;
}

/** The status answer. 401 is "sign in"; anything unreadable is an error, never an open form. */
export function readStatus(httpStatus: number, body: unknown): StatusRead {
  if (httpStatus === 401) return { kind: "auth" };
  if (httpStatus !== 200) return { kind: "error" };
  const b = record(body);
  if (b.enabled === false) return { kind: "closed" };
  if (b.enabled !== true) return { kind: "error" };
  const linked = record(b.linked);
  return {
    kind: "open",
    status: {
      dryRun: b.dryRun === true,
      // Only an explicit false refuses: an answer without the field reads as the common case.
      primary: b.primary !== false,
      channel: channelOf(b.channel),
      walletCents: count(b.walletCents),
      plans: count(b.plans),
      plansUntil: count(b.plansUntil),
      devices: count(b.devices),
      linkedEmail: linked.email === true,
      linkedTelegram: linked.telegram === true,
    },
  };
}

function failure(httpStatus: number, body: unknown): Failure {
  const b = record(body);
  if (httpStatus === 401) return { kind: "error", error: "unauthorized" };
  if (httpStatus === 429) {
    const retryAfter = count(b.retryAfter);
    return { kind: "error", error: "rate_limited", retryAfter: retryAfter > 0 ? retryAfter : 3600 };
  }
  const code = typeof b.error === "string" && KNOWN_ERRORS.has(b.error) ? (b.error as DeleteError) : "internal";
  return { kind: "error", error: code };
}

/** POST /api/account/delete/confirm. */
export function readCodeResponse(httpStatus: number, body: unknown): CodeOutcome {
  const b = record(body);
  if (httpStatus === 200 && b.status === "sent") {
    const channel = channelOf(b.channel);
    if (channel) return { kind: "sent", channel };
  }
  if (httpStatus >= 200 && httpStatus < 300) return { kind: "error", error: "internal" };
  return failure(httpStatus, body);
}

/** POST /api/account/delete. 202 is the deletion, 200 a repeat of it (or the owner's dry run). */
export function readDeleteResponse(httpStatus: number, body: unknown): DeleteOutcome {
  const b = record(body);
  if ((httpStatus === 202 || httpStatus === 200) && b.status === "deleted") return { kind: "deleted" };
  if (httpStatus === 200 && b.status === "dry_run") {
    return { kind: "dry_run", keys: count(b.keys), devices: count(b.devices) };
  }
  if (httpStatus >= 200 && httpStatus < 300) return { kind: "error", error: "internal" };
  return failure(httpStatus, body);
}

/** Errors that change the whole page instead of a line under the form. */
export type PageError = "not_enabled" | "linked_account" | "unauthorized";
export type FormError = Exclude<DeleteError, PageError>;

export function isPageError(error: DeleteError): error is PageError {
  return error === "not_enabled" || error === "linked_account" || error === "unauthorized";
}

/** The dictionary line for each error shown next to the form (lib/account-delete-i18n.ts). */
export const ERROR_KEYS = {
  code_invalid: "err_code_invalid",
  code_expired: "err_code_expired",
  rate_limited: "err_rate_limited",
  busy: "err_busy",
  send_failed: "err_send_failed",
  no_channel: "err_no_channel",
  panel_failed: "err_panel_failed",
  internal: "err_generic",
} as const satisfies Readonly<Record<FormError, string>>;

/** Errors after which only a new code helps: the page goes back to the send step. */
export function needsNewCode(error: FormError): boolean {
  return error === "code_expired";
}

/** Errors under which the support address is shown too. */
export function showsSupport(error: FormError): boolean {
  return error === "send_failed" || error === "no_channel";
}

/** Whole minutes to wait, at least one: "try again in 0 min" reads like a bug. */
export function retryMinutes(retryAfterSec: number | undefined): number {
  const sec = Number(retryAfterSec);
  return Number.isFinite(sec) && sec > 0 ? Math.max(1, Math.ceil(sec / 60)) : 60;
}

/** The six cells of the code field as the code the server expects, or "" while it is not whole. */
export function codeOf(cells: readonly string[]): string {
  const code = cells.join("").replace(/\D/g, "");
  return /^\d{6}$/.test(code) ? code : "";
}
