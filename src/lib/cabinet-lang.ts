// src/lib/cabinet-lang.ts
//
// Language state for the cabinet pages (/login, /register, /dashboard).
//
// The source of truth is <html data-lang>, written before first paint by the
// boot script in src/app/layout.tsx and afterwards by setCabinetLang() or a
// cross-tab "storage" event. Components read it through useCabinetLang(),
// which renders "en" on the server and during hydration, then the real
// language (the boot script keeps the page hidden until then, see
// CabinetRoot).
"use client";

import { Fragment, createElement, useSyncExternalStore, type ReactNode } from "react";
import type { Lang } from "@/i18n/dict";
import { LANG_CHANGE_EVENT, LANG_EXPLICIT_KEY, STORAGE_KEY, setLang } from "@/i18n/runtime";
import { isLang, resolveCabinetLang } from "@/i18n/resolve";

export type { Lang };

export interface CabinetLangOption {
  code: Lang;
  /** Endonym, rendered with lang={code}. */
  native: string;
  /** Two-letter code for the compact trigger. */
  short: string;
}

export const CABINET_LANGS: readonly CabinetLangOption[] = [
  { code: "en", native: "English", short: "EN" },
  { code: "ru", native: "Русский", short: "RU" },
  { code: "es", native: "Español", short: "ES" },
  { code: "de", native: "Deutsch", short: "DE" },
  { code: "fr", native: "Français", short: "FR" },
];

function writeHtmlLang(l: Lang): void {
  const d = document.documentElement;
  if (d.getAttribute("lang") !== l) d.setAttribute("lang", l);
  if (d.getAttribute("data-lang") !== l) d.setAttribute("data-lang", l);
}

/**
 * Switch language from a cabinet control. Persists kovra_lang plus the
 * explicit flag, updates <html lang|data-lang> and fires LANG_CHANGE_EVENT
 * (all through runtime.setLang). A ?lang= parameter is removed first,
 * otherwise it would keep overriding the choice on this page and on reload.
 */
export function setCabinetLang(l: Lang): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.delete("lang");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  } catch {
    // A malformed URL cannot happen in a browser; the switch still works.
  }
  setLang(l);
}

/**
 * Re-resolve the cabinet language (URL, saved choice, navigator) and write it
 * to <html>. Used on mount after a client-side navigation from a page with
 * different rules, and on cross-tab storage changes. Notifies subscribers
 * only when the value changed.
 */
export function syncCabinetLang(): Lang {
  const next = resolveCabinetLang();
  const prev = document.documentElement.getAttribute("data-lang");
  writeHtmlLang(next);
  if (prev !== next) {
    window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: { lang: next } }));
  }
  return next;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY || e.key === LANG_EXPLICIT_KEY) {
      writeHtmlLang(resolveCabinetLang());
    }
    onChange();
  };
  window.addEventListener(LANG_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LANG_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Lang {
  const v = document.documentElement.getAttribute("data-lang");
  return isLang(v) ? v : "en";
}

function getServerSnapshot(): Lang {
  return "en";
}

/** Current cabinet language. "en" on the server and during hydration. */
export function useCabinetLang(): Lang {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

const TOKEN_RE = /\{(\w+)\}/g;

/** Replaces {name} tokens; unknown tokens are left as they are. */
export function fmt(tpl: string, params: Readonly<Record<string, string | number>>): string {
  return tpl.replace(TOKEN_RE, (match: string, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match,
  );
}

/**
 * Like fmt(), but the values are React nodes, for links or emphasis inside a
 * translated sentence: fmtNodes(t.legal, { terms: <Link …/>, privacy: <Link …/> }).
 * Node values are wrapped in keyed fragments; unknown tokens stay as text.
 */
export function fmtNodes(tpl: string, nodes: Readonly<Record<string, ReactNode>>): ReactNode[] {
  const parts = tpl.split(/\{(\w+)\}/);
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i % 2 === 0) {
      if (part) out.push(part);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(nodes, part)) {
      out.push(createElement(Fragment, { key: `${part}-${i}` }, nodes[part]));
    } else {
      out.push(`{${part}}`);
    }
  });
  return out;
}

/** Plural forms. ru uses one / few / many / other; the other languages one / other. */
export type Plural = Readonly<{ one: string; few?: string; many?: string; other: string }>;

const pluralRules = new Map<Lang, Intl.PluralRules>();

function rulesFor(lang: Lang): Intl.PluralRules | null {
  const cached = pluralRules.get(lang);
  if (cached) return cached;
  try {
    const r = new Intl.PluralRules(localeTag(lang));
    pluralRules.set(lang, r);
    return r;
  } catch {
    return null;
  }
}

/** Picks the CLDR plural form for n and fills {n}. */
export function plural(lang: Lang, n: number, forms: Plural): string {
  const category = rulesFor(lang)?.select(n) ?? "other";
  let tpl: string = forms.other;
  if (category === "one") tpl = forms.one;
  else if (category === "few") tpl = forms.few ?? forms.other;
  else if (category === "many") tpl = forms.many ?? forms.other;
  return fmt(tpl, { n });
}

/** BCP 47 tag for Intl formatting. */
export function localeTag(lang: Lang): string {
  return lang === "en" ? "en-US" : lang;
}
