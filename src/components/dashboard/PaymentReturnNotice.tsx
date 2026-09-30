// src/components/dashboard/PaymentReturnNotice.tsx
// While a payment is being checked (back from a payment page, or paying in the
// browser next to the Mini App): "Checking payment…" as the account is
// polled, then what arrived — the plan or the balance. "slow": polling
// stopped after 30 minutes without seeing it. Shown on every view.
//
// A payment page just opened from the Mini App is not a payment yet: that
// check says "finish paying in the browser", never "thanks".
import { Notice } from "@/components/cabinet";
import { fmt } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import type { PaidKind } from "@/lib/payment-return";

export type PaymentReturnState = "pending" | "slow" | "plan" | "topup";

export interface PaymentReturnNoticeProps {
  t: DashDict;
  state: PaymentReturnState;
  /** What the person left to pay for, when known. */
  kind: PaidKind | null;
  /** Current balance, formatted; for the top-up confirmation. */
  balance: string | null;
  /** The check started because the Mini App opened a payment page (not a ?paid= return). */
  inBrowser?: boolean;
  dismissLabel: string;
  onDismiss(): void;
}

function pendingText(t: DashDict, kind: PaidKind | null, inBrowser: boolean): string {
  if (inBrowser) return t.pay_pending_embedded;
  if (kind === "topup") return t.topup_pending;
  if (kind === "plan" || kind === "slot") return t.paid_pending;
  return t.paid_checking;
}

export function PaymentReturnNotice({ t, state, kind, balance, inBrowser = false, dismissLabel, onDismiss }: PaymentReturnNoticeProps) {
  const tone = state === "pending" ? "pending" : state === "slow" ? "info" : "success";
  const text =
    state === "pending"
      ? pendingText(t, kind, inBrowser)
      : state === "slow"
        ? t.paid_slow
        : state === "topup"
          ? balance
            ? fmt(t.topup_done, { amount: balance })
            : t.paid_done
          : t.paid_done;
  return (
    <Notice tone={tone} className="kc-paid-notice" onDismiss={onDismiss} dismissLabel={dismissLabel}>
      {text}
    </Notice>
  );
}
