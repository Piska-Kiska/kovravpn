// src/components/dashboard/RewardsView.tsx
// Invite friends (referral link, share, stats) and the promo code form.
// Inside the Mini App the invite is the bot link (t.me/…?start=ref_…, what the
// bot itself hands out) and Share opens Telegram's own chat picker, which
// every Telegram client has; navigator.share is missing in several of
// Telegram's webviews.
"use client";

import { useState, type FormEvent } from "react";
import { Share2 } from "lucide-react";
import { Button, CopyField, Field, Notice, cx } from "@/components/cabinet";
import { fmt } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { REF_REWARD_DAYS } from "@/lib/dashboard/format";
import type { ReferralData } from "@/lib/dashboard/types";
import { Count, ViewHead, useRise } from "./shared";

export type PromoMsg = { kind: "ok" | "err"; text: string };

export interface RewardsViewProps {
  t: DashDict;
  referral: ReferralData | null;
  promoCode: string;
  onPromoCode(v: string): void;
  promoLoading: boolean;
  promoMsg: PromoMsg | null;
  onApplyPromo(): void;
  /** Mini App: share through Telegram (host.share); the bot link is the invite. */
  shareInTelegram?: (url: string, text: string) => void;
}

export function RewardsView({ t, referral, promoCode, onPromoCode, promoLoading, promoMsg, onApplyPromo, shareInTelegram }: RewardsViewProps) {
  const shell = useShellT();
  const rise = useRise();
  const [canNativeShare] = useState(() => typeof navigator !== "undefined" && typeof navigator.share === "function");
  const inTelegram = typeof shareInTelegram === "function";
  const link = referral ? (inTelegram && referral.botLink ? referral.botLink : referral.link) : "";
  const canShare = inTelegram || canNativeShare;

  const share = async () => {
    if (!referral || !link) return;
    if (shareInTelegram) {
      shareInTelegram(link, t.share_text);
      return;
    }
    try {
      await navigator.share({ title: "Kovra", text: t.share_text, url: link });
    } catch {
      // AbortError (the user closed the sheet) or an unsupported payload.
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (promoCode && !promoLoading) onApplyPromo();
  };

  const stats: readonly { key: string; value: number; label: string }[] = [
    { key: "inv", value: referral?.total ?? 0, label: t.ref_invited },
    { key: "paid", value: referral?.rewarded ?? 0, label: t.ref_paid },
    { key: "days", value: (referral?.rewarded ?? 0) * REF_REWARD_DAYS, label: t.ref_days_earned },
  ];

  const r1 = rise(1);
  const r2 = rise(2);

  return (
    <>
      <ViewHead kicker={inTelegram ? undefined : t.rewards_kicker} title={t.rewards_title} />
      <div className="kc-rewards-grid">
        <section className={cx("kc-panel kc-panel--accent kc-ref", r1.className)} style={r1.style} aria-labelledby="kc-ref-title">
          <div className="kc-ref-head">
            <h2 id="kc-ref-title" className="kc-h2">
              {t.ref_title}
            </h2>
            <p className="kc-ref-lede">{fmt(t.ref_body, { days: REF_REWARD_DAYS })}</p>
          </div>
          <CopyField value={link} label={t.ref_link_label} copyLabel={shell.copy} copiedLabel={shell.copied} failedLabel={shell.copy_failed} />
          {canShare && referral ? (
            <div>
              <Button variant="ghost" size="sm" icon={Share2} iconSize={16} onClick={() => void share()}>
                {t.share}
              </Button>
            </div>
          ) : null}
          <dl className="kc-stats">
            {stats.map((s) => (
              <div key={s.key} className="kc-stat">
                <dt className="kc-mono kc-t2">{s.label}</dt>
                <dd>
                  <Count value={s.value} className="kc-stat-value k-metal" />
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={cx("kc-panel kc-promo", r2.className)} style={r2.style} aria-labelledby="kc-promo-title">
          <h2 id="kc-promo-title" className="kc-h2">
            {t.promo_title}
          </h2>
          <form className="kc-promo-form" noValidate onSubmit={onSubmit}>
            <div className="kc-promo-field">
              <Field
                id="kc-promo"
                label={t.promo_label}
                mono
                value={promoCode}
                maxLength={32}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder={t.promo_ph}
                aria-describedby={promoMsg ? "kc-promo-msg" : undefined}
                onChange={(e) => onPromoCode(e.target.value)}
              />
            </div>
            <Button type="submit" variant="ghost" loading={promoLoading} disabled={!promoCode} className="kc-promo-btn">
              {t.promo_apply}
            </Button>
          </form>
          {promoMsg ? (
            <Notice id="kc-promo-msg" tone={promoMsg.kind === "ok" ? "success" : "error"}>
              {promoMsg.text}
            </Notice>
          ) : null}
        </section>
      </div>
    </>
  );
}
