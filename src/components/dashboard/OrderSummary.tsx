// src/components/dashboard/OrderSummary.tsx
// Right column of the Plan view: total, discount, payment method and the
// view's only gold action. Sticky from 1024px.
"use client";

import DigitRoll from "@/components/fx/DigitRoll";
import { Button, Notice } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { fmtUsd } from "@/lib/dashboard/format";
import type { PayOption } from "@/lib/dashboard/pay-methods";
import { PaymentMethodPicker } from "./PaymentMethodPicker";

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
  onDismissError(): void;
}

export function OrderSummary(p: OrderSummaryProps) {
  const { t } = p;
  const shell = useShellT();
  const amount = p.selected.amount ?? fmtUsd(p.total, p.lang);
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
      <PaymentMethodPicker t={t} lang={p.lang} name="kc-pay-plan" options={p.options} value={p.selected.key} onChange={p.onSelect} disabled={p.busy} />
      <Button variant="cta" block loading={p.loading} disabled={p.busy} onClick={p.onPay} className="kc-summary-cta">
        {p.loading ? t.redirecting : fmt(p.isRenewal ? t.renew_cta : t.pay_cta, { amount })}
      </Button>
      <p className="kc-small kc-fineprint" aria-live="polite">
        {p.selected.note}
      </p>
      {p.error ? (
        <Notice tone="error" onDismiss={p.onDismissError} dismissLabel={shell.dismiss}>
          {p.error}
        </Notice>
      ) : null}
    </section>
  );
}
