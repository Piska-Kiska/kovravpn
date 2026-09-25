// src/components/dashboard/AccountView.tsx
// Account (spec §9.7): who is signed in, linked sign-in methods, language and
// theme, help links and sign out. Two columns from 1024px.
"use client";

import { ArrowUpRight, BookOpen, LifeBuoy, LogOut, Send, type LucideIcon } from "lucide-react";
import LinkAccounts from "@/components/LinkAccounts";
import { Button, Icon, LangMenu, Segmented, THEME_OPTIONS, cx } from "@/components/cabinet";
import { fmt } from "@/lib/cabinet-lang";
import type { DashDict } from "@/lib/dash-i18n";
import { useShellT } from "@/lib/i18n-shell";
import { useThemePref, type ThemePref } from "@/lib/theme";
import { BreakableEmail, ViewHead, useRise } from "./shared";

export interface UserInfo {
  authMethod: string;
  email?: string;
  telegramId?: string;
}

export interface AccountViewProps {
  t: DashDict;
  userId: string | null;
  userInfo: UserInfo | null;
  onUserUpdate(): void;
  onLogout(): void;
}

function HelpRow({ href, icon, title, sub, external }: { href: string; icon: LucideIcon; title: string; sub: string; external?: boolean }) {
  return (
    <li>
      <a className="kc-helprow" href={href} target="_blank" rel={external ? "noopener noreferrer" : "noopener"}>
        <span className="kc-helprow-icon">
          <Icon as={icon} size={18} />
        </span>
        <span className="kc-helprow-text">
          <span className="kc-helprow-title">{title}</span>
          <span className="kc-small">{sub}</span>
        </span>
        <Icon as={ArrowUpRight} size={18} className="kc-linkrow-icon" />
      </a>
    </li>
  );
}

export function AccountView({ t, userId, userInfo, onUserUpdate, onLogout }: AccountViewProps) {
  const shell = useShellT();
  const { pref, setPref } = useThemePref();
  const rise = useRise();
  const r1 = rise(1);
  const r2 = rise(2);

  const identity = userInfo?.email ?? (userInfo?.telegramId ? fmt(t.tg_id, { id: userInfo.telegramId }) : "");
  const initial = userInfo?.email ? userInfo.email.trim().charAt(0).toUpperCase() : null;

  return (
    <>
      <ViewHead kicker={t.settings_kicker} title={t.account_title} />
      <div className="kc-account-grid">
        <div className={cx("kc-account-col", r1.className)} style={r1.style}>
          <section className="kc-panel kc-profile" aria-label={t.signed_in_as}>
            <span className="kc-profile-avatar" aria-hidden="true">
              {initial ?? <Icon as={Send} size={20} />}
            </span>
            <div className="kc-profile-text">
              <p className="kc-small">{t.signed_in_as}</p>
              <p className="kc-profile-id">{identity ? <BreakableEmail value={identity} /> : "—"}</p>
            </div>
          </section>
          {userId && userInfo ? (
            <LinkAccounts userId={userId} authMethod={userInfo.authMethod} email={userInfo.email} telegramId={userInfo.telegramId} onUpdate={onUserUpdate} />
          ) : null}
        </div>

        <div className={cx("kc-account-col", r2.className)} style={r2.style}>
          <section className="kc-panel kc-prefs" aria-labelledby="kc-prefs-title">
            <h2 id="kc-prefs-title" className="kc-h2">
              {t.prefs_title}
            </h2>
            <div className="kc-pref">
              <p className="kc-label" id="kc-pref-lang">
                {shell.language}
              </p>
              <LangMenu variant="inline" align="start" />
            </div>
            <hr className="kc-hair" />
            <div className="kc-pref">
              <p className="kc-label">{shell.theme}</p>
              <Segmented<ThemePref>
                name="kc-theme"
                label={shell.theme}
                value={pref}
                block
                options={THEME_OPTIONS.map((o) => ({ value: o.value, label: shell[o.key], icon: o.icon }))}
                onChange={setPref}
              />
            </div>
          </section>

          <section id="help-panel" className="kc-panel kc-help" aria-labelledby="kc-help-title">
            <h2 id="kc-help-title" className="kc-h2" tabIndex={-1} data-panel-title="">
              {t.help_title}
            </h2>
            <ul className="kc-helprows">
              <HelpRow href="/guides" icon={BookOpen} title={t.guide} sub={t.guide_note} />
              <HelpRow href="https://t.me/KovraVPN_bot" icon={LifeBuoy} title={t.support} sub={t.support_note} external />
            </ul>
          </section>

          <div className="kc-signout">
            <Button variant="danger" icon={LogOut} onClick={onLogout} className="kc-signout-btn">
              {t.sign_out}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
