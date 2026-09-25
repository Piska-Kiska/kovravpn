// src/components/dashboard/ExtraSlotDialog.tsx
// "Buy an extra device slot": price, payment method and one gold CTA.
"use client";

import { useState } from "react";
import { Button, Dialog, Notice } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { fmtUsd } from "@/lib/dashboard/format";
import { buildPayOptions, effectivePayMethod, readPayMethod, writePayMethod, type PayRoute } from "@/lib/dashboard/pay-methods";
import { PaymentMethodPicker } from "./PaymentMethodPicker";

export interface ExtraSlotDialogProps {
  open: boolean;
  onClose(): void;
  t: DashDict;
  lang: Lang;
  price: number;
  days: number;
  lavaEnabled: boolean | undefined;
  busy: boolean;
  isLoading(route: PayRoute): boolean;
  onPay(route: PayRoute): void;
  error: string | null;
  onDismissError(): void;
}

export function ExtraSlotDialog(p: ExtraSlotDialogProps) {
  const { t, lang } = p;
  const shell = useShellT();
  const [preferred, setPreferred] = useState<string | null>(() => (typeof window === "undefined" ? null : readPayMethod()));
  const options = buildPayOptions({ lang, t, priceUsd: p.price, lavaEnabled: p.lavaEnabled });
  const key = effectivePayMethod(options, preferred);
  const selected = options.find((o) => o.key === key) ?? options[0];
  const loading = p.isLoading(selected.route);
  const amount = selected.amount ?? fmtUsd(p.price, lang);

  const onSelect = (k: string) => {
    setPreferred(k);
    writePayMethod(k);
  };

  return (
    <Dialog open={p.open} onClose={p.onClose} title={t.slot_dialog_title} locked={p.busy}>
      <div className="kc-slotdlg">
        <p className="kc-dialog-body">{fmt(t.slot_body, { days: p.days })}</p>
        <p className="kc-slotdlg-price">
          <span className="kc-slotdlg-amount">{fmtUsd(p.price, lang)}</span>
          <span className="kc-small">{fmt(t.slot_days, { days: p.days })}</span>
        </p>
        <PaymentMethodPicker t={t} lang={lang} name="kc-pay-slot" options={options} value={selected.key} onChange={onSelect} disabled={p.busy} />
        <Button variant="cta" block loading={loading} disabled={p.busy} onClick={() => p.onPay(selected.route)}>
          {loading ? t.redirecting : fmt(t.slot_cta, { amount })}
        </Button>
        <p className="kc-small kc-fineprint" aria-live="polite">
          {selected.note}
        </p>
        {p.error ? (
          <Notice tone="error" onDismiss={p.onDismissError} dismissLabel={shell.dismiss}>
            {p.error}
          </Notice>
        ) : null}
      </div>
    </Dialog>
  );
}
