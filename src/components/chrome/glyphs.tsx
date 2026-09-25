// src/components/chrome/glyphs.tsx
//
// Kovra's own header glyphs: 16px grid, 1.5px stroke, round caps and joins,
// currentColor, always decorative (aria-hidden, not focusable). The theme
// glyphs are drawn from the wordmark's "o" and its full stop: a half-lit
// disc (System), an open "o" ringed by eight dots (Light), a crescent with a
// single dot (Dark).
import type { ThemePref } from "@/lib/theme";

interface GlyphProps {
  className?: string;
}

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const SUN_DOTS: readonly (readonly [number, number])[] = [
  [8, 1.9], [12.31, 3.69], [14.1, 8], [12.31, 12.31],
  [8, 14.1], [3.69, 12.31], [1.9, 8], [3.69, 3.69],
];

export function ThemeGlyph({ pref, className }: GlyphProps & { pref: ThemePref }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" className={className}>
      {pref === "system" ? (
        <>
          <circle cx="8" cy="8" r="6.25" {...STROKE} />
          <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5Z" fill="currentColor" />
        </>
      ) : pref === "light" ? (
        <>
          <circle cx="8" cy="8" r="3" {...STROKE} />
          <g fill="currentColor">
            {SUN_DOTS.map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r=".95" />
            ))}
          </g>
        </>
      ) : (
        <>
          <path d="M6.93 2.1A6 6 0 1 0 13.9 9.07 5 5 0 0 1 6.93 2.1Z" {...STROKE} />
          <circle cx="12.9" cy="3.1" r=".95" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export function ChevronGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true" focusable="false" className={className} {...STROKE}>
      <path d="M2.5 3.75 5 6.25l2.5-2.5" />
    </svg>
  );
}

export function UserGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" className={className} {...STROKE}>
      <circle cx="8" cy="5.5" r="2.75" />
      <path d="M2.75 14c.55-2.55 2.65-4.25 5.25-4.25s4.7 1.7 5.25 4.25" />
    </svg>
  );
}

export function HelpGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" className={className}>
      <circle cx="8" cy="8" r="6.25" {...STROKE} />
      <path d="M6.2 6.35a1.85 1.85 0 0 1 3.6.5c0 1.25-1.8 1.55-1.8 2.75" {...STROKE} />
      <circle cx="8" cy="11.55" r=".95" fill="currentColor" />
    </svg>
  );
}

export function SignOutGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" className={className} {...STROKE}>
      <path d="M6.25 2.75H4.5c-.97 0-1.75.78-1.75 1.75v7c0 .97.78 1.75 1.75 1.75h1.75" />
      <path d="M10.25 5 13.25 8l-3 3M13 8H6.5" />
    </svg>
  );
}

/** "Back" arrow of the header links: the chevron's angle with a shaft. */
export function BackGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" className={className} {...STROKE}>
      <path d="M9.5 3.75 5.25 8l4.25 4.25M5.5 8h7.25" />
    </svg>
  );
}

interface PageColors {
  bg: string;
  fg: string;
  mute: string;
  cta: string;
}

const LIGHT_PAGE: PageColors = { bg: "#ffffff", fg: "#1d1d1f", mute: "#c7c7cc", cta: "#1d1d1f" };
const DARK_PAGE: PageColors = { bg: "#050506", fg: "#f5f5f7", mute: "#3a3a3e", cta: "#f5f5f7" };

/** A 60x42 Kovra page in miniature: wordmark bar + gold dot, CTA pill, headline, body line. */
function MiniPage({ c }: { c: PageColors }) {
  return (
    <>
      <rect width="60" height="42" fill={c.bg} />
      <rect x="7" y="7" width="12" height="3" rx="1.5" fill={c.fg} />
      <circle cx="21.3" cy="9.1" r="1.4" fill="#C6A983" />
      <rect x="43" y="6" width="10" height="5" rx="2.5" fill={c.cta} />
      <rect x="7" y="20" width="32" height="4" rx="2" fill={c.fg} />
      <rect x="7" y="28" width="21" height="3" rx="1.5" fill={c.mute} />
    </>
  );
}

/** Theme tile swatch. System = light page with its right half dark (a nested <svg> clips, so no ids). */
export function ThemeSwatch({ pref }: { pref: ThemePref }) {
  return (
    <svg viewBox="0 0 60 42" width="60" height="42" aria-hidden="true" focusable="false">
      <MiniPage c={pref === "dark" ? DARK_PAGE : LIGHT_PAGE} />
      {pref === "system" ? (
        <svg x="30" y="0" width="30" height="42" viewBox="30 0 30 42">
          <MiniPage c={DARK_PAGE} />
        </svg>
      ) : null}
      <rect x=".5" y=".5" width="59" height="41" rx="6.5" fill="none" stroke="var(--kh-sw-rim)" />
    </svg>
  );
}

/** Menu order and label keys (shell dict). Also used by Account > Preferences. */
export const THEME_PREFS: readonly { value: ThemePref; key: "theme_system" | "theme_light" | "theme_dark" }[] = [
  { value: "system", key: "theme_system" },
  { value: "light", key: "theme_light" },
  { value: "dark", key: "theme_dark" },
];
