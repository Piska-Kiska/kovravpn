// src/components/dashboard/BottomNav.tsx
// Fixed tab bar below 1024px: Devices, Plan, Rewards, Account.
"use client";

import { CreditCard, Gift, MonitorSmartphone, UserRound, type LucideIcon } from "lucide-react";
import { Icon } from "@/components/cabinet";
import type { DashDict } from "@/lib/dash-i18n";
import { NAV_LABEL_KEY } from "./DashHeader";
import { HashLink } from "./shared";
import { DASH_VIEWS, type DashView, type NavTarget } from "./useDashView";

const NAV_ICON: Readonly<Record<DashView, LucideIcon>> = {
  devices: MonitorSmartphone,
  plan: CreditCard,
  rewards: Gift,
  account: UserRound,
};

export interface BottomNavProps {
  t: DashDict;
  view: DashView | null;
  onNavigate(target: NavTarget): void;
}

export function BottomNav({ t, view, onNavigate }: BottomNavProps) {
  return (
    <nav className="kc-bnav" aria-label={t.nav_label}>
      <ul className="kc-bnav-list">
        {DASH_VIEWS.map((v) => (
          <li key={v}>
            <HashLink to={v} onNavigate={onNavigate} bare className="kc-bnav-item" aria-current={view === v ? "page" : undefined}>
              <Icon as={NAV_ICON[v]} size={20} />
              <span className="kc-bnav-label">{t[NAV_LABEL_KEY[v]]}</span>
            </HashLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
