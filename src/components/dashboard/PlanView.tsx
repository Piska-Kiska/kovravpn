// src/components/dashboard/PlanView.tsx
// Plan & billing (spec §9.4). >= 1024px: 7/5 grid, the order summary sticks
// on the right; the balance, extra-slot and subscriptions panels sit under the
// plan panel. Below: plan -> billing period -> summary -> balance -> slot ->
// subscriptions.
//
// Inside the Mini App (`embedded`) the kicker above the title and the balance
// panel go (the balance chip sits in the top bar), and the extra slot is
// offered only while a plan runs (it is sold on top of one).
"use client";

import { useState, type ReactNode } from "react";
import { Check, Plus } from "lucide-react";
import { Button, Icon, cx } from "@/components/cabinet";
import type { DashHost } from "./host";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { fmtDate, fmtUsd } from "@/lib/dashboard/format";
import { WALLET_KEY, buildPayOptions, choosePayKey, readPayMethod, writePayMethod, type PayRoute } from "@/lib/dashboard/pay-methods";
import { usdToCentsClient } from "@/lib/dashboard/wallet";
import type { AccountData, PlanKind, Pricing, Term } from "@/lib/dashboard/types";
import { OrderSummary, type OrderPaid, type OrderPending } from "./OrderSummary";
import { fmtCents } from "./WalletPanel";
import { SubsList } from "./SubsList";
import { TermRadios, discountOf, termLabel } from "./TermRadios";
import { WalletPanel } from "./WalletPanel";
import { ViewHead, useRise } from "./shared";

export interface PlanViewProps {
  t: DashDict;
  lang: Lang;
  pricing: Pricing | null;
  account: AccountData | null;
  isRenewal: boolean;
  effectiveKind: PlanKind;
  planKind: PlanKind;
  term: Term;
  onPlanKind(k: PlanKind): void;
  onTerm(t: Term): void;
  busy: boolean;
  isLoading(route: PayRoute): boolean;
  onPay(route: PayRoute): void;
  planError: string | null;
  /** A control under the error (e.g. "Top up" when the balance fell short). */
  planErrorAction?: ReactNode;
  onDismissPlanError(): void;
  /** Paid from the balance: the summary shows the result instead of the form. */
  planPaid: OrderPaid | null;
  onPlanPaidDone(): void;
  /** After a purchase with a free slot: set up a device. */
  onSetupDevice?: () => void;
  /** A payment page of this plan is open in the browser (Mini App). */
  pending: OrderPending | null;
  onBuySlot(): void;
  /** The unified balance in cents; null while unknown (no balance UI). */
  balanceCents: number | null;
  onTopup(): void;
  /** Top up exactly what the selected term is missing. */
  onTopupNeed(needCents: number): void;
  /** Inside the Telegram Mini App. */
  embedded: boolean;
  /** Telegram's bottom button binder (host), when there is one. */
  mainButton?: DashHost["mainButton"];
  /** A dialog is open over the view. */
  suspended: boolean;
}

const KINDS: readonly PlanKind[] = ["plan3", "plan1"];

export function PlanView(p: PlanViewProps) {
  const { t, lang, pricing, account } = p;
  const rise = useRise();
  // Picked on this page view (wins), and remembered from earlier visits.
  const [picked, setPicked] = useState<string | null>(null);
  const [remembered] = useState<string | null>(() => (typeof window === "undefined" ? null : readPayMethod()));

  const kicker = p.embedded ? undefined : t.billing_kicker;
  if (!pricing) {
    return <ViewHead kicker={kicker} title={t.plan_title} />;
  }

  const prices = p.effectiveKind === "plan3" ? pricing.plan3 : pricing.plan1;
  const sel = prices[String(p.term)];
  const total = sel?.total ?? 0;
  const disc = discountOf(sel);
  const priceCents = sel ? usdToCentsClient(sel.total) : null;
  const options = buildPayOptions({
    lang,
    t,
    priceUsd: sel?.total,
    lavaEnabled: pricing.lavaEnabled,
    wallet: p.balanceCents !== null ? { balanceCents: p.balanceCents, priceCents } : null,
  });
  const key = choosePayKey(options, picked, remembered);
  const selected = options.find((o) => o.key === key) ?? options[0];

  const onSelect = (k: string) => {
    setPicked(k);
    writePayMethod(k);
    // Another method is another payment: the page opened for this one is not reopened.
    p.pending?.onForget();
  };

  // The balance row shows but does not cover the price: offer the missing amount.
  const walletRow = options.find((o) => o.key === WALLET_KEY);
  const needCents = walletRow?.disabled && priceCents !== null && p.balanceCents !== null ? priceCents - p.balanceCents : 0;
  const topupNeed =
    needCents > 0 ? { label: fmt(t.wallet_topup_need, { amount: fmtCents(needCents, lang) }), onClick: () => p.onTopupNeed(needCents) } : null;

  const r1 = rise(1);
  const r2 = rise(2);
  const r3 = rise(3);

  return (
    <>
      <ViewHead kicker={kicker} title={t.plan_title} />
      <div className="kc-plan-grid">
        <section className={cx("kc-panel kc-plan-main", r1.className)} style={r1.style} aria-labelledby="kc-plan-choose">
          {p.isRenewal ? (
            <div className="kc-stack">
              <h2 id="kc-plan-choose" className="kc-h2">
                {t.plan_title_renew}
              </h2>
              <div className="kc-renew-row">
                <div>
                  <p className="kc-small">{t.current_plan}</p>
                  <p className="kc-h3">{p.effectiveKind === "plan3" ? t.plan_3dev : t.plan_1dev}</p>
                </div>
                <p className="kc-renew-until">{fmt(t.current_until, { date: fmtDate(account?.maxExpiry ?? 0, lang) })}</p>
              </div>
              <p className="kc-small">{t.renew_note}</p>
            </div>
          ) : (
            <div className="kc-stack">
              <h2 id="kc-plan-choose" className="kc-h2">
                {t.plan_title_new}
              </h2>
              <fieldset className="kc-kinds">
                <legend className="kc-label kc-kinds-legend">{t.plan_kind_label}</legend>
                <div className="kc-kinds-grid">
                  {KINDS.map((k) => {
                    const pm = (k === "plan3" ? pricing.plan3 : pricing.plan1)[String(p.term)];
                    return (
                      <label key={k} className="kc-tile kc-kind-tile">
                        <input className="kc-sr" type="radio" name="kc-plan-kind" value={k} checked={p.planKind === k} disabled={p.busy} onChange={() => p.onPlanKind(k)} />
                        <span className="kc-tile-check" aria-hidden="true">
                          <Icon as={Check} size={12} />
                        </span>
                        <span className="kc-kind-label">{k === "plan3" ? t.plan_3dev : t.plan_1dev}</span>
                        {pm ? <span className="kc-kind-sub">{fmt(t.per_month, { price: fmtUsd(pm.perMonth, lang) })}</span> : null}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          )}
          <hr className="kc-hair kc-plan-hair" />
          <TermRadios t={t} lang={lang} term={p.term} prices={prices} disabled={p.busy} onChange={p.onTerm} />
        </section>

        <div className={cx("kc-plan-side", r2.className)} style={r2.style}>
          <OrderSummary
            t={t}
            lang={lang}
            total={total}
            perMonth={sel?.perMonth ?? 0}
            refTotal={(sel?.refMonthly ?? 0) * p.term}
            disc={disc}
            termText={termLabel(t, p.term)}
            isRenewal={p.isRenewal}
            options={options}
            selected={selected}
            onSelect={onSelect}
            busy={p.busy}
            loading={p.isLoading(selected.route)}
            onPay={() => p.onPay(selected.route)}
            error={p.planError}
            errorAction={p.planErrorAction}
            onDismissError={p.onDismissPlanError}
            paid={p.planPaid}
            onPaidDone={p.onPlanPaidDone}
            onSetupDevice={p.onSetupDevice}
            pending={p.pending}
            topupNeed={topupNeed}
            mainButton={p.mainButton}
            suspended={p.suspended}
          />
        </div>

        <div className={cx("kc-plan-extra", r3.className)} style={r3.style}>
          {p.balanceCents !== null && !p.embedded ? (
            <WalletPanel t={t} lang={lang} balanceCents={p.balanceCents} onTopup={p.onTopup} disabled={p.busy} />
          ) : null}
          {p.isRenewal ? (
          <section className="kc-panel kc-slotpanel" aria-labelledby="kc-slot-title">
            <div className="kc-slotpanel-text">
              <h2 id="kc-slot-title" className="kc-h3">
                {t.slot_title}
              </h2>
              <p className="kc-small">{fmt(t.slot_body, { days: pricing.deviceAddonDays })}</p>
              <p className="kc-slotpanel-price">{fmt(t.slot_price, { price: fmtUsd(pricing.deviceAddonPrice, lang), days: pricing.deviceAddonDays })}</p>
            </div>
            <Button variant="ghost" icon={Plus} onClick={p.onBuySlot} disabled={p.busy}>
              {t.slot_buy}
            </Button>
          </section>
          ) : null}
          {account ? <SubsList t={t} lang={lang} subs={account.subs} /> : null}
        </div>
      </div>
    </>
  );
}
