// src/i18n/resolve.ts
//
// Language resolution for the cabinet pages (/login, /register, /dashboard).
//
// Pure module with zero runtime imports, so node tests can load it directly
// under type stripping. The inline boot script in src/app/layout.tsx mirrors
// resolveCabinetLangFrom(); keep the two in sync.
//
// Order:
//   1. ?lang=xx (supported codes only, never persisted)
//   2. localStorage.kovra_lang, when it is not "en", or when it is "en" and
//      localStorage.kovra_lang_explicit === "1". The landing writes a bare
//      "en" on every visit, so an unflagged "en" is not a real choice.
//   3. The first navigator.languages entry whose primary subtag is supported.
//   4. "en".

/** Mirror of `Lang` in src/i18n/dict.ts. */
export type Lang = "en" | "ru" | "es" | "de" | "fr";

export const CABINET_LANGS_ORDER: readonly Lang[] = ["en", "ru", "es", "de", "fr"];

export const LANG_STORAGE_KEY = "kovra_lang";
export const LANG_EXPLICIT_STORAGE_KEY = "kovra_lang_explicit";

const CABINET_PATH_RE = /^\/(login|register|dashboard)(\/|$)/;

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (CABINET_LANGS_ORDER as readonly string[]).includes(v);
}

export function isCabinetPath(pathname: string): boolean {
  return CABINET_PATH_RE.test(pathname);
}

/** First entry whose primary subtag is supported: "de-AT" -> "de", "pt-BR" -> no match. */
export function matchNavigatorLang(list: readonly string[]): Lang | null {
  for (const entry of list) {
    const primary = String(entry).trim().toLowerCase().split(/[-_]/)[0];
    if (isLang(primary)) return primary;
  }
  return null;
}

export interface ResolveInput {
  urlLang: string | null;
  saved: string | null;
  explicit: string | null;
  navigatorLanguages: readonly string[];
}

export function resolveCabinetLangFrom(i: ResolveInput): Lang {
  if (isLang(i.urlLang)) return i.urlLang;
  if (isLang(i.saved) && (i.saved !== "en" || i.explicit === "1")) return i.saved;
  return matchNavigatorLang(i.navigatorLanguages) ?? "en";
}

/** Reads the URL, storage and navigator. Returns "en" on the server or on any failure. */
export function resolveCabinetLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const urlLang = new URL(window.location.href).searchParams.get("lang");
    let saved: string | null = null;
    let explicit: string | null = null;
    try {
      saved = window.localStorage.getItem(LANG_STORAGE_KEY);
      explicit = window.localStorage.getItem(LANG_EXPLICIT_STORAGE_KEY);
    } catch {
      // Storage blocked (private mode, sandbox): fall through to navigator.
    }
    const nav = window.navigator;
    const navigatorLanguages: readonly string[] =
      nav.languages && nav.languages.length > 0 ? nav.languages : [nav.language || ""];
    return resolveCabinetLangFrom({ urlLang, saved, explicit, navigatorLanguages });
  } catch {
    return "en";
  }
}
