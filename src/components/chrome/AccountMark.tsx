// src/components/chrome/AccountMark.tsx
//
// The account monogram of the dashboard header (>= 1024px): the lowercase
// first letter of the email plus the wordmark's gold dot, read as "d." like
// "kovra.". Until /api/auth/me answers (identity null) the ring stays empty,
// so the person glyph never flashes before the letter; accounts without a
// letter (Telegram-only, a symbol) show the person glyph. The menu: who is
// signed in (email wraps, never truncated) with the plan line, Account
// settings, Help & support, Sign out. The who-block describes the menu, so a
// screen reader announces the account and its days left on open.
"use client";

import { HelpGlyph, SignOutGlyph, UserGlyph } from "./glyphs";
import { monogramChar, type AccountStatus, type Identity } from "./model";
import { useMenuButton } from "./useMenuButton";

export interface AccountMarkLabels {
  menu: string;
  signedInAs: string;
  settings: string;
  help: string;
  signOut: string;
}

export interface AccountMarkProps {
  identity: Identity | null;
  status: AccountStatus | null;
  labels: AccountMarkLabels;
  onSettings(): void;
  onHelp(): void;
  onLogout(): void;
}

export function AccountMark({ identity, status, labels, onSettings, onHelp, onLogout }: AccountMarkProps) {
  const { open, close, wrapRef, triggerProps, headingId, menuProps, itemRef } = useMenuButton({
    label: labels.menu,
    itemLabels: [labels.settings, labels.help, labels.signOut],
    labelledBy: "trigger",
  });
  const ch = monogramChar(identity?.initial);

  return (
    <div className="kh-anchor" ref={wrapRef}>
      <button {...triggerProps} className="kh-me">
        {identity === null ? null : ch ? (
          <span className="kh-mark" aria-hidden="true">
            {ch}
            <span className="kh-mark-dot" />
          </span>
        ) : (
          <UserGlyph />
        )}
      </button>
      {open ? (
        <div className="kh-pop kh-pop--me">
          {identity ? (
            <>
              <div className="kh-who" id={headingId}>
                <p className="kh-pop-label">{labels.signedInAs}</p>
                <p className="kh-who-mail">{identity.label}</p>
                {status ? (
                  <p className="kh-who-status" data-tone={status.tone}>
                    <i aria-hidden="true" />
                    {status.text}
                  </p>
                ) : null}
              </div>
              <div className="kh-pop-rule" aria-hidden="true" />
            </>
          ) : null}
          <div {...menuProps} aria-describedby={identity ? headingId : undefined}>
            {/* Link rows keep the hash navigation: no preventDefault, no refocus. */}
            <a
              ref={itemRef(0)}
              role="menuitem"
              tabIndex={-1}
              className="kh-row"
              href="#account"
              onClick={() => {
                onSettings();
                close(false);
              }}
            >
              <UserGlyph />
              {labels.settings}
            </a>
            <a
              ref={itemRef(1)}
              role="menuitem"
              tabIndex={-1}
              className="kh-row"
              href="#help"
              onClick={() => {
                onHelp();
                close(false);
              }}
            >
              <HelpGlyph />
              {labels.help}
            </a>
            <div role="separator" className="kh-pop-rule kh-pop-rule--mid" />
            <button
              ref={itemRef(2)}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="kh-row kh-row--danger"
              onClick={() => {
                close(false);
                onLogout();
              }}
            >
              <SignOutGlyph />
              {labels.signOut}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
