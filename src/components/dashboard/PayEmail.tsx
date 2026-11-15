// src/components/dashboard/PayEmail.tsx
// The e-mail a person pays lava.top with. lava.top asked that every client
// enters their own address, so the field sits under the method list whenever a
// lava.top method is selected. One value is shared by the plan, device and
// top-up pickers through a context: it is prefilled from the saved payment
// address or the account's own, and a refused address is shown right here.
"use client";

import { createContext, useContext } from "react";
import { Field } from "@/components/cabinet";
import type { DashDict } from "@/lib/dash-i18n";
import { isPaymentEmailCode, type PaymentEmailCode } from "@/lib/payment-email";

export interface PayEmailState {
  email: string;
  /** Code of the last refusal (ours or the gateway's), shown under the field. */
  error: PaymentEmailCode | null;
  setEmail(v: string): void;
  setError(code: PaymentEmailCode | null): void;
}

export const PayEmailContext = createContext<PayEmailState | null>(null);

/** Translated message for a code; null for anything that is not an e-mail refusal. */
export function payEmailMessage(t: DashDict, code: unknown): string | null {
  if (!isPaymentEmailCode(code)) return null;
  if (code === "email_required") return t.pay_email_required;
  if (code === "email_invalid") return t.pay_email_invalid;
  return t.pay_email_rejected;
}

export function PayEmailField({ t, id, disabled }: { t: DashDict; id: string; disabled: boolean }) {
  const ctx = useContext(PayEmailContext);
  if (ctx === null) return null;
  return (
    <Field
      id={id}
      label={t.pay_email_label}
      hint={t.pay_email_hint}
      type="email"
      inputMode="email"
      autoComplete="email"
      autoCapitalize="none"
      spellCheck={false}
      maxLength={254}
      value={ctx.email}
      disabled={disabled}
      error={ctx.error === null ? undefined : (payEmailMessage(t, ctx.error) ?? undefined)}
      onChange={(e) => {
        ctx.setEmail(e.target.value);
        if (ctx.error !== null) ctx.setError(null);
      }}
    />
  );
}
