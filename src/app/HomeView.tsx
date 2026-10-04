"use client";
// src/app/HomeView.tsx — the Kovra landing (v3).
// Apple-keynote minimal: total black, giant metallic display type,
// bento feature grid, a single warm gold glow (the orb).
// i18n (EN/RU/ES/DE/FR) from src/lib/home-copy.ts; language and theme
// (system / light / dark) through the shared header capsule
// (src/components/chrome). Rendered by src/app/page.tsx.
//
// Prices are never typed here: the pricing table and every price in the copy
// come from src/lib/plan-prices.ts, the numbers the server charges.

import { useEffect, useMemo, useState } from "react";
import Reveal from "@/components/fx/Reveal";
import DigitRoll from "@/components/fx/DigitRoll";
import "./home.css";
import KovraWordmark from "@/components/KovraWordmark";
import { PrefsCapsule, ThemeSync } from "@/components/chrome";
import type { Lang } from "@/i18n/dict";
import { isLang } from "@/i18n/resolve";
import { setLang as persistLang } from "@/i18n/runtime";
import { homeCopyFor, homeFaq } from "@/lib/home-copy";
import { planRows, type PlanKind } from "@/lib/plan-prices";
import { firstScreenCountries, type PublicCountryView } from "@/lib/public-locations";

type TermId = "m1" | "m6" | "m12";
type Term = { id: TermId; mo: string; total: string; ref: string | null; n: number; disc: number };

/** The pricing table of a plan, from the module the server charges from (src/lib/plan-prices.ts). */
function termsFor(kind: PlanKind): Term[] {
  return planRows(kind).map((r) => ({
    id: `m${r.term}` as TermId,
    mo: r.perMonth,
    total: r.total,
    ref: r.vsMonthly,
    n: r.term,
    disc: r.discount,
  }));
}

// Level 0: up to 3 devices. Level 1: 1 device.
const TERMS_3: Term[] = termsFor("plan3");
const TERMS_1: Term[] = termsFor("plan1");

const LEVELS: { terms: Term[]; devKey: "plan_devices" | "plan_devices1"; featKey: "plan4" | "plan4_one" }[] = [
  { terms: TERMS_3, devKey: "plan_devices", featKey: "plan4" },
  { terms: TERMS_1, devKey: "plan_devices1", featKey: "plan4_one" },
];

const PLATFORMS = "iOS · Android · Windows · macOS · TV";
/** Payment rails as the cabinet names them: coins its crypto invoice takes, and cards. */
const PAYMENTS = "USDT · BTC · ETH · CARD";

/* ── stroke icons (1.5px, monochrome) ─────────────────── */
const ICheck = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
);
const IArrow = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

/* hero line mask-reveal, 90ms stagger */
function Lines({ lines, base = 120, step = 90 }: { lines: string[]; base?: number; step?: number }) {
  return (
    <>
      {lines.map((l, i) => (
        <span className="k-word" key={`${l}-${i}`}>
          <span className="k-metal" style={{ transitionDelay: `${base + i * step}ms` }}>{l}</span>
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </>
  );
}

function FaqItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`k-acc-item${open ? " open" : ""}`}>
      <button className="k-acc-q" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {q}
        <span className="k-acc-plus" aria-hidden="true" />
      </button>
      <div className="k-acc-a">
        <div className="k-acc-a-in">
          <p>{a}</p>
        </div>
      </div>
    </div>
  );
}

export interface HomeViewProps {
  /**
   * The countries Kovra connects to, read from the live registry on the
   * server (src/lib/public-locations-server.ts), or null when it could not
   * be read: then the page shows no list at all.
   */
  countries: readonly PublicCountryView[] | null;
}

export default function HomeView({ countries }: HomeViewProps) {
  const [lang, setLang] = useState<Lang>("en");
  const [level, setLevel] = useState<0 | 1>(0);
  const [term3, setTerm3] = useState<TermId>("m12");
  const [term1, setTerm1] = useState<TermId>("m12");
  const [scrolled, setScrolled] = useState(false);
  const [heroIn, setHeroIn] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const sl = localStorage.getItem("kovra_lang");
        if (isLang(sl)) setLang(sl);
      } catch { /* ignore */ }
      setHeroIn(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // The boot script (src/app/layout.tsx) hides the page for a saved non-English
  // language; setLang and setHeroIn land in the same frame, so once heroIn is
  // true the page is already rendered in that language.
  useEffect(() => {
    if (heroIn) document.documentElement.classList.remove("kc-lang-pending");
  }, [heroIn]);

  // Persist the landing language. Until the boot above has read the saved one
  // (heroIn flips in the same frame) only seed the default on a first visit,
  // so the Localizer and the other pages read "en"; overwriting a saved
  // choice with the default would lose it.
  useEffect(() => {
    try {
      if (heroIn || !isLang(localStorage.getItem("kovra_lang"))) localStorage.setItem("kovra_lang", lang);
    } catch { /* ignore */ }
  }, [lang, heroIn]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const t = useMemo(() => homeCopyFor(lang), [lang]);
  const steps = [
    { n: "01", t: t.step1_t, b: t.step1_b },
    { n: "02", t: t.step2_t, b: t.step2_b },
    { n: "03", t: t.step3_t, b: t.step3_b },
  ];
  const faqs = useMemo(() => homeFaq(lang), [lang]);
  const allCountries = countries ?? [];
  // Russia stays in the app and in the full list below, off the first screen (owner, 02.10.2026).
  const heroCountries = firstScreenCountries(allCountries);

  const lv = LEVELS[level];
  const TERMS = lv.terms;
  const term = level === 0 ? term3 : term1;
  const setTerm = level === 0 ? setTerm3 : setTerm1;
  const sel = TERMS.find((x) => x.id === term)!;
  const devicesLabel = t[lv.devKey];
  const termLabel = (id: TermId) => (id === "m1" ? t.term1 : id === "m6" ? t.term6 : t.term12);
  // One payment for the whole term, no renewal (src/lib/subscriptions.ts):
  // `ref` is the same term bought month by month, never a "renewal price".
  const onceLabel = sel.n === 1 ? t.plan_once1 : t.plan_oncen.replace("{n}", String(sel.n));
  const vsMonthly = sel.ref ? t.plan_vs.replace("{ref}", sel.ref).replace("{n}", String(sel.n)) : "";
  const planFeatures = [t.plan1, t.plan2, t.plan3, t[lv.featKey], t.plan5];

  return (
    <div className="k-page kv" id="top">
      <noscript>
        <style>{`.k-rv,.k-stagger>*,.k-word>span{opacity:1 !important;transform:none !important}`}</style>
      </noscript>
      <div className="k-grain" aria-hidden="true" />
      <ThemeSync />

      {/* ── Header ── */}
      <header className={`kv-hd${scrolled ? " on" : ""}`}>
        <div className="kv-wrap kv-hd-in">
          <a className="kv-brand" href="#top">
            <KovraWordmark height={24} />
          </a>
          <nav className="kv-nav" aria-label="Sections">
            <a href="#features">{t.nav_features}</a>
            <a href="#pricing">{t.nav_pricing}</a>
            <a href="#faq">{t.nav_faq}</a>
            <a href="/guides">{t.nav_guides}</a>
          </nav>
          <div className="kv-hd-right kh-bar">
            <PrefsCapsule
              lang={lang}
              onLang={(l) => {
                setLang(l);
                // an explicit choice: the cabinet honours it (English too) and <html lang> follows
                persistLang(l);
              }}
            />
            <a className="kv-signin" href="/login">{t.nav_signin}</a>
            <a className="k-btn k-btn-gold" href="/register">{t.nav_get}</a>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="kv-hero">
          <div className={`kv-wrap kv-hero-in${heroIn ? " is-in" : ""}`}>
            <p className="kv-badge k-mono k-rv" style={{ transitionDelay: "0ms" }}>
              {t.badge}
            </p>
            <h1 className="kv-h1">
              <Lines lines={[t.hero_t1, t.hero_t2]} />
            </h1>
            <p className="kv-hero-sub k-rv" style={{ transitionDelay: "440ms" }}>{t.hero_sub}</p>
            <div className="kv-hero-cta k-rv" style={{ transitionDelay: "560ms" }}>
              <a className="k-btn k-btn-gold" href="/register">{t.hero_cta1}</a>
              <a className="k-btn k-btn-ghost" href="#features">{t.hero_cta2}</a>
            </div>
            {heroCountries.length > 0 && (
              <ul className="kv-hero-flags k-rv" style={{ transitionDelay: "680ms" }} aria-hidden="true">
                {heroCountries.map((c) => (
                  <li key={c.code}>{c.flag}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Bento features ── */}
        <section className="kv-sec kv-first" id="features">
          <div className="kv-wrap">
            <Reveal className="kv-bento" stagger>
              <div className="kv-card w7">
                <p className="k-mono">{t.b1_k}</p>
                <h3>{t.b1_t}</h3>
                <p>{t.b1_b}</p>
                <div className="kv-ghost" aria-hidden="true">REALITY</div>
              </div>
              <div className="kv-card w5">
                <p className="k-mono">{t.b2_k}</p>
                <h3>{t.b2_t}</h3>
                <p>{t.b2_b}</p>
                <div className="kv-orb" aria-hidden="true" />
              </div>
              <div className="kv-card w5">
                <p className="k-mono">{t.b3_k}</p>
                <h3>{t.b3_t}</h3>
                <p>{t.b3_b}</p>
                <div className="kv-platforms k-mono" aria-hidden="true">{PLATFORMS}</div>
              </div>
              <div className="kv-card w7">
                <p className="k-mono">{t.b4_k}</p>
                <h3>{t.b4_t}</h3>
                <p>{t.b4_b}</p>
                <div className="kv-platforms k-mono" aria-hidden="true">{PAYMENTS}</div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="kv-how" id="how">
          <div className="kv-wrap">
            <Reveal className="kv-how-head">
              <p className="kv-kicker k-mono">{t.how_kicker}</p>
              <h2 className="kv-h2">{t.how_h2}</h2>
              <p className="kv-lead">{t.how_lead}</p>
            </Reveal>
            <Reveal className="kv-steps" stagger>
              {steps.map((s) => (
                <div className="kv-step" key={s.n}>
                  <span className="k-mono">{s.n}</span>
                  <h4>{s.t}</h4>
                  <p>{s.b}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ── Where you can connect, and what we do not promise ── */}
        <section className="kv-where" id="locations">
          <div className="kv-wrap kv-where-grid">
            {allCountries.length > 0 && (
              <Reveal className="kv-where-main">
                <p className="kv-kicker k-mono">{t.where_kicker}</p>
                <h2 className="kv-h2">{t.where_h2}</h2>
                <p className="kv-lead">{t.where_lead}</p>
                <ul className="kv-countries">
                  {allCountries.map((c) => (
                    <li key={c.code}>
                      <span className="kv-flag" aria-hidden="true">{c.flag}</span>
                      {c.names[lang]}
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
            <Reveal className="kv-limits" delay={100}>
              <h3>{t.limits_h}</h3>
              <p>{t.limits_b}</p>
            </Reveal>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="kv-price" id="pricing">
          <div className="kv-wrap">
            <Reveal className="kv-price-head">
              <p className="kv-kicker k-mono">{t.price_kicker}</p>
              <h2 className="kv-h2">{t.price_h2}</h2>
              <p className="kv-lead">{t.price_meta}</p>
            </Reveal>

            <div className="kv-price-grid">
              <Reveal className="kv-panel" delay={100}>
                <div className="kv-seg" role="group" aria-label={t.price_kicker}>
                  {LEVELS.map((l, i) => (
                    <button
                      key={l.devKey}
                      className={level === i ? "on" : ""}
                      aria-pressed={level === i}
                      onClick={() => setLevel(i as 0 | 1)}
                    >
                      {t[l.devKey]}
                    </button>
                  ))}
                </div>

                <div className="kv-terms" role="radiogroup" aria-label={t.price_h2}>
                  {TERMS.map((o) => (
                    <button
                      key={o.id}
                      role="radio"
                      aria-checked={o.id === term}
                      className={`kv-term${o.id === term ? " on" : ""}`}
                      onClick={() => setTerm(o.id)}
                    >
                      <span className="kv-term-dot" aria-hidden="true" />
                      <span>{termLabel(o.id)}</span>
                      {o.disc > 0 && <span className="kv-term-badge">-{o.disc}%</span>}
                      {o.id === "m12" && <span className="kv-term-badge">{t.badge_best}</span>}
                      <span className="kv-term-price">{o.mo}{t.plan_permo}</span>
                    </button>
                  ))}
                </div>

                <div className="kv-price-tag">
                  <DigitRoll value={sel.mo} />
                  <span>{t.plan_permo} · {devicesLabel}</span>
                </div>
                <p className="kv-fine">
                  <b>{sel.total}</b> {onceLabel}. {t.plan_no_renew}
                </p>

                <ul className="kv-list">
                  {planFeatures.map((p) => (
                    <li key={p}><ICheck />{p}</li>
                  ))}
                </ul>
                <a className="k-btn k-btn-gold" href="/register">{t.price_btn}<IArrow /></a>
              </Reveal>

              <Reveal className="kv-honest" delay={200}>
                <p className="k-mono">{t.price_honest}</p>
                <div className="kv-honest-num">
                  <DigitRoll value={sel.total} />
                  <small>{onceLabel}</small>
                </div>
                <div className="kv-honest-rows">
                  <span>
                    <b style={{ color: "var(--k-text)" }}>{t.plan_no_renew}</b>
                  </span>
                  {sel.disc > 0 && <span>{vsMonthly} · −{sel.disc}%</span>}
                </div>
                <p className="kv-honest-note">{t.plan_savings}</p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="kv-faq" id="faq">
          <div className="kv-wrap kv-faq-grid">
            <Reveal>
              <p className="kv-kicker k-mono">{t.faq_kicker}</p>
              <h2 className="kv-h2">{t.faq_h2}</h2>
            </Reveal>
            <Reveal className="k-acc" delay={100}>
              {faqs.map((f, i) => (
                <FaqItem key={f.q} q={f.q} a={f.a} defaultOpen={i === 0} />
              ))}
            </Reveal>
          </div>
        </section>

        {/* ── Final band: the glow returns ── */}
        <section className="kv-band">
          <div className="kv-wrap">
            <Reveal className="kv-band-card">
              <h2 className="k-metal">{t.band_h2}</h2>
              <p>{t.band_p}</p>
              <a className="k-btn k-btn-gold" href="/register">{t.band_btn}<IArrow /></a>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="kv-foot">
        <div className="kv-wrap kv-foot-in">
          <a className="kv-brand" href="#top" style={{ fontSize: 17 }}>
            <KovraWordmark height={20} />
          </a>
          <nav className="kv-foot-links" aria-label="Footer">
            <a href="#features">{t.nav_features}</a>
            <a href="#pricing">{t.nav_pricing}</a>
            <a href="#faq">{t.nav_faq}</a>
            <a href="/guides">{t.nav_guides}</a>
            <a href="/vless">{t.foot_vless}</a>
            <a href="/crypto">{t.foot_crypto}</a>
            <a href="/terms">{t.foot_terms}</a>
            <a href="/privacy">{t.foot_privacy}</a>
            <a href="mailto:support@kovravpn.com">support@kovravpn.com</a>
          </nav>
          <span className="kv-copy">{t.copyright}</span>
        </div>
      </footer>
    </div>
  );
}
