// src/components/chrome/RuntimePrefs.tsx
//
// The preferences capsule for pages translated by the DOM runtime
// (src/i18n/runtime + Localizer): /guide, /privacy, /terms, and /guides with
// a fixed language. Also renders the page's single <ThemeSync/>.
//
// The language is read from the runtime (detectLang, updated on every
// LANG_CHANGE_EVENT). It is unknown on the server and during hydration, so the
// code stays hidden until then (the capsule keeps its width).
"use client";

import { useSyncExternalStore } from "react";
import type { Lang } from "@/i18n/dict";
import { detectLang, LANG_CHANGE_EVENT, STORAGE_KEY } from "@/i18n/runtime";
import { setCabinetLang } from "@/lib/cabinet-lang";
import { PrefsCapsule } from "./PrefsCapsule";
import { ThemeSync } from "./ThemeSync";

export interface RuntimePrefsProps {
  /** The page exists in this language only (the English /guides). */
  fixedLang?: Lang;
  /** With fixedLang: picking another language saves it and opens this URL. */
  leaveTo?: string;
  /** Shown under the language menu's heading (says what leaveTo does). */
  langNote?: string;
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(LANG_CHANGE_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LANG_CHANGE_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerSnapshot(): Lang | null {
  return null;
}

export function RuntimePrefs({ fixedLang, leaveTo, langNote }: RuntimePrefsProps) {
  const live = useSyncExternalStore<Lang | null>(subscribe, detectLang, getServerSnapshot);
  const lang: Lang = fixedLang ?? live ?? "en";

  const onLang = (l: Lang) => {
    // Saves kovra_lang with the explicit flag, updates <html lang> and fires
    // LANG_CHANGE_EVENT (the Localizer re-translates). It also drops a ?lang=
    // parameter, which would otherwise keep overriding the choice.
    setCabinetLang(l);
    if (leaveTo && l !== fixedLang) window.location.assign(leaveTo);
  };

  return (
    <>
      <ThemeSync />
      <PrefsCapsule lang={lang} pending={!fixedLang && live === null} langNote={langNote} onLang={onLang} />
    </>
  );
}
