// src/components/dashboard/TermRadios.tsx
// Billing period: native radios in the order 12, 6, 1 months, with the
// discount, a "Best value" badge on 12 months, the one-time total and the
// per-month price.
"use client";

import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { fmtUsd } from "@/lib/dashboard/format";
import type { PlanPrice, Term } from "@/lib/dashboard/types";

export const TERMS: readonly Term[] = [12, 6, 1];

export function termLabel(t: DashDict, tm: Term): string {
  return tm === 1 ? t.term_1 : tm === 6 ? t.term_6 : t.term_12;
}

export function discountOf(pr: PlanPrice | undefined): number {
  return pr && pr.refMonthly > 0 ? Math.round((1 - pr.perMonth / pr.refMonthly) * 100) : 0;
}

export interface TermRadiosProps {
  t: DashDict;
  lang: Lang;
  term: Term;
  prices: Readonly<Record<string, PlanPrice>>;
  disabled: boolean;
  onChange(term: Term): void;
}

export function TermRadios({ t, lang, term, prices, disabled, onChange }: TermRadiosProps) {
  return (
    <fieldset className="kc-terms">
      <legend className="kc-label kc-terms-legend">{t.term_label}</legend>
      <div className="kc-terms-list">
        {TERMS.map((tm) => {
          const pr = prices[String(tm)];
          if (!pr) return null;
          const disc = discountOf(pr);
          return (
            <label key={tm} className="kc-radio-row kc-term-row">
              <input className="kc-sr" type="radio" name="kc-term" value={tm} checked={term === tm} disabled={disabled} onChange={() => onChange(tm)} />
              <span className="kc-radio-dot" aria-hidden="true" />
              <span className="kc-term-text">
                <span className="kc-term-top">
                  <span className="kc-term-label">{termLabel(t, tm)}</span>
                  {disc > 0 ? <span className="kc-badge">{fmt(t.discount, { n: disc })}</span> : null}
                  {tm === 12 ? <span className="kc-badge kc-badge--gold">{t.best_value}</span> : null}
                </span>
                <span className="kc-term-sub">{fmt(t.billed_once, { total: fmtUsd(pr.total, lang) })}</span>
              </span>
              <span className="kc-term-price">{fmt(t.per_month, { price: fmtUsd(pr.perMonth, lang) })}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
