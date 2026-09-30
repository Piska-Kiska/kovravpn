// src/components/dashboard/OrderSummary.tsx
// Right column of the Plan view: total, discount, payment method and the
// view's only gold action. Sticky from 1024px. With "Balance" selected the
// action pays from the unified balance right here, no redirect.
//
// States besides the form:
//   • paid from the balance: the form is replaced by the result (what was
//     paid, until when) and "Done" / "Set up a device"; the form, and with it
//     a second purchase, comes back only on "Done";
//   • a payment page open in the browser (Mini App): the action reopens that
//     page instead of creating a second invoice, and says what to do.
// Inside Telegram the gold action is Telegram's own bottom button (always
// on screen), the page's button stays for everyone else.
"use client";

import type { ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import DigitRoll from "@/components/fx/DigitRoll";
import { Button, Icon, Notice } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { fmtUsd } from "@/lib/dashboard/format";
import { WALLET_KEY, type PayOption } from "@/lib/dashboard/pay-methods";
import type { DashHost } from "./host";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { useMainButton } from "./useMainButton";

export interface OrderPaid {
  /** Formatted amount taken from the balance. */
  amount: string;
  /** Formatted end of the plan after the purchase ("" while unknown). */
  date: string;
}

export interface OrderPending {
  /** "Finish paying in the browser…" */
  note: string;
  /** Open the same payment page again (no new invoice). */
  onReopen(): void;
  /** Forget that page: the action pays again (another method, another term). */
  onForget(): void;
}

export interface OrderSummaryProps {
  t: DashDict;
  lang: Lang;
  total: number;
  perMonth: number;
  /** Price at the monthly rate for the same term (struck through when discounted). */
  refTotal: number;
  disc: number;
  termText: string;
  isRenewal: boolean;
  options: readonly PayOption[];
  selected: PayOption;
  onSelect(key: string): void;
  /** Any payment request in flight (disables everything). */
  busy: boolean;
  /** The request for the selected method is in flight. */
  loading: boolean;
  onPay(): void;
  error: string | null;
  errorAction?: ReactNode;
  onDismissError(): void;
  /** Paid from the balance: the result replaces the form. */
  paid: OrderPaid | null;
  onPaidDone(): void;
  /** After a purchase, when a slot is free: go and set up a device. */
  onSetupDevice?: () => void;
  /** A payment page of this order is open in the browser (Mini App). */
  pending: OrderPending | null;
  /** "Top up $66.58" under the methods when the balance falls short. */
  topupNeed: { label: string; onClick(): void } | null;
  /** Telegram's bottom button (the host's binder), when there is one. */
  mainButton?: DashHost["mainButton"];
  /** A dialog is open over the view: Telegram's button steps aside. */
  suspended: boolean;
}

export function OrderSummary(p: OrderSummaryProps) {
  const { t } = p;
  const shell = useShellT();
  const amount = p.selected.amount ?? fmtUsd(p.total, p.lang);
  const fromBalance = p.selected.route.kind === "wallet";
  const cta = fmt(fromBalance ? (p.isRenewal ? t.renew_balance_cta : t.pay_balance_cta) : p.isRenewal ? t.renew_cta : t.pay_cta, { amount });
  const label = p.pending ? t.pay_reopen : cta;
  const onAction = p.pending ? p.pending.onReopen : p.onPay;
  const native = useMainButton(
    p.mainButton,
    p.paid || p.suspended ? null : { text: label, active: !p.busy, loading: p.loading, onClick: onAction },
  );

  if (p.paid) {
    return (
      <section className="kc-panel kc-panel--accent kc-summary kc-summary--paid" aria-labelledby="kc-summary-title">
        <span className="kc-summary-paid-icon" aria-hidden="true">
          <Icon as={Check} size={22} />
        </span>
        <div className="kc-summary-paid-text" role="status">
          <h2 id="kc-summary-title" className="kc-h2">
            {t.plan_paid_title}
          </h2>
          <p className="kc-body kc-t2">{fmt(t.plan_paid_body, { amount: p.paid.amount, date: p.paid.date || "—" })}</p>
        </div>
        <div className="kc-summary-paid-actions">
          {p.onSetupDevice ? (
            <Button variant="cta" block icon={Plus} onClick={p.onSetupDevice}>
              {t.setup_device}
            </Button>
          ) : null}
          <Button variant="ghost" block onClick={p.onPaidDone}>
            {t.done}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="kc-panel kc-panel--accent kc-summary" aria-labelledby="kc-summary-title">
      <h2 id="kc-summary-title" className="kc-mono kc-t2">
        {t.summary_kicker}
      </h2>
      <div className="kc-summary-total">
        <DigitRoll value={fmtUsd(p.total, p.lang)} className="kc-summary-figure" />
        {p.disc > 0 ? (
          <span className="kc-summary-was">
            <span className="kc-badge">{fmt(t.discount, { n: p.disc })}</span>
            <s aria-hidden="true">{fmtUsd(p.refTotal, p.lang)}</s>
            <span className="kc-sr">{fmt(t.was_price, { price: fmtUsd(p.refTotal, p.lang) })}</span>
          </span>
        ) : null}
      </div>
      <p className="kc-small kc-summary-line">
        {fmt(t.summary_line, { per: fmtUsd(p.perMonth, p.lang), term: p.termText })}
        <br />
        {t.renews_note}
      </p>
      <hr className="kc-hair" />
      <PaymentMethodPicker
        t={t}
        lang={p.lang}
        name="kc-pay-plan"
        options={p.options}
        value={p.selected.key}
        onChange={p.onSelect}
        disabled={p.busy}
        after={
          p.topupNeed
            ? {
                key: WALLET_KEY,
                node: (
                  <div className="kc-summary-topup">
                    <Button variant="quiet" size="sm" icon={Plus} iconSize={16} onClick={p.topupNeed.onClick} disabled={p.busy}>
                      {p.topupNeed.label}
                    </Button>
                  </div>
                ),
              }
            : null
        }
      />
      {native ? null : (
        <Button variant="cta" block loading={p.loading} disabled={p.busy} onClick={onAction} className="kc-summary-cta">
          {p.loading ? (fromBalance ? t.paying : t.redirecting) : label}
        </Button>
      )}
      {p.pending ? (
        <Notice tone="pending" className="kc-summary-pending" onDismiss={p.pending.onForget} dismissLabel={shell.dismiss}>
          {p.pending.note}
        </Notice>
      ) : (
        <p className="kc-small kc-fineprint" aria-live="polite">
          {p.selected.note}
        </p>
      )}
      {p.error ? (
        <Notice tone="error" onDismiss={p.onDismissError} dismissLabel={shell.dismiss} action={p.errorAction}>
          {p.error}
        </Notice>
      ) : null}
    </section>
  );
}
