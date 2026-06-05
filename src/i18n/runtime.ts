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
// • For mixed-content paragraphs (text + <a> + <strong>) use
//   `data-i18n-html="key"` on the parent — the dict value contains
//   the full pre-formatted HTML. Dict is hard-coded by us → no XSS.
// • Attribute translations (alt, title, aria-label, placeholder)
//   use `data-i18n-attr="alt=key,title=key2"` syntax.
//
// Language preference order:
//   1. ?lang=en|ru in URL
//   2. localStorage["lang"]
//   3. navigator.language (only as a fallback signal)
//   4. RU (default — 95%+ of users are RU)

import type { Lang } from "./dict";

export const STORAGE_KEY = "lang";
export const LANG_CHANGE_EVENT = "i18n:lang-change";

/** Read current language preference. Safe to call on the client only. */
export function detectLang(): Lang {
  if (typeof window === "undefined") return "ru";
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("lang");
    if (fromUrl === "en" || fromUrl === "ru") return fromUrl;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ru") return saved;
    const nav = window.navigator.language?.toLowerCase() ?? "";
    if (nav.startsWith("ru")) return "ru";
    // Anything non-RU stays on RU by default to avoid auto-EN flash for
    // foreign visitors who land via direct link. Only an explicit
    // ?lang=en or stored preference flips them to EN.
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
    // Translation still works in-session via the event below.
  }
  document.documentElement.setAttribute("lang", lang);
  document.documentElement.setAttribute("data-lang", lang);
  window.dispatchEvent(
    new CustomEvent(LANG_CHANGE_EVENT, { detail: { lang } }),
  );
}

/**
 * Apply a dictionary to all marked elements in the document. Idempotent:
 * safe to call multiple times. Missing keys are left untouched (acts as
 * graceful fallback to whatever is currently rendered).
 *
 * Each element is tagged with `data-i18n-lang` recording the language
 * that was last applied to it. We skip writes only when *both* the lang
 * tag matches the target AND the rendered value already matches the
 * dictionary value. This handles three tricky cases:
 *
 * 1. Pure text equality (`el.textContent === val`) is insufficient on
 *    its own. Some translations are identical across RU and EN (digits,
 *    emoji-only strings, brand names). Without the lang tag, switching
 *    languages would leave those elements marked as the wrong lang in
 *    the DOM and confuse subsequent diff logic.
 * 2. `innerHTML` for mixed-content paragraphs may match byte-for-byte
 *    after browser normalisation even when we *want* to overwrite — the
 *    lang tag forces a write on the first apply for that language.
 * 3. After fast back-to-back language toggles, observer-triggered
 *    re-walks must not re-write elements that already match the latest
 *    target language. The lang tag makes this O(1) per element.
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
      // Attribute translations are cheap (one or two attrs per
      // element), and we want them re-applied on every language
      // switch unconditionally, so no lang-tag gating here. The
      // per-attribute equality check below is enough to avoid
      // pointless DOM writes.
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
