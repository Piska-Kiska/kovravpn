// src/components/dashboard/AccountMenu.tsx
// Header account menu (>= 1024px): identity, Account settings, Help & support,
// Sign out.
"use client";

import { LifeBuoy, LogOut, Send, UserRound } from "lucide-react";
import { Icon, Menu, type MenuItem } from "@/components/cabinet";
import type { DashDict } from "@/lib/dash-i18n";
import type { NavTarget } from "./useDashView";

export interface Identity {
  /** Email, or "Telegram ID 123" for Telegram-only accounts. */
  label: string;
  /** First letter of the email; null for Telegram-only accounts. */
  initial: string | null;
}

export interface AccountMenuProps {
  t: DashDict;
  identity: Identity | null;
  onNavigate(target: NavTarget): void;
  onLogout(): void;
}

export function AccountMenu({ t, identity, onNavigate, onLogout }: AccountMenuProps) {
  const items: MenuItem[] = [
    ...(identity ? [{ id: "who", kind: "head" as const, label: t.signed_in_as, meta: identity.label }, { id: "sep0", kind: "separator" as const }] : []),
    { id: "account", kind: "link", href: "#account", label: t.account_settings, icon: UserRound, onSelect: () => onNavigate("account") },
    { id: "help", kind: "link", href: "#help", label: t.help_support, icon: LifeBuoy, onSelect: () => onNavigate("help") },
    { id: "sep1", kind: "separator" },
    { id: "logout", kind: "action", label: t.sign_out, icon: LogOut, tone: "danger", onSelect: onLogout },
  ];
  return (
    <Menu
      label={t.account_menu}
      items={items}
      align="end"
      trigger={(props) => (
        <button {...props} className="kc-avatar">
          {identity?.initial ? <span aria-hidden="true">{identity.initial}</span> : <Icon as={identity ? Send : UserRound} size={16} />}
        </button>
      )}
    />
  );
}
