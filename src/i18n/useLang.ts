// src/i18n/useLang.ts
"use client";

import { useSyncExternalStore } from "react";
import { detectLang, LANG_CHANGE_EVENT } from "./runtime";
import type { Lang } from "./dict";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(LANG_CHANGE_EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(LANG_CHANGE_EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function serverLang(): Lang {
  return "en";
}

/**
 * Current UI language for client components (LegalView on /terms and
 * /privacy). The server render and hydration are English, the pages' default
 * and what <html lang> says on the server; right after, it is the visitor's
 * language (runtime.detectLang), and it follows every LANG_CHANGE_EVENT.
 */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, detectLang, serverLang);
}
