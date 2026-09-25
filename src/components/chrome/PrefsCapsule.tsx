// src/components/chrome/PrefsCapsule.tsx
//
// The header preferences capsule shared by every page: [EN ⌄ | theme glyph].
// Each segment is a menu button (useMenuButton). The language menu lists the
// native names with a mono code column; the theme menu shows three live page
// swatches. The chosen item ends with the wordmark's gold full stop.
//
// The theme trigger renders all three glyphs and CSS picks one from
// <html data-theme-pref> (set by the boot script before first paint), so the
// right glyph is there on SSR and hydration without a flash. Strings come
// from SHELL[lang] for the page's own language, so pages outside the cabinet
// (the landing) get the right words too. Theme sync (OS changes, other tabs)
// is NOT rendered here: the host page renders <ThemeSync/> once.
"use client";

import { useState } from "react";
import type { Lang } from "@/i18n/dict";
import { CABINET_LANGS, fmt } from "@/lib/cabinet-lang";
import { SHELL, type ShellDict } from "@/lib/i18n-shell";
import { useThemePref } from "@/lib/theme";
import { ChevronGlyph, THEME_PREFS, ThemeGlyph, ThemeSwatch } from "./glyphs";
import { useMenuButton } from "./useMenuButton";

export interface PrefsCapsuleProps {
  lang: Lang;
  onLang(l: Lang): void;
  /** Hide the language code until the real language is known (width stays the same). */
  pending?: boolean;
  /** One line under the language menu's heading (e.g. what a choice does on this page). */
  langNote?: string;
  className?: string;
}

const LANG_NAMES: readonly string[] = CABINET_LANGS.map((l) => l.native);

export function PrefsCapsule({ lang, onLang, pending, langNote, className }: PrefsCapsuleProps) {
  const shell = SHELL[lang];
  return (
    <div className={className ? `kh-prefs ${className}` : "kh-prefs"} role="group" aria-label={shell.prefs}>
      <LangSegment lang={lang} shell={shell} pending={pending} note={langNote} onLang={onLang} />
      <span className="kh-sep" aria-hidden="true" />
      <ThemeSegment shell={shell} />
    </div>
  );
}

interface LangSegmentProps {
  lang: Lang;
  shell: ShellDict;
  pending?: boolean;
  note?: string;
  onLang(l: Lang): void;
}

function LangSegment({ lang, shell, pending, note, onLang }: LangSegmentProps) {
  // Set only by a choice made here, so the swap animation never plays on load.
  const [swapped, setSwapped] = useState(false);
  const index = Math.max(0, CABINET_LANGS.findIndex((l) => l.code === lang));
  const cur = CABINET_LANGS[index];
  const { open, close, wrapRef, triggerProps, headingId, menuProps, itemRef } = useMenuButton({
    label: `${cur.short}, ${fmt(shell.lang_button, { name: cur.native })}`,
    itemLabels: LANG_NAMES,
    checkedIndex: index,
    labelledBy: "heading",
  });
  const noteId = `${headingId}-note`;

  return (
    <div className="kh-anchor" ref={wrapRef}>
      <button {...triggerProps} className="kh-seg kh-seg--lang">
        <span key={lang} className="kh-code" data-pending={pending ? "" : undefined} data-swap={swapped ? "" : undefined}>
          {cur.short}
        </span>
        <ChevronGlyph className="kh-chev" />
      </button>
      {open ? (
        <div className="kh-pop kh-pop--lang">
          <p className="kh-pop-label" id={headingId}>
            {shell.language}
          </p>
          {note ? (
            <p className="kh-pop-note" id={noteId}>
              {note}
            </p>
          ) : null}
          <div className="kh-pop-rule" aria-hidden="true" />
          <div {...menuProps} aria-describedby={note ? noteId : undefined}>
            {CABINET_LANGS.map((l, i) => {
              const checked = l.code === lang;
              return (
                <button
                  key={l.code}
                  ref={itemRef(i)}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  tabIndex={-1}
                  className="kh-opt"
                  onClick={() => {
                    if (l.code !== lang) {
                      setSwapped(true);
                      onLang(l.code);
                    }
                    close(true);
                  }}
                >
                  <span lang={l.code}>
                    {l.native}
                    {checked ? <span className="kh-dot" aria-hidden="true" /> : null}
                  </span>
                  <span className="kh-opt-code" aria-hidden="true">
                    {l.short}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ThemeSegment({ shell }: { shell: ShellDict }) {
  const { pref, setPref } = useThemePref();
  const [swapped, setSwapped] = useState(false);
  const index = Math.max(0, THEME_PREFS.findIndex((p) => p.value === pref));
  const { open, close, wrapRef, triggerProps, headingId, menuProps, itemRef } = useMenuButton({
    label: fmt(shell.theme_button, { name: shell[THEME_PREFS[index].key] }),
    itemLabels: THEME_PREFS.map((p) => shell[p.key]),
    checkedIndex: index,
    orientation: "horizontal",
    labelledBy: "heading",
  });

  return (
    <div className="kh-anchor" ref={wrapRef}>
      <button {...triggerProps} className="kh-seg kh-seg--theme">
        <span key={pref} className="kh-glyphs" data-swap={swapped ? "" : undefined}>
          <ThemeGlyph pref="system" className="kh-g kh-g--system" />
          <ThemeGlyph pref="light" className="kh-g kh-g--light" />
          <ThemeGlyph pref="dark" className="kh-g kh-g--dark" />
        </span>
      </button>
      {open ? (
        <div className="kh-pop kh-pop--theme">
          <p className="kh-pop-label" id={headingId}>
            {shell.theme}
          </p>
          <div className="kh-pop-rule" aria-hidden="true" />
          <div {...menuProps} className="kh-tiles">
            {THEME_PREFS.map((p, i) => {
              const checked = p.value === pref;
              return (
                <button
                  key={p.value}
                  ref={itemRef(i)}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  tabIndex={-1}
                  className="kh-tile"
                  onClick={() => {
                    if (p.value !== pref) {
                      setSwapped(true);
                      setPref(p.value);
                    }
                    close(true);
                  }}
                >
                  <ThemeSwatch pref={p.value} />
                  <span className="kh-tile-label">
                    {shell[p.key]}
                    {checked ? <span className="kh-dot" aria-hidden="true" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
