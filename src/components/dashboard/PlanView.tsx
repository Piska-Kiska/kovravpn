// src/components/dashboard/PlanView.tsx
// Plan & billing (spec §9.4). >= 1024px: 7/5 grid, the order summary sticks
// on the right; the extra-slot and subscriptions panels sit under the plan
// panel. Below: plan -> billing period -> summary -> slot -> subscriptions.
"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Button, Icon, cx } from "@/components/cabinet";
import { fmt, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { fmtDate, fmtUsd } from "@/lib/dashboard/format";
import { buildPayOptions, effectivePayMethod, readPayMethod, writePayMethod, type PayRoute } from "@/lib/dashboard/pay-methods";
import type { AccountData, PlanKind, Pricing, Term } from "@/lib/dashboard/types";
import { OrderSummary } from "./OrderSummary";
import { SubsList } from "./SubsList";
import { TermRadios, discountOf, termLabel } from "./TermRadios";
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
  onDismissPlanError(): void;
  onBuySlot(): void;
}

const KINDS: readonly PlanKind[] = ["plan3", "plan1"];

export function PlanView(p: PlanViewProps) {
  const { t, lang, pricing, account } = p;
  const rise = useRise();
  const [preferred, setPreferred] = useState<string | null>(() => (typeof window === "undefined" ? null : readPayMethod()));

  if (!pricing) {
    return <ViewHead kicker={t.billing_kicker} title={t.plan_title} />;
  }

  const prices = p.effectiveKind === "plan3" ? pricing.plan3 : pricing.plan1;
  const sel = prices[String(p.term)];
  const total = sel?.total ?? 0;
  const disc = discountOf(sel);
  const options = buildPayOptions({ lang, t, priceUsd: sel?.total, lavaEnabled: pricing.lavaEnabled });
  const key = effectivePayMethod(options, preferred);
  const selected = options.find((o) => o.key === key) ?? options[0];

  const onSelect = (k: string) => {
    setPreferred(k);
    writePayMethod(k);
  };

  const r1 = rise(1);
  const r2 = rise(2);
  const r3 = rise(3);

  return (
    <>
      <ViewHead kicker={t.billing_kicker} title={t.plan_title} />
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
            onDismissError={p.onDismissPlanError}
          />
        </div>

        <div className={cx("kc-plan-extra", r3.className)} style={r3.style}>
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
          {account ? <SubsList t={t} lang={lang} subs={account.subs} /> : null}
        </div>
      </div>
    </>
  );
}
