// src/components/dashboard/PaymentMethodPicker.tsx
// Payment method radiogroup (spec §9.5): primary rows plus a "More ways to
// pay" disclosure. A selected method from the "more" group stays visible in
// the primary list while the disclosure is closed. Everything is disabled
// while a payment request is in flight; a single row can be disabled on its
// own (the balance that does not cover the price) and still explains why.
"use client";

import { Fragment, useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Icon, cx } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import type { PayOption } from "@/lib/dashboard/pay-methods";

export interface PaymentMethodPickerProps {
  t: DashDict;
  lang: Lang;
  /** Radio group name, unique per picker on the page. */
  name: string;
  options: readonly PayOption<{ kind: string }>[];
  value: string;
  onChange(key: string): void;
  disabled: boolean;
  /** Something to show right under one row (e.g. "Top up $66.58" under the balance that falls short). */
  after?: { key: string; node: ReactNode } | null;
}

function Row({ o, name, checked, disabled, onChange }: { o: PayOption<{ kind: string }>; name: string; checked: boolean; disabled: boolean; onChange(key: string): void }) {
  return (
    <label className={cx("kc-radio-row kc-pay-row", o.sub && "has-sub", o.disabled && "is-unavailable")}>
      <input className="kc-sr" type="radio" name={name} value={o.key} checked={checked} disabled={disabled || o.disabled === true} onChange={() => onChange(o.key)} />
      <span className="kc-radio-dot" aria-hidden="true" />
      <span className="kc-pay-icon" aria-hidden="true">
        <Icon as={o.icon} size={18} />
      </span>
      <span className="kc-pay-text">
        <span className="kc-pay-label">{o.label}</span>
        {o.sub ? <span className="kc-pay-sub">{o.sub}</span> : null}
      </span>
      {o.amount ? (
        <span className="kc-pay-amount">
          <span aria-hidden="true">{o.amount}</span>
          <span className="kc-sr">{o.amountLabel ?? o.amount}</span>
        </span>
      ) : (
        <span />
      )}
    </label>
  );
}

export function PaymentMethodPicker({ t, lang, name, options, value, onChange, disabled, after = null }: PaymentMethodPickerProps) {
  const uid = useId();
  const moreId = `${uid}-more`;
  const legendId = `${uid}-legend`;
  const [open, setOpen] = useState(false);

  const primary = options.filter((o) => o.group === "primary");
  const more = options.filter((o) => o.group === "more");
  const selectedMore = more.find((o) => o.key === value) ?? null;
  const promoted = !open && selectedMore ? [selectedMore] : [];
  const hiddenCount = more.length - promoted.length;
  const lavaInMore = more.some((o) => o.route.kind === "lava");

  return (
    <fieldset className="kc-pay" aria-labelledby={legendId}>
      <legend id={legendId} className="kc-label kc-pay-legend">
        {t.pay_with}
      </legend>
      <div className="kc-pay-list">
        {[...primary, ...promoted].map((o) => (
          <Fragment key={o.key}>
            <Row o={o} name={name} checked={o.key === value} disabled={disabled} onChange={onChange} />
            {after && after.key === o.key ? after.node : null}
          </Fragment>
        ))}
      </div>
      {more.length > 0 && (open || hiddenCount > 0) ? (
        <>
          <button type="button" className="kc-more-toggle" aria-expanded={open} aria-controls={open ? moreId : undefined} onClick={() => setOpen((v) => !v)}>
            <span>{open ? t.fewer_ways : fmt(t.more_ways, { n: hiddenCount })}</span>
            <Icon as={ChevronDown} size={16} className="kc-chev" />
          </button>
          {open ? (
            <div id={moreId} className="kc-pay-list kc-pay-more kc-enter">
              {lang === "ru" && lavaInMore ? <p className="kc-small kc-pay-hint">{t.m_lava_ru_hint}</p> : null}
              {more.map((o) => (
                <Row key={o.key} o={o} name={name} checked={o.key === value} disabled={disabled} onChange={onChange} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}
