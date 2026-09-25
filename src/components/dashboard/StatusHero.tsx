// src/components/dashboard/StatusHero.tsx
// Top of the Devices view (spec §9.2): plan state, days left, slot meter and
// the view's primary action. The headline is the view's h1. From 768px the
// brand threads fill the right side in every state.
"use client";

import ThreadCanvas from "@/components/fx/ThreadCanvas";
import { cx } from "@/components/cabinet";
import { fmt, plural, type Lang } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import type { HeroState } from "@/lib/dashboard/format";
import { Count, HashLink, useMediaQuery, useRise } from "./shared";
import type { NavTarget } from "./useDashView";

export interface StatusHeroProps {
  t: DashDict;
  lang: Lang;
  state: HeroState;
  /** "Plan · 3 devices", or null when no plan is known. */
  planLabel: string | null;
  days: number;
  /** Formatted maxExpiry. */
  date: string;
  used: number;
  total: number;
  onNavigate(target: NavTarget): void;
}

function SlotMeter({ t, used, total }: { t: DashDict; used: number; total: number }) {
  const n = Math.min(total, 10);
  return (
    <div className="kc-meter">
      <div className="kc-meter-top">
        <span className="kc-small">{t.slots_label}</span>
        <span className="kc-meter-count" aria-hidden="true">
          {used} / {total}
        </span>
        <span className="kc-sr">{fmt(t.slots_used_sr, { used, total })}</span>
      </div>
      {total > 10 ? (
        <div className="kc-meter-bar" aria-hidden="true">
          <span style={{ transform: `scaleX(${Math.min(1, used / total)})` }} />
        </div>
      ) : (
        <div className="kc-meter-segs" aria-hidden="true">
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className={cx("kc-meter-seg", i < used && "is-used")} />
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusHero({ t, lang, state, planLabel, days, date, used, total, onNavigate }: StatusHeroProps) {
  const wide = useMediaQuery("(min-width: 768px)");
  const rise = useRise();
  const r = rise(0);
  const live = state === "active" || state === "expiring";

  const kicker = live ? (planLabel ?? plural(lang, total, t.slots_plan)) : state === "expired" ? (planLabel ?? t.no_plan) : t.no_plan;
  const title =
    state === "active"
      ? t.hero_title_active
      : state === "expiring"
        ? plural(lang, days, t.hero_title_expiring)
        : state === "expired"
          ? t.hero_title_expired
          : t.hero_title_none;

  return (
    <section className={cx("kc-panel kc-hero", `kc-hero--${state}`, r.className)} style={r.style} aria-labelledby="kc-hero-title">
      {/* the brand threads fill the right side in every state: woven into a
          knot while the plan runs, loose when there is none */}
      {wide ? (
        <div className="kc-hero-threads" aria-hidden="true">
          <ThreadCanvas density={0.9} opacity={live ? 0.35 : 0.3} converge={live ? 0.6 : 0.15} seed={11} />
        </div>
      ) : null}
      <div className="kc-hero-grid">
        <p className="kc-kicker kc-hero-kicker">{kicker}</p>
        <h1 id="kc-hero-title" className="kc-h1 kc-hero-title" tabIndex={-1} data-view-title="">
          {title}
        </h1>

        {live ? (
          <p className="kc-hero-figure">
            <Count value={days} className={cx("kc-figure", state === "active" && "k-metal")} />
            <span className="kc-hero-unit">{plural(lang, days, t.days_left_unit)}</span>
          </p>
        ) : null}

        {state === "none" ? (
          <p className="kc-hero-status kc-hero-body">{t.hero_none_body}</p>
        ) : (
          <p className="kc-hero-status">
            {state === "active" ? <span className="k-pulse" aria-hidden="true" /> : <span className={cx("kc-dot", state === "expiring" ? "kc-dot--warn" : "kc-dot--danger")} aria-hidden="true" />}
            <span>{fmt(state === "expired" ? t.expired_on : t.active_until_date, { date })}</span>
          </p>
        )}

        {live && total > 0 ? <SlotMeter t={t} used={used} total={total} /> : null}

        <div className="kc-hero-cta">
          {state === "active" ? (
            <HashLink to="plan" onNavigate={onNavigate} variant="ghost">
              {t.renew}
            </HashLink>
          ) : (
            <HashLink to="plan" onNavigate={onNavigate} variant="cta">
              {state === "none" ? t.choose_plan_cta : t.renew}
            </HashLink>
          )}
        </div>
      </div>
    </section>
  );
}
