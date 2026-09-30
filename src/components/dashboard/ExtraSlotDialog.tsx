// src/components/dashboard/ExtraSlotDialog.tsx
// "Buy an extra device slot": price, payment method and one gold CTA. With
// "Balance" selected the slot is paid right here and the dialog confirms it.
"use client";

import { useState, type ReactNode } from "react";
import { Button, Dialog, Notice } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { fmtUsd } from "@/lib/dashboard/format";
import { buildPayOptions, choosePayKey, readPayMethod, writePayMethod, type PayRoute } from "@/lib/dashboard/pay-methods";
import { usdToCentsClient } from "@/lib/dashboard/wallet";
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
  errorAction?: ReactNode;
  onDismissError(): void;
  /** The unified balance in cents; null hides the "Balance" row. */
  balanceCents: number | null;
  /** Paid from the balance: the confirmation replaces the form. */
  done: string | null;
}

export function ExtraSlotDialog(p: ExtraSlotDialogProps) {
  const { t, lang } = p;
  const shell = useShellT();
  const [picked, setPicked] = useState<string | null>(null);
  const [remembered] = useState<string | null>(() => (typeof window === "undefined" ? null : readPayMethod()));
  const priceCents = usdToCentsClient(p.price);
  const options = buildPayOptions({
    lang,
    t,
    priceUsd: p.price,
    lavaEnabled: p.lavaEnabled,
    wallet: p.balanceCents !== null ? { balanceCents: p.balanceCents, priceCents } : null,
  });
  const key = choosePayKey(options, picked, remembered);
  const selected = options.find((o) => o.key === key) ?? options[0];
  const loading = p.isLoading(selected.route);
  const amount = selected.amount ?? fmtUsd(p.price, lang);
  const fromBalance = selected.route.kind === "wallet";

  const onSelect = (k: string) => {
    setPicked(k);
    writePayMethod(k);
  };

  return (
    <Dialog open={p.open} onClose={p.onClose} title={t.slot_dialog_title} locked={p.busy}>
      <div className="kc-slotdlg">
        {p.done ? (
          <>
            <Notice tone="success">{p.done}</Notice>
            <Button variant="ghost" block onClick={p.onClose} data-autofocus="">
              {t.done}
            </Button>
          </>
        ) : (
          <>
            <p className="kc-dialog-body">{fmt(t.slot_body, { days: p.days })}</p>
            <p className="kc-slotdlg-price">
              <span className="kc-slotdlg-amount">{fmtUsd(p.price, lang)}</span>
              <span className="kc-small">{fmt(t.slot_days, { days: p.days })}</span>
            </p>
            <PaymentMethodPicker t={t} lang={lang} name="kc-pay-slot" options={options} value={selected.key} onChange={onSelect} disabled={p.busy} />
            <Button variant="cta" block loading={loading} disabled={p.busy} onClick={() => p.onPay(selected.route)}>
              {loading ? (fromBalance ? t.paying : t.redirecting) : fmt(fromBalance ? t.pay_balance_cta : t.slot_cta, { amount })}
            </Button>
            <p className="kc-small kc-fineprint" aria-live="polite">
              {selected.note}
            </p>
            {p.error ? (
              <Notice tone="error" onDismiss={p.onDismissError} dismissLabel={shell.dismiss} action={p.errorAction}>
                {p.error}
              </Notice>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}
