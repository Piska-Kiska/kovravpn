// src/components/chrome/index.ts — header chrome shared by every page
// (preferences capsule, account monogram, glyphs). Styles: src/app/chrome.css.
export { PrefsCapsule, type PrefsCapsuleProps } from "./PrefsCapsule";
export { AccountMark, type AccountMarkProps, type AccountMarkLabels } from "./AccountMark";
export { RuntimePrefs, type RuntimePrefsProps } from "./RuntimePrefs";
export { ThemeSync } from "./ThemeSync";
export { useMenuButton, type MenuButton, type MenuListProps, type MenuTriggerProps, type UseMenuButtonOptions } from "./useMenuButton";
export { ThemeGlyph, ChevronGlyph, UserGlyph, HelpGlyph, SignOutGlyph, BackGlyph, ThemeSwatch, THEME_PREFS } from "./glyphs";
export { SiteHeader, type SiteHeaderProps } from "./SiteHeader";
export { monogramChar, statusTone, type AccountStatus, type Identity, type StatusTone } from "./model";
