// src/components/cabinet/AuthShell.tsx
// Layout of /login and /register (spec §8.1):
// - >= 1024px: sticky brand panel (threads, claim, three proof rows) on the
//   left, form column on the right, header controls top-right;
// - < 1024px: header (wordmark, language | theme capsule), one 400px
//   column, proof strip under the footer.
// On every step change after the first render focus moves to the new step:
// to the element marked [data-autofocus] (the first code cell, so the phone
// keyboard and one-time-code autofill are one tap closer), else to the h1.
"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, MonitorSmartphone, Receipt, ShieldCheck, type LucideIcon } from "lucide-react";
import KovraWordmark from "@/components/KovraWordmark";
import ThreadCanvas from "@/components/fx/ThreadCanvas";
import { PrefsCapsule } from "@/components/chrome/PrefsCapsule";
import { fmtNodes, setCabinetLang, useCabinetLang } from "@/lib/cabinet-lang";
import { useAuthT, type AuthDict } from "@/lib/i18n-auth";
import { useShellT } from "@/lib/i18n-shell";
import { ButtonLink } from "./Button";
import { Icon } from "./Icon";
import { cssVars, cx } from "./util";

export interface AuthShellProps {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  /** Small badge under the subtitle (register: "Invited by a friend"). */
  badge?: ReactNode;
  children: ReactNode;
  /** The "New to Kovra? Create an account" line. */
  footer?: ReactNode;
  /**
   * Stable id of the current step ("email", "forgot", "reset", "verify").
   * A change moves focus to the h1 and fades the column in. Defaults to the
   * title, but pass it: the title also changes when the language does.
   */
  step?: string;
}

const PROOFS: readonly { icon: LucideIcon; t: keyof AuthDict; b: keyof AuthDict }[] = [
  { icon: ShieldCheck, t: "proof1_t", b: "proof1_b" },
  { icon: MonitorSmartphone, t: "proof2_t", b: "proof2_b" },
  { icon: Receipt, t: "proof3_t", b: "proof3_b" },
];

export function AuthShell({ kicker, title, subtitle, badge, children, footer, step }: AuthShellProps) {
  const lang = useCabinetLang();
  const t = useAuthT();
  const shell = useShellT();
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const stepId = step ?? title;
  const [firstStep] = useState(stepId);
  // On the first step the column rises in with a stagger (first mount only);
  // every later step is remounted once and fades in (kc-enter).
  const stepped = stepId !== firstStep;
  const prevStep = useRef(stepId);

  useEffect(() => {
    if (prevStep.current === stepId) return;
    prevStep.current = stepId;
    const target = mainRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    if (target) target.focus();
    else h1Ref.current?.focus({ preventScroll: true });
  }, [stepId]);

  const rise = (i: number) => (stepped ? undefined : cssVars({ "--i": i }));
  const riseCls = stepped ? undefined : "kc-rise";

  const legal = fmtNodes(t.legal, {
    terms: (
      <Link href={`/terms?lang=${lang}`} target="_blank" rel="noopener">
        {t.terms}
      </Link>
    ),
    privacy: (
      <Link href={`/privacy?lang=${lang}`} target="_blank" rel="noopener">
        {t.privacy}
      </Link>
    ),
  });

  return (
    <>
      <div className="k-grain" aria-hidden="true" />
      <div className="kc-auth-grid">
        <aside className="kc-brandpanel" aria-label={t.brand_kicker}>
          <div className="kc-brandpanel-in">
            <div className="kc-brandpanel-threads" aria-hidden="true">
              <ThreadCanvas density={1.1} opacity={0.55} converge={0.35} seed={7} />
            </div>
            <div className="kc-brandpanel-top">
              <Link href="/" className="kc-brand" aria-label={shell.home}>
                <KovraWordmark height={24} />
              </Link>
            </div>
            <div className="kc-brandpanel-body">
              <p className="kc-kicker">{t.brand_kicker}</p>
              <p className="kc-brand-title k-metal">{t.brand_title}</p>
              <ul className="kc-proof">
                {PROOFS.map((p) => (
                  <li key={p.t}>
                    <span className="kc-proof-icon">
                      <Icon as={p.icon} size={18} />
                    </span>
                    <div>
                      <p className="kc-proof-t">{t[p.t]}</p>
                      <p className="kc-proof-b">{t[p.b]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        <div className="kc-auth-side">
          <header className="kc-auth-header">
            <Link href="/" className="kc-brand" aria-label={shell.home}>
              <KovraWordmark height={22} />
            </Link>
            <div className="kc-header-tools kh-bar">
              <PrefsCapsule lang={lang} onLang={setCabinetLang} />
            </div>
          </header>

          <div className="kc-auth-body">
            <main id="kc-main" ref={mainRef} tabIndex={-1} className="kc-auth-main">
              <div key={stepId} className={cx("kc-auth-col", stepped && "kc-enter")}>
                <p className={cx("kc-kicker kc-auth-kicker", riseCls)} style={rise(0)}>
                  {kicker}
                </p>
                <h1 ref={h1Ref} tabIndex={-1} className={cx("kc-display k-metal", riseCls)} style={rise(1)}>
                  {title}
                </h1>
                {subtitle ? (
                  <p className={cx("kc-auth-sub", riseCls)} style={rise(2)}>
                    {subtitle}
                  </p>
                ) : null}
                {badge ? (
                  <div className={cx("kc-auth-badge", riseCls)} style={rise(3)}>
                    {badge}
                  </div>
                ) : null}
                <div className={cx("kc-auth-content", riseCls)} style={rise(4)}>
                  {children}
                </div>
                {footer ? (
                  <div className={cx("kc-auth-switch", riseCls)} style={rise(5)}>
                    {footer}
                  </div>
                ) : null}
              </div>
            </main>

            <footer className="kc-auth-foot kc-rise" style={cssVars({ "--i": 6 })}>
              <hr className="kc-hair" />
              <p className="kc-legal">{legal}</p>
              <ButtonLink variant="quiet" size="sm" href="/" icon={ArrowLeft} iconSize={16} className="kc-auth-back">
                {t.back_to_site}
              </ButtonLink>
              {/* proof_strip is one dictionary string joined with " · "; shown as
                  wrapping items so a line never starts or ends with a separator */}
              <ul className="kc-proofstrip">
                {t.proof_strip.split(" · ").map((part) => (
                  <li key={part}>{part}</li>
                ))}
              </ul>
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}
