// src/components/dashboard/DashHeader.tsx
// Sticky header. >= 1024px: wordmark, section tabs, language, theme, account
// menu. Below: wordmark, language, theme (the tabs move to BottomNav).
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import KovraWordmark from "@/components/KovraWordmark";
import { LangMenu, ThemeMenu, cx } from "@/components/cabinet";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { AccountMenu, type Identity } from "./AccountMenu";
import { HashLink } from "./shared";
import { DASH_VIEWS, type DashView, type NavTarget } from "./useDashView";

export const NAV_LABEL_KEY: Readonly<Record<DashView, keyof Pick<DashDict, "nav_devices" | "nav_plan" | "nav_rewards" | "nav_account">>> = {
  devices: "nav_devices",
  plan: "nav_plan",
  rewards: "nav_rewards",
  account: "nav_account",
};

export interface DashHeaderProps {
  t: DashDict;
  view: DashView | null;
  identity: Identity | null;
  onNavigate(target: NavTarget): void;
  onLogout(): void;
}

export function DashHeader({ t, view, identity, onNavigate, onLogout }: DashHeaderProps) {
  const shell = useShellT();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cx("kc-header", "kc-dash-header", scrolled && "is-scrolled")}>
      <div className="kc-header-in">
        <div className="kc-dash-header-start">
          <Link href="/" className="kc-brand" aria-label={shell.home}>
            <KovraWordmark height={22} />
          </Link>
          <nav className="kc-tabs" aria-label={t.nav_label}>
            {DASH_VIEWS.map((v) => (
              <HashLink key={v} to={v} onNavigate={onNavigate} bare className="kc-tab" aria-current={view === v ? "page" : undefined}>
                {t[NAV_LABEL_KEY[v]]}
              </HashLink>
            ))}
          </nav>
        </div>
        <div className="kc-header-tools">
          <LangMenu />
          <ThemeMenu />
          <div className="kc-dash-account">
            <AccountMenu t={t} identity={identity} onNavigate={onNavigate} onLogout={onLogout} />
          </div>
        </div>
      </div>
    </header>
  );
}
