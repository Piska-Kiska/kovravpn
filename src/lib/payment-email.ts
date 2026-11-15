// src/lib/payment-email.ts
//
// The e-mail a person pays lava.top with. lava.top asked that every client
// enters THEIR OWN address, so there is no shared fallback: the address is
// validated here, asked for before any invoice exists, and a missing or bad
// one is a typed error, never a silent substitution.
//
// Pure module: no Redis, no network. The cabinet imports it too, so the form
// and the server judge an address by the same rule.

export type PaymentEmailCode = "email_required" | "email_invalid" | "email_rejected";

export const PAYMENT_EMAIL_CODES: readonly PaymentEmailCode[] = [
  "email_required",
  "email_invalid",
  "email_rejected",
];

export function isPaymentEmailCode(v: unknown): v is PaymentEmailCode {
  return typeof v === "string" && (PAYMENT_EMAIL_CODES as readonly string[]).includes(v);
}

/** Longest address SMTP allows (RFC 5321). */
export const MAX_EMAIL_LENGTH = 254;

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/** Thrown by `createInvoice` and the helpers around it. `code` goes to the client as is. */
export class LavaEmailError extends Error {
  public readonly code: PaymentEmailCode;

  // No parameter properties: Node's type stripping (unit tests) rejects them.
  constructor(code: PaymentEmailCode) {
    super(code);
    this.name = "LavaEmailError";
    this.code = code;
  }
}

export type PaymentEmailCheck =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly code: PaymentEmailCode };

/**
 * The address the old setup used for everybody. Read at call time so a test
 * can set it; empty on the client, where the variable does not exist.
 */
function sharedAddress(): string | null {
  const v = typeof process !== "undefined" ? process.env.LAVA_BUYER_EMAIL : undefined;
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s.length > 0 ? s : null;
}

/**
 * Trim, length, shape, domain lower-cased. The shared address that used to
 * stand in for everybody is refused when it is still set in the environment:
 * pasting it into the form would defeat the whole point.
 */
export function checkPaymentEmail(raw: unknown): PaymentEmailCheck {
  if (typeof raw !== "string") return { ok: false, code: "email_required" };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, code: "email_required" };
  if (trimmed.length > MAX_EMAIL_LENGTH || !EMAIL_RE.test(trimmed)) {
    return { ok: false, code: "email_invalid" };
  }
  const at = trimmed.lastIndexOf("@");
  const email = `${trimmed.slice(0, at)}@${trimmed.slice(at + 1).toLowerCase()}`;
  const shared = sharedAddress();
  if (shared !== null && email.toLowerCase() === shared) return { ok: false, code: "email_rejected" };
  return { ok: true, email };
}

/** `*@domain` for logs: a full address never reaches them. */
export function maskEmail(email: string | undefined): string {
  if (email === undefined) return "none";
  const at = email.lastIndexOf("@");
  return at > 0 ? `*@${email.slice(at + 1)}` : "*";
}
