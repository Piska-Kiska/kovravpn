// src/i18n/runtime.ts
//
// Pure client-side i18n runtime. No deps, no SSR usage.
//
// Strategy
// ────────
// • Server still renders RU (current behaviour, no SEO regression).
// • Each translatable text node carries a `data-i18n="key"` attribute.
// • On mount, Localizer reads the active language and walks the DOM,
//   replacing text content of every [data-i18n] element with the
//   matching dict entry.
// • For mixed-content paragraphs use `data-i18n-html="key"`.
// • Attribute translations use `data-i18n-attr="alt=key,title=key2"`.
//
// Language key: SHARED with the landing/dashboard → "kovra_lang".
// Supported: ru | en | es | de | fr. The DOM dictionary only fully
// translates UI sections for es/de/fr; legal/static keys fall back to
// the en value (applyTranslations leaves missing keys untouched, and
// es/de/fr blocks carry en text for those keys).

import type { Lang } from "./dict";

export const STORAGE_KEY = "kovra_lang"; // unified with landing + dashboard
export const LANG_CHANGE_EVENT = "i18n:lang-change";

const SUPPORTED: Lang[] = ["ru", "en", "es", "de", "fr"];

function isLang(v: string | null | undefined): v is Lang {
  return !!v && (SUPPORTED as string[]).includes(v);
}

/** Read current language preference. Safe to call on the client only. */
export function detectLang(): Lang {
  if (typeof window === "undefined") return "ru";
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("lang");
    if (isLang(fromUrl)) return fromUrl;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
    // No explicit choice → keep RU for SSR parity (server renders RU).
    // Foreign visitors flip via the language switcher or ?lang=.
    return "ru";
  } catch {
    return "ru";
  }
}

/** Persist a new language and broadcast to listeners. */
export function setLang(lang: Lang): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage may be unavailable (private mode quota, embed sandbox).
  }
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("data-lang", lang);
  window.dispatchEvent(
    new CustomEvent(LANG_CHANGE_EVENT, { detail: { lang } }),
  );
}

/**
 * Apply a dictionary to all marked elements in the document. Idempotent.
 * Missing keys are left untouched (graceful fallback to rendered text).
 *
 * For es/de/fr the dict blocks contain en text for legal/static keys, so
 * those render in English rather than the SSR Russian.
 */
export function applyTranslations(
  lang: Lang,
  dict: Record<Lang, Readonly<Record<string, string>>>,
): void {
  if (typeof document === "undefined") return;
  const d = dict[lang];
  if (!d) return;

  document
    .querySelectorAll<HTMLElement>("[data-i18n]")
    .forEach((el) => {
      const key = el.dataset.i18n;
      if (!key) return;
      const val = d[key];
      if (typeof val !== "string") return;
      if (el.dataset.i18nLang === lang && el.textContent === val) return;
      el.textContent = val;
      el.dataset.i18nLang = lang;
    });

  document
    .querySelectorAll<HTMLElement>("[data-i18n-html]")
    .forEach((el) => {
      const key = el.dataset.i18nHtml;
      if (!key) return;
      const val = d[key];
      if (typeof val !== "string") return;
      if (el.dataset.i18nLang === lang) return;
      el.innerHTML = val;
      el.dataset.i18nLang = lang;
    });

  document
    .querySelectorAll<HTMLElement>("[data-i18n-attr]")
    .forEach((el) => {
      const spec = el.dataset.i18nAttr;
      if (!spec) return;
      spec.split(",").forEach((pair) => {
        const idx = pair.indexOf("=");
        if (idx <= 0) return;
        const attr = pair.slice(0, idx).trim();
        const key = pair.slice(idx + 1).trim();
        const val = d[key];
        if (typeof val === "string" && el.getAttribute(attr) !== val) {
          el.setAttribute(attr, val);
        }
      });
    });
}
