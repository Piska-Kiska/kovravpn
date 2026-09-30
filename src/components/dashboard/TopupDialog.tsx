// src/components/dashboard/TopupDialog.tsx
// "Top up balance": amount (quick chips or typed), payment method, one gold
// action. The invoice comes from POST /api/wallet/topup; the page then leaves
// for it (site) or opens it in the browser (Mini App). The money lands on the
// balance shared with the Telegram bot.
"use client";

import { useId, useState } from "react";
import { Button, Dialog, Field, Notice, cx } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { fmtMoney, fmtUsdShort } from "@/lib/dashboard/format";
import { buildTopupOptions, choosePayKey, topupMinUsd, type TopupMethodInfo, type TopupRoute } from "@/lib/dashboard/pay-methods";
import { checkTopupAmount } from "@/lib/dashboard/wallet";
import { PaymentMethodPicker } from "./PaymentMethodPicker";
import { fmtCents } from "./WalletPanel";

export interface TopupConfig {
  methods: readonly TopupMethodInfo[];
  maxUsd: number;
  quickUsd: readonly number[];
}

export interface TopupDialogProps {
  open: boolean;
  /** Bumped on every opening: the form starts fresh. */
  openSeq: number;
  onClose(): void;
  t: DashDict;
  lang: Lang;
  balanceCents: number;
  config: TopupConfig;
  /** Missing amount of a purchase that did not fit, in cents: prefills the amount. */
  suggestCents: number | null;
  busy: boolean;
  error: string | null;
  onDismissError(): void;
  onSubmit(route: TopupRoute, amountUsd: number): void;
}

const TOPUP_METHOD_KEY = "kovra_topup_method";
const DEFAULT_USD = 20;

function readRemembered(): string | null {
  try {
    return window.localStorage.getItem(TOPUP_METHOD_KEY);
  } catch {
    return null;
  }
}

function remember(key: string): void {
  try {
    window.localStorage.setItem(TOPUP_METHOD_KEY, key);
  } catch {
    // The choice still applies for this sheet.
  }
}

/** Whole dollars, as typed: "20", or "12.5" when cents matter. */
function amountText(usd: number): string {
  return Number.isInteger(usd) ? String(usd) : usd.toFixed(2);
}

function initialUsd(suggestCents: number | null, minUsd: number, maxUsd: number): number {
  if (suggestCents !== null && suggestCents > 0) {
    return Math.min(maxUsd, Math.max(minUsd, Math.ceil(suggestCents / 100)));
  }
  return DEFAULT_USD;
}

export function TopupDialog(p: TopupDialogProps) {
  const { t } = p;
  return (
    <Dialog open={p.open} onClose={p.onClose} title={t.topup_title} locked={p.busy}>
      {p.open ? <TopupForm key={p.openSeq} {...p} /> : null}
    </Dialog>
  );
}

function TopupForm(p: TopupDialogProps) {
  const { t, lang, config } = p;
  const shell = useShellT();
  const uid = useId();
  const firstMin = Math.min(...config.methods.filter((m) => m.enabled).map((m) => m.minUsd), 5);
  const [text, setText] = useState(() => amountText(initialUsd(p.suggestCents, firstMin, config.maxUsd)));
  const [touched, setTouched] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [remembered] = useState<string | null>(readRemembered);

  // Options depend on the amount (lava.top rows show the exact charge and
  // drop out below their floor); a malformed amount keeps the last good rows.
  const loose = checkTopupAmount(text, 0, config.maxUsd);
  const amountForRows = loose.ok ? loose.amountUsd : undefined;
  const options = buildTopupOptions({ lang, t, amountUsd: amountForRows, methods: config.methods });
  const key = options.length > 0 ? choosePayKey(options, picked, remembered) : null;
  const selected = options.find((o) => o.key === key) ?? null;

  const minUsd = selected ? topupMinUsd(selected.route, config.methods) : firstMin;
  const check = checkTopupAmount(text, minUsd, config.maxUsd);
  const money = (usd: number) => fmtMoney(usd, "USD", lang);
  const amountError = check.ok
    ? null
    : check.reason === "min"
      ? fmt(t.topup_min, { amount: money(minUsd) })
      : check.reason === "max"
        ? fmt(t.topup_max, { amount: money(config.maxUsd) })
        : t.topup_format;

  const submit = () => {
    setTouched(true);
    if (!selected || !check.ok || p.busy) return;
    p.onSubmit(selected.route, check.amountUsd);
  };

  const chipsName = `${uid}-quick`;
  const current = check.ok ? check.amountUsd : null;

  if (options.length === 0) {
    return (
      <div className="kc-topup">
        <Notice tone="info">{t.topup_unavailable}</Notice>
      </div>
    );
  }

  return (
    <form
      className="kc-topup"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="kc-topup-balance">
        <span className="kc-small">{t.topup_current}</span>
        <span className="kc-topup-balance-amount">{fmtCents(p.balanceCents, lang)}</span>
      </p>

      <fieldset className="kc-topup-quick">
        <legend className="kc-label">{t.topup_amount}</legend>
        <div className="kc-chips">
          {config.quickUsd.map((usd) => (
            <label key={usd} className={cx("kc-chip", current === usd && "is-on")}>
              <input
                className="kc-sr"
                type="radio"
                name={chipsName}
                value={usd}
                checked={current === usd}
                disabled={p.busy}
                onChange={() => {
                  setText(amountText(usd));
                  setTouched(false);
                }}
              />
              <span>{fmtUsdShort(usd, lang)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        id={`${uid}-amount`}
        label={t.topup_other}
        mono
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        maxLength={10}
        value={text}
        disabled={p.busy}
        error={touched ? (amountError ?? undefined) : undefined}
        onChange={(e) => {
          setText(e.target.value);
          setTouched(true);
        }}
      />

      <PaymentMethodPicker
        t={t}
        lang={lang}
        name={`${uid}-method`}
        options={options}
        value={selected?.key ?? ""}
        onChange={(k) => {
          setPicked(k);
          remember(k);
        }}
        disabled={p.busy}
      />

      <p className="kc-small kc-fineprint" aria-live="polite">
        {selected?.note}
      </p>
      <p className="kc-small kc-fineprint">{t.topup_note}</p>
      {p.error ? (
        <Notice tone="error" onDismiss={p.onDismissError} dismissLabel={shell.dismiss}>
          {p.error}
        </Notice>
      ) : null}
      {/* The action stays at the bottom of the sheet while the list scrolls. */}
      <div className="kc-topup-foot">
        {!touched && amountError && check.ok === false && check.reason === "min" ? (
          <p className="kc-small kc-topup-min">{amountError}</p>
        ) : null}
        <Button type="submit" variant="cta" block loading={p.busy} disabled={p.busy || !check.ok}>
          {p.busy
            ? t.topup_opening
            : check.ok
              ? fmt(t.topup_cta, { amount: selected?.amount ?? money(check.amountUsd) })
              : t.wallet_topup}
        </Button>
      </div>
    </form>
  );
}
